using System.Security.Claims;
using AnimeHub.Api.Models;
using AnimeHub.Api.Services;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Api.Controllers;

[ApiController]
[Route("api/anime")]
public class AnimeController : ControllerBase
{
    private readonly IAniListService _aniList;
    private readonly AppDbContext _db;

    public AnimeController(IAniListService aniList, AppDbContext db)
    {
        _aniList = aniList;
        _db = db;
    }

    [EnableRateLimiting("search")]
    [HttpGet("search")]
    public async Task<ActionResult<PagedResult<AnimeSearchItem>>> Search(
        [FromQuery] string q,
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 12,
        CancellationToken cancellationToken = default)
    {
        q = (q ?? "").Trim();
        if (q.Length < 2) return BadRequest(ApiError.Validation("Query must be at least 2 characters."));

        page = Math.Max(page, 1);
        perPage = Math.Clamp(perPage, 1, 25);

        try
        {
            return Ok(await _aniList.SearchAnimeAsync(q, page, perPage, cancellationToken));
        }
        catch (AniListRateLimitException ex)
        {
            Response.Headers.RetryAfter = "5";
            return StatusCode(StatusCodes.Status429TooManyRequests, ApiError.Upstream(ex.Message));
        }
        catch (AniListUpstreamException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, ApiError.Upstream(ex.Message));
        }
    }

    [HttpGet("{aniListId:int}")]
    public async Task<ActionResult<AnimeDetailsDto>> GetById(
        [FromRoute] int aniListId,
        CancellationToken cancellationToken = default)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("Invalid AniList ID."));

        try
        {
            var details = await _aniList.GetAnimeDetailsAsync(aniListId, cancellationToken);
            return details == null
                ? NotFound(ApiError.NotFound("Anime was not found."))
                : Ok(details);
        }
        catch (AniListRateLimitException ex)
        {
            Response.Headers.RetryAfter = "5";
            return StatusCode(StatusCodes.Status429TooManyRequests, ApiError.Upstream(ex.Message));
        }
        catch (AniListUpstreamException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, ApiError.Upstream(ex.Message));
        }
    }

    [Authorize]
    [EnableRateLimiting("search")]
    [HttpGet("recommendations")]
    public async Task<ActionResult<PagedResult<AnimeRecommendationItem>>> Recommendations(
        [FromQuery] int limit = 12,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 4, 24);
        var uid = CurrentUserId();
        if (uid == null) return Unauthorized(ApiError.Unauthorized("Not authenticated."));

        var tracked = await _db.TrackedShows
            .AsNoTracking()
            .Where(show => show.UserId == uid.Value)
            .ToListAsync(cancellationToken);

        var excluded = tracked.Select(show => show.AniListId).Distinct().ToList();
        var topGenres = tracked
            .SelectMany(show => SplitGenres(show.GenreCsv).Select(genre => new
            {
                Genre = genre,
                Weight = RecommendationWeight(show.TrackingStatus, show.PersonalRating, show.IsFavorite)
            }))
            .GroupBy(item => item.Genre, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Sum(item => item.Weight))
            .ThenBy(group => group.Key)
            .Select(group => group.Key)
            .Take(5)
            .ToList();

        var request = new AnimeDiscoveryRequest
        {
            Page = 1,
            PerPage = limit,
            Genres = topGenres.Count > 0 ? topGenres : null,
            ExcludedAniListIds = excluded,
            Sort = topGenres.Count > 0
                ? new List<string> { "SCORE_DESC", "TRENDING_DESC" }
                : new List<string> { "TRENDING_DESC", "POPULARITY_DESC" },
            MinAverageScore = topGenres.Count > 0 ? 68 : null
        };

        try
        {
            var result = await _aniList.DiscoverAnimeAsync(request, cancellationToken);
            foreach (var item in result.Items)
            {
                var matched = item.Genres
                    .Where(genre => topGenres.Contains(genre, StringComparer.OrdinalIgnoreCase))
                    .Take(2)
                    .ToList();
                item.RecommendationReason = matched.Count > 0
                    ? $"Because you like {string.Join(" and ", matched)}"
                    : "Trending with AnimeHub viewers";
            }

            return Ok(result);
        }
        catch (AniListRateLimitException ex)
        {
            Response.Headers.RetryAfter = "5";
            return StatusCode(StatusCodes.Status429TooManyRequests, ApiError.Upstream(ex.Message));
        }
        catch (AniListUpstreamException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, ApiError.Upstream(ex.Message));
        }
    }

    [EnableRateLimiting("search")]
    [HttpGet("discover")]
    public async Task<ActionResult<PagedResult<AnimeRecommendationItem>>> Discover(
        [FromQuery] string mode = "current",
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 18,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        perPage = Math.Clamp(perPage, 6, 30);
        var season = CurrentSeason(DateTime.UtcNow);
        var year = DateTime.UtcNow.Year;
        var normalizedMode = (mode ?? "current").Trim().ToLowerInvariant();

        if (normalizedMode == "next")
            (season, year) = NextSeason(season, year);

        var request = normalizedMode switch
        {
            "next" => new AnimeDiscoveryRequest
            {
                Page = page,
                PerPage = perPage,
                Season = season,
                SeasonYear = year,
                Sort = new List<string> { "POPULARITY_DESC" }
            },
            "top-airing" => new AnimeDiscoveryRequest
            {
                Page = page,
                PerPage = perPage,
                Status = "RELEASING",
                Sort = new List<string> { "TRENDING_DESC", "POPULARITY_DESC" }
            },
            "hidden-gems" => new AnimeDiscoveryRequest
            {
                Page = page,
                PerPage = perPage,
                Season = season,
                SeasonYear = year,
                Sort = new List<string> { "SCORE_DESC" },
                MinAverageScore = 72,
                MaxPopularity = 50000
            },
            _ => new AnimeDiscoveryRequest
            {
                Page = page,
                PerPage = perPage,
                Season = season,
                SeasonYear = year,
                Sort = new List<string> { "TRENDING_DESC", "POPULARITY_DESC" }
            }
        };

        try
        {
            return Ok(await _aniList.DiscoverAnimeAsync(request, cancellationToken));
        }
        catch (AniListRateLimitException ex)
        {
            Response.Headers.RetryAfter = "5";
            return StatusCode(StatusCodes.Status429TooManyRequests, ApiError.Upstream(ex.Message));
        }
        catch (AniListUpstreamException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, ApiError.Upstream(ex.Message));
        }
    }

    private Guid? CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(id, out var parsed) ? parsed : null;
    }

    private static int RecommendationWeight(string trackingStatus, int? rating, bool favorite)
    {
        var weight = 1;
        if (string.Equals(trackingStatus, "Completed", StringComparison.OrdinalIgnoreCase)) weight += 2;
        if (string.Equals(trackingStatus, "Watching", StringComparison.OrdinalIgnoreCase)) weight += 1;
        if (favorite) weight += 3;
        if (rating is >= 8) weight += 3;
        else if (rating is >= 6) weight += 1;
        return weight;
    }

    private static List<string> SplitGenres(string? genreCsv) =>
        string.IsNullOrWhiteSpace(genreCsv)
            ? new List<string>()
            : genreCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static string CurrentSeason(DateTime utcNow) =>
        utcNow.Month switch
        {
            1 or 2 or 3 => "WINTER",
            4 or 5 or 6 => "SPRING",
            7 or 8 or 9 => "SUMMER",
            _ => "FALL"
        };

    private static (string Season, int Year) NextSeason(string season, int year)
    {
        return season switch
        {
            "WINTER" => ("SPRING", year),
            "SPRING" => ("SUMMER", year),
            "SUMMER" => ("FALL", year),
            _ => ("WINTER", year + 1)
        };
    }
}
