using AnimeHub.Api.Models;
using AnimeHub.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace AnimeHub.Api.Controllers;

[ApiController]
[Route("api/anime")]
public class AnimeController : ControllerBase
{
    private readonly IAniListService _aniList;

    public AnimeController(IAniListService aniList)
    {
        _aniList = aniList;
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
}
