using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AnimeHub.Api.Models;
using AnimeHub.Api.Services;
using AnimeHub.Domain.Entities;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/tracked")]
public class TrackedShowsController : ControllerBase
{
    private const int AverageEpisodeMinutes = 24;

    private static readonly HashSet<string> ValidTrackingStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Watching",
        "Completed",
        "Paused",
        "Dropped",
        "PlanToWatch"
    };

    private readonly AppDbContext _db;
    private readonly IAniListService _aniList;
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public TrackedShowsController(AppDbContext db, IAniListService aniList)
    {
        _db = db;
        _aniList = aniList;
    }

    [HttpGet]
    public async Task<ActionResult<List<TrackedShowDto>>> GetAll(
        [FromQuery] string? q = null,
        [FromQuery] string? sort = "recentlyAdded",
        [FromQuery] string? trackingStatus = null,
        [FromQuery] string? format = null,
        [FromQuery] string? genre = null,
        [FromQuery] string? season = null,
        [FromQuery] string? customList = null,
        [FromQuery] string? tag = null,
        [FromQuery] int? year = null,
        [FromQuery] bool favoritesOnly = false)
    {
        var uid = CurrentUserId;

        var query = _db.TrackedShows
            .AsNoTracking()
            .Where(x => x.UserId == uid);

        query = ApplyFilters(query, q, trackingStatus, format, genre, season, customList, tag, year, favoritesOnly);
        var rows = await ApplySort(query, sort).ToListAsync();
        var sorted = rows.Select(ToDto).ToList();

        return Ok(sorted);
    }

    [HttpGet("{aniListId:int}")]
    public async Task<ActionResult<TrackedShowDto>> GetOne([FromRoute] int aniListId)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("AniListId is required."));

        var entity = await _db.TrackedShows
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == CurrentUserId && x.AniListId == aniListId);

        return entity == null
            ? NotFound(ApiError.NotFound("This show is not tracked."))
            : Ok(ToDto(entity));
    }

    [HttpGet("favorites")]
    public async Task<ActionResult<List<TrackedShowDto>>> GetFavorites()
    {
        var rows = await _db.TrackedShows
            .AsNoTracking()
            .Where(x => x.UserId == CurrentUserId && x.IsFavorite)
            .OrderBy(x => x.Title)
            .ToListAsync();

        return Ok(rows.Select(ToDto).ToList());
    }

    [HttpGet("most")]
    public async Task<ActionResult<List<MostTrackedShowDto>>> GetMostTracked([FromQuery] int limit = 4)
    {
        limit = Math.Clamp(limit, 1, 12);

        var rows = await _db.TrackedShows
            .AsNoTracking()
            .ToListAsync();

        var items = rows
            .GroupBy(x => x.AniListId)
            .Select(group =>
            {
                var latest = group
                    .OrderByDescending(x => x.CreatedUtc)
                    .First();

                return new MostTrackedShowDto
                {
                    AniListId = group.Key,
                    Title = latest.Title,
                    CoverImageUrl = latest.CoverImageUrl,
                    Format = latest.Format,
                    Status = latest.Status,
                    Episodes = latest.Episodes,
                    Season = latest.Season,
                    SeasonYear = latest.SeasonYear,
                    AverageScore = latest.AverageScore,
                    Popularity = latest.Popularity,
                    Genres = SplitGenres(latest.GenreCsv),
                    TrackedCount = group.Count()
                };
            })
            .OrderByDescending(x => x.TrackedCount)
            .ThenByDescending(x => x.Popularity ?? 0)
            .Take(limit)
            .ToList();

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<TrackedShowDto>> Track([FromBody] TrackShowRequest req)
    {
        if (req.AniListId <= 0) return BadRequest(ApiError.Validation("AniListId is required."));
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest(ApiError.Validation("Title is required."));

        var uid = CurrentUserId;

        var exists = await _db.TrackedShows.AnyAsync(x => x.UserId == uid && x.AniListId == req.AniListId);
        if (exists) return Conflict(ApiError.Conflict("This show is already tracked."));

        var entity = new TrackedShow
        {
            UserId = uid,
            AniListId = req.AniListId,
            Title = req.Title.Trim(),
            CoverImageUrl = req.CoverImageUrl,
            Format = req.Format,
            Status = req.Status,
            Episodes = req.Episodes,
            Season = req.Season,
            SeasonYear = req.SeasonYear,
            AverageScore = req.AverageScore,
            Popularity = req.Popularity,
            GenreCsv = JoinGenres(req.Genres),
            TrackingStatus = NormalizeTrackingStatus(req.TrackingStatus ?? "PlanToWatch"),
            EpisodeProgress = ClampEpisodeProgress(req.EpisodeProgress ?? 0, req.Episodes),
            PersonalRating = ClampRating(req.PersonalRating),
            IsFavorite = req.IsFavorite ?? false,
            Notes = NormalizeText(req.Notes),
            Review = NormalizeText(req.Review),
            CustomListName = NormalizeOptional(req.CustomListName, 80),
            UserTagCsv = JoinTags(NormalizeUserTags(req.UserTags)),
            RewatchCount = Math.Max(0, req.RewatchCount ?? 0),
            StartedOn = req.StartedOn,
            CompletedOn = req.CompletedOn
        };

        _db.TrackedShows.Add(entity);
        AddHistory(entity, "tracked", null, entity.TrackingStatus);
        AddEpisodeHistory(entity, 0, entity.EpisodeProgress);
        await _db.SaveChangesAsync();

        return Created($"/api/tracked/{entity.AniListId}", ToDto(entity));
    }

    [HttpPatch("{aniListId:int}")]
    public async Task<ActionResult<TrackedShowDto>> Update([FromRoute] int aniListId, [FromBody] UpdateTrackedShowRequest req)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("AniListId is required."));

        var entity = await _db.TrackedShows
            .FirstOrDefaultAsync(x => x.UserId == CurrentUserId && x.AniListId == aniListId);

        if (entity == null)
            return NotFound(ApiError.NotFound("This show is not tracked."));

        ApplyUpdate(entity, req);
        await _db.SaveChangesAsync();

        return Ok(ToDto(entity));
    }

    [HttpGet("history")]
    public async Task<ActionResult<List<TrackedShowHistoryDto>>> History(
        [FromQuery] int? aniListId = null,
        [FromQuery] int limit = 50)
    {
        limit = Math.Clamp(limit, 1, 120);

        var query = _db.TrackedShowHistory
            .AsNoTracking()
            .Where(x => x.UserId == CurrentUserId);

        if (aniListId is > 0)
            query = query.Where(x => x.AniListId == aniListId.Value);

        var rows = await query
            .OrderByDescending(x => x.CreatedUtc)
            .ThenByDescending(x => x.Id)
            .Take(limit)
            .Select(x => new TrackedShowHistoryDto
            {
                Id = x.Id,
                AniListId = x.AniListId,
                Title = x.Title,
                EventType = x.EventType,
                FromValue = x.FromValue,
                ToValue = x.ToValue,
                EpisodeNumber = x.EpisodeNumber,
                CreatedUtc = x.CreatedUtc
            })
            .ToListAsync();

        return Ok(rows);
    }

    [HttpGet("stats")]
    public async Task<ActionResult<TrackedStatsDto>> Stats()
    {
        var uid = CurrentUserId;
        var rows = await _db.TrackedShows
            .AsNoTracking()
            .Where(x => x.UserId == uid)
            .ToListAsync();

        var completedEvents = await _db.TrackedShowHistory
            .AsNoTracking()
            .Where(x => x.UserId == uid && x.EventType == "status_changed" && x.ToValue == "Completed")
            .ToListAsync();

        var ratingDistribution = rows
            .Where(x => x.PersonalRating.HasValue)
            .GroupBy(x => x.PersonalRating!.Value)
            .OrderBy(x => x.Key)
            .Select(x => new CountBucketDto { Label = x.Key.ToString(CultureInfo.InvariantCulture), Count = x.Count() })
            .ToList();

        var genreTrends = rows
            .SelectMany(x => SplitGenres(x.GenreCsv))
            .GroupBy(x => x, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(x => x.Count())
            .ThenBy(x => x.Key)
            .Take(10)
            .Select(x => new CountBucketDto { Label = x.Key, Count = x.Count() })
            .ToList();

        var completionEventYears = completedEvents
            .GroupBy(x => x.AniListId)
            .ToDictionary(x => x.Key, x => x.Min(e => e.CreatedUtc).Year);

        var completionYears = rows
            .Select(show =>
            {
                if (show.CompletedOn.HasValue)
                    return (int?)show.CompletedOn.Value.Year;

                return completionEventYears.TryGetValue(show.AniListId, out var year)
                    ? year
                    : null;
            })
            .Where(year => year.HasValue)
            .Select(year => year!.Value)
            .ToList();

        var yearlyCompletions = completionYears
            .GroupBy(x => x)
            .OrderBy(x => x.Key)
            .Select(x => new CountBucketDto { Label = x.Key.ToString(CultureInfo.InvariantCulture), Count = x.Count() })
            .ToList();

        var statusCounts = rows
            .GroupBy(x => x.TrackingStatus, StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x.Key)
            .Select(x => new CountBucketDto { Label = x.Key, Count = x.Count() })
            .ToList();

        var rated = rows.Where(x => x.PersonalRating.HasValue).Select(x => x.PersonalRating!.Value).ToList();
        var episodesWatched = rows.Sum(x => x.EpisodeProgress);
        var minutesWatched = episodesWatched * AverageEpisodeMinutes;

        return Ok(new TrackedStatsDto
        {
            TrackedCount = rows.Count,
            Favorites = rows.Count(x => x.IsFavorite),
            EpisodesWatched = episodesWatched,
            MinutesWatched = minutesWatched,
            HoursWatched = Math.Round(minutesWatched / 60.0, 1),
            AveragePersonalRating = rated.Count == 0 ? null : (double?)Math.Round(rated.Average(), 1),
            AverageAniListScore = rows.Any(x => x.AverageScore.HasValue)
                ? (double?)Math.Round(rows.Where(x => x.AverageScore.HasValue).Average(x => x.AverageScore!.Value))
                : null,
            RatingDistribution = ratingDistribution,
            GenreTrends = genreTrends,
            YearlyCompletions = yearlyCompletions,
            StatusCounts = statusCounts
        });
    }

    [HttpPost("bulk")]
    public async Task<ActionResult<BulkTrackedShowsResultDto>> BulkUpdate([FromBody] BulkTrackedShowsRequest req)
    {
        var ids = req.AniListIds
            .Where(id => id > 0)
            .Distinct()
            .Take(500)
            .ToList();

        if (ids.Count == 0)
            return BadRequest(ApiError.Validation("Select at least one tracked show."));

        var rows = await _db.TrackedShows
            .Where(x => x.UserId == CurrentUserId && ids.Contains(x.AniListId))
            .ToListAsync();

        if (rows.Count == 0)
            return NotFound(ApiError.NotFound("No selected tracked shows were found."));

        var deleted = 0;
        var updated = 0;

        if (req.Delete)
        {
            foreach (var show in rows)
            {
                AddHistory(show, "deleted", show.TrackingStatus, null);
            }

            _db.TrackedShows.RemoveRange(rows);
            deleted = rows.Count;
        }
        else
        {
            foreach (var show in rows)
            {
                var changed = false;
                if (!string.IsNullOrWhiteSpace(req.TrackingStatus))
                {
                    var previous = show.TrackingStatus;
                    show.TrackingStatus = NormalizeTrackingStatus(req.TrackingStatus);
                    if (!string.Equals(previous, show.TrackingStatus, StringComparison.Ordinal))
                    {
                        AddHistory(show, "status_changed", previous, show.TrackingStatus);
                        changed = true;
                    }
                }

                if (req.IsFavorite.HasValue && show.IsFavorite != req.IsFavorite.Value)
                {
                    AddHistory(show, "favorite_changed", show.IsFavorite.ToString(CultureInfo.InvariantCulture), req.IsFavorite.Value.ToString(CultureInfo.InvariantCulture));
                    show.IsFavorite = req.IsFavorite.Value;
                    changed = true;
                }

                if (changed)
                {
                    show.UpdatedUtc = DateTime.UtcNow;
                    updated++;
                }
            }
        }

        await _db.SaveChangesAsync();

        return Ok(new BulkTrackedShowsResultDto
        {
            Updated = updated,
            Deleted = deleted,
            Items = req.Delete ? new List<TrackedShowDto>() : rows.Select(ToDto).ToList()
        });
    }

    [HttpDelete("{aniListId:int}")]
    public async Task<ActionResult> Untrack([FromRoute] int aniListId)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("AniListId is required."));

        var entity = await _db.TrackedShows
            .FirstOrDefaultAsync(x => x.UserId == CurrentUserId && x.AniListId == aniListId);

        if (entity == null)
            return NotFound(ApiError.NotFound("This show is not tracked."));

        AddHistory(entity, "deleted", entity.TrackingStatus, null);
        _db.TrackedShows.Remove(entity);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] string format = "json", [FromQuery] List<int>? ids = null)
    {
        var query = _db.TrackedShows
            .AsNoTracking()
            .Where(x => x.UserId == CurrentUserId);

        var selectedIds = ids?
            .Where(id => id > 0)
            .Distinct()
            .Take(500)
            .ToList();

        if (selectedIds is { Count: > 0 })
            query = query.Where(x => selectedIds.Contains(x.AniListId));

        var rows = await query
            .OrderBy(x => x.Title)
            .ToListAsync();
        var items = rows.Select(ToDto).ToList();

        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csv = BuildCsv(items);
            return File(Encoding.UTF8.GetBytes(csv), "text/csv", "animehub-tracked.csv");
        }

        var json = JsonSerializer.Serialize(items, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        });
        return File(Encoding.UTF8.GetBytes(json), "application/json", "animehub-tracked.json");
    }

    [EnableRateLimiting("imports")]
    [HttpPost("import")]
    public async Task<ActionResult<ImportResultDto>> Import(
        [FromBody] JsonElement body,
        CancellationToken cancellationToken = default)
    {
        var items = NormalizeImportItems(body);
        if (items is null || items.Count == 0)
            return BadRequest(ApiError.Validation("Import file did not contain any tracked shows."));

        try
        {
            await ResolveMissingAniListIdsAsync(items, cancellationToken);
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

        var uid = CurrentUserId;
        var existing = await _db.TrackedShows
            .Where(x => x.UserId == uid)
            .ToDictionaryAsync(x => x.AniListId, cancellationToken);

        var created = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var item in items)
        {
            var title = item.Title?.Trim();
            if (item.AniListId <= 0 || string.IsNullOrWhiteSpace(title))
            {
                skipped++;
                continue;
            }

            if (!existing.TryGetValue(item.AniListId, out var entity))
            {
                entity = new TrackedShow
                {
                    UserId = uid,
                    AniListId = item.AniListId,
                    Title = title,
                    CreatedUtc = DateTime.UtcNow
                };
                _db.TrackedShows.Add(entity);
                existing[item.AniListId] = entity;
                AddHistory(entity, "tracked", null, entity.TrackingStatus);
                created++;
            }
            else
            {
                updated++;
            }

            ApplyUpdate(entity, item);
        }

        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new ImportResultDto { Created = created, Updated = updated, Skipped = skipped });
    }

    private async Task ResolveMissingAniListIdsAsync(
        List<ImportTrackedShowRequest> items,
        CancellationToken cancellationToken)
    {
        var malIds = items
            .Where(x => x.AniListId <= 0 && x.MalId is > 0)
            .Select(x => x.MalId!.Value)
            .Distinct()
            .ToList();

        if (malIds.Count == 0)
            return;

        var resolved = await _aniList.ResolveMalIdsAsync(malIds, cancellationToken);
        foreach (var item in items.Where(x => x.AniListId <= 0 && x.MalId is > 0))
        {
            if (resolved.TryGetValue(item.MalId!.Value, out var aniListId))
                item.AniListId = aniListId;
        }
    }

    private static List<ImportTrackedShowRequest> NormalizeImportItems(JsonElement body)
    {
        if (body.ValueKind == JsonValueKind.Object)
        {
            if (TryGetProperty(body, "items", out var items) && items.ValueKind == JsonValueKind.Array)
                body = items;
            else if (TryGetProperty(body, "lists", out var lists) && lists.ValueKind == JsonValueKind.Array)
            {
                var normalized = new List<ImportTrackedShowRequest>();
                foreach (var list in lists.EnumerateArray())
                {
                    var listName = GetString(list, "name") ?? GetString(list, "status");
                    if (!TryGetProperty(list, "entries", out var entries) || entries.ValueKind != JsonValueKind.Array)
                        continue;

                    foreach (var entry in entries.EnumerateArray())
                    {
                        var parsed = ParseImportItem(entry);
                        if (parsed == null) continue;
                        if (string.IsNullOrWhiteSpace(parsed.CustomListName) && !string.IsNullOrWhiteSpace(listName))
                            parsed.CustomListName = listName;
                        normalized.Add(parsed);
                    }
                }

                return normalized;
            }
            else if (TryGetProperty(body, "MediaListCollection", out var collection))
                return NormalizeImportItems(collection);
            else if (TryGetProperty(body, "data", out var data))
                return NormalizeImportItems(data);
            else if (TryGetProperty(body, "anime", out var anime) && anime.ValueKind == JsonValueKind.Array)
                body = anime;
        }

        if (body.ValueKind != JsonValueKind.Array)
            return new List<ImportTrackedShowRequest>();

        return body.EnumerateArray()
            .Select(ParseImportItem)
            .Where(item => item != null)
            .Cast<ImportTrackedShowRequest>()
            .ToList();
    }

    private static ImportTrackedShowRequest? ParseImportItem(JsonElement item)
    {
        if (item.ValueKind != JsonValueKind.Object)
            return null;

        TryGetProperty(item, "media", out var media);
        var mediaObject = media.ValueKind == JsonValueKind.Object ? media : default;

        var malId = GetInt(item, "malId")
            ?? GetInt(mediaObject, "idMal")
            ?? GetInt(item, "series_animedb_id");

        var aniListId = GetInt(item, "aniListId")
            ?? GetInt(item, "mediaId")
            ?? GetInt(mediaObject, "id");

        if (aniListId is null && malId is null)
            aniListId = GetInt(item, "id");

        var title = GetString(item, "title")
            ?? GetString(item, "series_title")
            ?? GetString(item, "anime_title")
            ?? GetNestedTitle(mediaObject);

        if (((aniListId is null || aniListId <= 0) && (malId is null || malId <= 0)) || string.IsNullOrWhiteSpace(title))
            return null;

        var req = new ImportTrackedShowRequest
        {
            AniListId = aniListId ?? 0,
            MalId = malId,
            Title = title,
            TrackingStatus = NormalizeImportStatus(
                GetString(item, "trackingStatus")
                ?? GetString(item, "status")
                ?? GetString(item, "my_status")
                ?? GetString(item, "list_status"))
        };

        var coverImageUrl = GetString(item, "coverImageUrl") ?? GetNestedCover(mediaObject);
        if (coverImageUrl != null) req.CoverImageUrl = coverImageUrl;
        var format = GetString(item, "format") ?? GetString(mediaObject, "format") ?? GetString(item, "series_type");
        if (format != null) req.Format = format;
        var mediaStatus = GetString(item, "mediaStatus") ?? GetString(mediaObject, "status");
        if (mediaStatus != null) req.Status = mediaStatus;
        var episodes = GetInt(item, "episodes") ?? GetInt(mediaObject, "episodes") ?? GetInt(item, "series_episodes");
        if (episodes.HasValue) req.Episodes = episodes;
        var season = GetString(item, "season") ?? GetString(mediaObject, "season");
        if (season != null) req.Season = season;
        var seasonYear = GetInt(item, "seasonYear") ?? GetInt(mediaObject, "seasonYear");
        if (seasonYear.HasValue) req.SeasonYear = seasonYear;
        var averageScore = GetInt(item, "averageScore") ?? GetInt(mediaObject, "averageScore");
        if (averageScore.HasValue) req.AverageScore = averageScore;
        var popularity = GetInt(item, "popularity") ?? GetInt(mediaObject, "popularity");
        if (popularity.HasValue) req.Popularity = popularity;
        var genres = GetStringList(item, "genres") ?? GetStringList(mediaObject, "genres");
        if (genres != null) req.Genres = genres;
        var episodeProgress = GetInt(item, "episodeProgress") ?? GetInt(item, "progress") ?? GetInt(item, "my_watched_episodes") ?? GetInt(item, "watched_episodes");
        if (episodeProgress.HasValue) req.EpisodeProgress = episodeProgress;
        var personalRating = NormalizeImportedRating(GetNumber(item, "personalRating") ?? GetNumber(item, "score") ?? GetNumber(item, "my_score"));
        if (personalRating.HasValue) req.PersonalRating = personalRating;
        var isFavorite = GetBool(item, "isFavorite") ?? GetBool(item, "favorite");
        if (isFavorite.HasValue) req.IsFavorite = isFavorite;
        var rewatchCount = GetInt(item, "rewatchCount") ?? GetInt(item, "repeat") ?? GetInt(item, "my_times_watched");
        if (rewatchCount.HasValue) req.RewatchCount = rewatchCount;
        var startedOn = GetDate(item, "startedOn") ?? GetDate(item, "startedAt") ?? GetDate(item, "started_at") ?? GetDate(item, "my_start_date");
        if (startedOn.HasValue) req.StartedOn = startedOn;
        var completedOn = GetDate(item, "completedOn") ?? GetDate(item, "completedAt") ?? GetDate(item, "completed_at") ?? GetDate(item, "my_finish_date");
        if (completedOn.HasValue) req.CompletedOn = completedOn;
        var customListName = GetString(item, "customListName") ?? GetString(item, "listName");
        if (customListName != null) req.CustomListName = customListName;
        var userTags = GetStringList(item, "userTags") ?? GetStringList(item, "tags");
        if (userTags != null) req.UserTags = userTags;
        var notes = GetString(item, "notes") ?? GetString(item, "my_comments");
        if (notes != null) req.Notes = notes;
        var review = GetString(item, "review");
        if (review != null) req.Review = review;

        return req;
    }

    private static string NormalizeImportStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "PlanToWatch";

        return value.Trim().ToUpperInvariant() switch
        {
            "CURRENT" or "WATCHING" => "Watching",
            "COMPLETED" => "Completed",
            "PAUSED" or "ON-HOLD" or "ON_HOLD" => "Paused",
            "DROPPED" => "Dropped",
            "PLANNING" or "PLAN TO WATCH" or "PLAN_TO_WATCH" or "PLANTOWATCH" => "PlanToWatch",
            _ => NormalizeTrackingStatus(value)
        };
    }

    private static int? NormalizeImportedRating(double? value)
    {
        if (value is null)
            return null;

        return value > 10
            ? Math.Clamp((int)Math.Round(value.Value / 10.0), 0, 10)
            : Math.Clamp((int)Math.Round(value.Value), 0, 10);
    }

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
    {
        value = default;
        if (element.ValueKind != JsonValueKind.Object)
            return false;

        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        return false;
    }

    private static string? GetString(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return null;

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null
        };
    }

    private static int? GetInt(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return null;

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
            return number;

        return value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out number)
            ? number
            : null;
    }

    private static double? GetNumber(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return null;

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number))
            return number;

        return value.ValueKind == JsonValueKind.String && double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out number)
            ? number
            : null;
    }

    private static bool? GetBool(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return null;

        if (value.ValueKind is JsonValueKind.True or JsonValueKind.False)
            return value.GetBoolean();

        return value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var parsed)
            ? parsed
            : null;
    }

    private static DateOnly? GetDate(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var dateValue))
            return null;

        if (dateValue.ValueKind == JsonValueKind.Object)
        {
            var year = GetInt(dateValue, "year");
            if (year is null or <= 0)
                return null;

            var month = Math.Clamp(GetInt(dateValue, "month") ?? 1, 1, 12);
            var maxDay = DateTime.DaysInMonth(year.Value, month);
            var day = Math.Clamp(GetInt(dateValue, "day") ?? 1, 1, maxDay);
            return new DateOnly(year.Value, month, day);
        }

        var value = dateValue.ValueKind == JsonValueKind.String ? dateValue.GetString() : dateValue.GetRawText();
        if (string.IsNullOrWhiteSpace(value) || value == "0000-00-00")
            return null;

        return DateOnly.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : null;
    }

    private static List<string>? GetStringList(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return null;

        if (value.ValueKind == JsonValueKind.Array)
        {
            return value.EnumerateArray()
                .Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : item.GetRawText())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Select(item => item!)
                .ToList();
        }

        if (value.ValueKind == JsonValueKind.String)
        {
            return value.GetString()?
                .Split(new[] { ',', '|', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
        }

        return null;
    }

    private static string? GetNestedTitle(JsonElement media)
    {
        if (!TryGetProperty(media, "title", out var title))
            return null;

        if (title.ValueKind == JsonValueKind.String)
            return title.GetString();

        return GetString(title, "english")
            ?? GetString(title, "romaji")
            ?? GetString(title, "userPreferred")
            ?? GetString(title, "native");
    }

    private static string? GetNestedCover(JsonElement media)
    {
        if (!TryGetProperty(media, "coverImage", out var cover))
            return null;

        return GetString(cover, "extraLarge") ?? GetString(cover, "large") ?? GetString(cover, "medium");
    }

    private static IQueryable<TrackedShow> ApplyFilters(
        IQueryable<TrackedShow> query,
        string? q,
        string? trackingStatus,
        string? format,
        string? genre,
        string? season,
        string? customList,
        string? tag,
        int? year,
        bool favoritesOnly)
    {
        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim();
            query = query.Where(x => EF.Functions.ILike(x.Title, $"%{needle}%"));
        }

        if (!string.IsNullOrWhiteSpace(trackingStatus) && !string.Equals(trackingStatus, "All", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = NormalizeTrackingStatus(trackingStatus);
            query = query.Where(x => x.TrackingStatus == normalized);
        }

        if (!string.IsNullOrWhiteSpace(format) && !string.Equals(format, "All", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = format.Trim();
            query = query.Where(x => x.Format != null && EF.Functions.ILike(x.Format, normalized));
        }

        if (!string.IsNullOrWhiteSpace(genre) && !string.Equals(genre, "All", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = genre.Trim();
            query = query.Where(x => x.GenreCsv != null && EF.Functions.ILike("," + x.GenreCsv + ",", "%," + normalized + ",%"));
        }

        if (!string.IsNullOrWhiteSpace(season) && !string.Equals(season, "All", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = season.Trim();
            query = query.Where(x => x.Season != null && EF.Functions.ILike(x.Season, normalized));
        }

        if (!string.IsNullOrWhiteSpace(customList) && !string.Equals(customList, "All", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = customList.Trim();
            query = query.Where(x => x.CustomListName != null && EF.Functions.ILike(x.CustomListName, normalized));
        }

        if (!string.IsNullOrWhiteSpace(tag) && !string.Equals(tag, "All", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = NormalizeUserTags(new[] { tag }).FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(normalized))
                query = query.Where(x => x.UserTagCsv != null && ("," + x.UserTagCsv + ",").Contains("," + normalized + ","));
        }

        if (year is not null)
            query = query.Where(x => x.SeasonYear == year);

        if (favoritesOnly)
            query = query.Where(x => x.IsFavorite);

        return query;
    }

    private static IQueryable<TrackedShow> ApplySort(IQueryable<TrackedShow> query, string? sort)
    {
        return (sort ?? "recentlyAdded").Trim().ToLowerInvariant() switch
        {
            "title" => query.OrderBy(x => x.Title),
            "score" => query.OrderByDescending(x => x.AverageScore ?? -1).ThenBy(x => x.Title),
            "popularity" => query.OrderByDescending(x => x.Popularity ?? -1).ThenBy(x => x.Title),
            "nextepisode" => query
                .OrderBy(x => x.Episodes != null && x.EpisodeProgress < x.Episodes ? x.EpisodeProgress + 1 : int.MaxValue)
                .ThenBy(x => x.Title),
            _ => query.OrderByDescending(x => x.CreatedUtc)
        };
    }

    private void ApplyUpdate(TrackedShow entity, UpdateTrackedShowRequest req)
    {
        var previousStatus = entity.TrackingStatus;
        var previousProgress = entity.EpisodeProgress;

        if (req.Title != null && !string.IsNullOrWhiteSpace(req.Title)) entity.Title = req.Title.Trim();
        if (req.CoverImageUrlSet) entity.CoverImageUrl = req.CoverImageUrl;
        if (req.FormatSet) entity.Format = req.Format;
        if (req.StatusSet) entity.Status = req.Status;
        if (req.EpisodesSet) entity.Episodes = req.Episodes;
        if (req.SeasonSet) entity.Season = req.Season;
        if (req.SeasonYearSet) entity.SeasonYear = req.SeasonYear;
        if (req.AverageScoreSet) entity.AverageScore = req.AverageScore;
        if (req.PopularitySet) entity.Popularity = req.Popularity;
        if (req.GenresSet) entity.GenreCsv = JoinGenres(req.Genres);

        if (req.TrackingStatus != null) entity.TrackingStatus = NormalizeTrackingStatus(req.TrackingStatus);
        if (req.EpisodeProgressSet) entity.EpisodeProgress = ClampEpisodeProgress(req.EpisodeProgress ?? 0, entity.Episodes);
        if (req.PersonalRatingSet) entity.PersonalRating = ClampRating(req.PersonalRating);
        if (req.IsFavoriteSet) entity.IsFavorite = req.IsFavorite ?? false;
        if (req.NotesSet) entity.Notes = NormalizeText(req.Notes);
        if (req.ReviewSet) entity.Review = NormalizeText(req.Review);
        if (req.CustomListNameSet) entity.CustomListName = NormalizeOptional(req.CustomListName, 80);
        if (req.UserTagsSet) entity.UserTagCsv = JoinTags(NormalizeUserTags(req.UserTags));
        if (req.RewatchCountSet) entity.RewatchCount = Math.Max(0, req.RewatchCount ?? 0);
        if (req.StartedOnSet) entity.StartedOn = req.StartedOn;
        if (req.CompletedOnSet) entity.CompletedOn = req.CompletedOn;

        entity.UpdatedUtc = DateTime.UtcNow;

        if (!string.Equals(previousStatus, entity.TrackingStatus, StringComparison.Ordinal))
            AddHistory(entity, "status_changed", previousStatus, entity.TrackingStatus);

        AddEpisodeHistory(entity, previousProgress, entity.EpisodeProgress);
    }

    private void AddHistory(TrackedShow show, string eventType, string? fromValue, string? toValue, int? episodeNumber = null)
    {
        _db.TrackedShowHistory.Add(new TrackedShowHistory
        {
            UserId = show.UserId,
            AniListId = show.AniListId,
            Title = show.Title,
            EventType = eventType,
            FromValue = fromValue,
            ToValue = toValue,
            EpisodeNumber = episodeNumber,
            CreatedUtc = DateTime.UtcNow
        });
    }

    private void AddEpisodeHistory(TrackedShow show, int previousProgress, int currentProgress)
    {
        if (currentProgress <= previousProgress)
            return;

        var completedEpisodes = currentProgress - previousProgress;
        if (completedEpisodes > 100)
        {
            AddHistory(
                show,
                "episode_progress",
                previousProgress.ToString(CultureInfo.InvariantCulture),
                currentProgress.ToString(CultureInfo.InvariantCulture));
            return;
        }

        for (var episode = previousProgress + 1; episode <= currentProgress; episode++)
        {
            AddHistory(
                show,
                "episode_completed",
                null,
                episode.ToString(CultureInfo.InvariantCulture),
                episode);
        }
    }

    private static string NormalizeTrackingStatus(string value)
    {
        var normalized = value.Trim().Replace(" ", "", StringComparison.OrdinalIgnoreCase);

        if (string.Equals(normalized, "Plantowatch", StringComparison.OrdinalIgnoreCase))
            normalized = "PlanToWatch";

        if (!ValidTrackingStatuses.Contains(normalized))
            return "PlanToWatch";

        return ValidTrackingStatuses.First(x => string.Equals(x, normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static int ClampEpisodeProgress(int value, int? episodes)
    {
        var max = episodes is > 0 ? episodes.Value : int.MaxValue;
        return Math.Clamp(value, 0, max);
    }

    private static int? ClampRating(int? value) =>
        value is null ? null : Math.Clamp(value.Value, 0, 10);

    private static string? NormalizeText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeOptional(string? value, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed)) return null;
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private static string? JoinGenres(IEnumerable<string>? genres)
    {
        var clean = genres?
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToList();

        return clean is { Count: > 0 } ? string.Join(",", clean) : null;
    }

    private static List<string> SplitGenres(string? genreCsv) =>
        string.IsNullOrWhiteSpace(genreCsv)
            ? new List<string>()
            : genreCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static List<string> NormalizeUserTags(IEnumerable<string>? tags)
    {
        return (tags ?? Array.Empty<string>())
            .Select(x => x.Trim().TrimStart('#').ToLowerInvariant())
            .Where(x => x.Length is > 0 and <= 40)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToList();
    }

    private static string? JoinTags(IEnumerable<string> tags)
    {
        var clean = tags.ToList();
        return clean.Count == 0 ? null : string.Join(",", clean);
    }

    private static List<string> SplitTags(string? tagCsv) =>
        string.IsNullOrWhiteSpace(tagCsv)
            ? new List<string>()
            : tagCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static TrackedShowDto ToDto(TrackedShow x) => new()
    {
        Id = x.Id,
        AniListId = x.AniListId,
        Title = x.Title,
        CoverImageUrl = x.CoverImageUrl,
        Format = x.Format,
        Status = x.Status,
        Episodes = x.Episodes,
        Season = x.Season,
        SeasonYear = x.SeasonYear,
        AverageScore = x.AverageScore,
        Popularity = x.Popularity,
        Genres = SplitGenres(x.GenreCsv),
        TrackingStatus = x.TrackingStatus,
        EpisodeProgress = x.EpisodeProgress,
        PersonalRating = x.PersonalRating,
        IsFavorite = x.IsFavorite,
        Notes = x.Notes,
        Review = x.Review,
        CustomListName = x.CustomListName,
        UserTags = SplitTags(x.UserTagCsv),
        RewatchCount = x.RewatchCount,
        StartedOn = x.StartedOn,
        CompletedOn = x.CompletedOn,
        CreatedUtc = x.CreatedUtc,
        UpdatedUtc = x.UpdatedUtc,
        NextEpisode = x.Episodes is > 0 && x.EpisodeProgress < x.Episodes ? x.EpisodeProgress + 1 : null
    };

    private static string BuildCsv(IEnumerable<TrackedShowDto> items)
    {
        var sb = new StringBuilder();
        sb.AppendLine("aniListId,title,trackingStatus,episodeProgress,episodes,personalRating,isFavorite,rewatchCount,startedOn,completedOn,format,status,season,seasonYear,averageScore,popularity,genres,customListName,userTags,notes,review");

        foreach (var item in items)
        {
            var cells = new[]
            {
                item.AniListId.ToString(CultureInfo.InvariantCulture),
                item.Title,
                item.TrackingStatus,
                item.EpisodeProgress.ToString(CultureInfo.InvariantCulture),
                item.Episodes?.ToString(CultureInfo.InvariantCulture) ?? "",
                item.PersonalRating?.ToString(CultureInfo.InvariantCulture) ?? "",
                item.IsFavorite.ToString(CultureInfo.InvariantCulture),
                item.RewatchCount.ToString(CultureInfo.InvariantCulture),
                item.StartedOn?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "",
                item.CompletedOn?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "",
                item.Format ?? "",
                item.Status ?? "",
                item.Season ?? "",
                item.SeasonYear?.ToString(CultureInfo.InvariantCulture) ?? "",
                item.AverageScore?.ToString(CultureInfo.InvariantCulture) ?? "",
                item.Popularity?.ToString(CultureInfo.InvariantCulture) ?? "",
                string.Join("|", item.Genres),
                item.CustomListName ?? "",
                string.Join("|", item.UserTags),
                item.Notes ?? "",
                item.Review ?? ""
            };

            sb.AppendLine(string.Join(",", cells.Select(EscapeCsv)));
        }

        return sb.ToString();
    }

    private static string EscapeCsv(string value)
    {
        if (!value.Contains(',') && !value.Contains('"') && !value.Contains('\n') && !value.Contains('\r'))
            return value;

        return $"\"{value.Replace("\"", "\"\"")}\"";
    }

    public sealed class TrackShowRequest : UpdateTrackedShowRequest
    {
        public int AniListId { get; set; }
    }

    public class UpdateTrackedShowRequest
    {
        public string? Title { get; set; }
        private string? _coverImageUrl;
        public string? CoverImageUrl { get => _coverImageUrl; set { _coverImageUrl = value; CoverImageUrlSet = true; } }
        [JsonIgnore] public bool CoverImageUrlSet { get; private set; }
        private string? _format;
        public string? Format { get => _format; set { _format = value; FormatSet = true; } }
        [JsonIgnore] public bool FormatSet { get; private set; }
        private string? _status;
        public string? Status { get => _status; set { _status = value; StatusSet = true; } }
        [JsonIgnore] public bool StatusSet { get; private set; }
        private int? _episodes;
        public int? Episodes { get => _episodes; set { _episodes = value; EpisodesSet = true; } }
        [JsonIgnore] public bool EpisodesSet { get; private set; }
        private string? _season;
        public string? Season { get => _season; set { _season = value; SeasonSet = true; } }
        [JsonIgnore] public bool SeasonSet { get; private set; }
        private int? _seasonYear;
        public int? SeasonYear { get => _seasonYear; set { _seasonYear = value; SeasonYearSet = true; } }
        [JsonIgnore] public bool SeasonYearSet { get; private set; }
        private int? _averageScore;
        public int? AverageScore { get => _averageScore; set { _averageScore = value; AverageScoreSet = true; } }
        [JsonIgnore] public bool AverageScoreSet { get; private set; }
        private int? _popularity;
        public int? Popularity { get => _popularity; set { _popularity = value; PopularitySet = true; } }
        [JsonIgnore] public bool PopularitySet { get; private set; }
        private List<string>? _genres;
        public List<string>? Genres { get => _genres; set { _genres = value; GenresSet = true; } }
        [JsonIgnore] public bool GenresSet { get; private set; }
        public string? TrackingStatus { get; set; }
        private int? _episodeProgress;
        public int? EpisodeProgress { get => _episodeProgress; set { _episodeProgress = value; EpisodeProgressSet = true; } }
        [JsonIgnore] public bool EpisodeProgressSet { get; private set; }
        private int? _personalRating;
        public int? PersonalRating { get => _personalRating; set { _personalRating = value; PersonalRatingSet = true; } }
        [JsonIgnore] public bool PersonalRatingSet { get; private set; }
        private bool? _isFavorite;
        public bool? IsFavorite { get => _isFavorite; set { _isFavorite = value; IsFavoriteSet = true; } }
        [JsonIgnore] public bool IsFavoriteSet { get; private set; }
        private string? _notes;
        public string? Notes { get => _notes; set { _notes = value; NotesSet = true; } }
        [JsonIgnore] public bool NotesSet { get; private set; }
        private string? _review;
        public string? Review { get => _review; set { _review = value; ReviewSet = true; } }
        [JsonIgnore] public bool ReviewSet { get; private set; }
        private string? _customListName;
        public string? CustomListName { get => _customListName; set { _customListName = value; CustomListNameSet = true; } }
        [JsonIgnore] public bool CustomListNameSet { get; private set; }
        private List<string>? _userTags;
        public List<string>? UserTags { get => _userTags; set { _userTags = value; UserTagsSet = true; } }
        [JsonIgnore] public bool UserTagsSet { get; private set; }
        private int? _rewatchCount;
        public int? RewatchCount { get => _rewatchCount; set { _rewatchCount = value; RewatchCountSet = true; } }
        [JsonIgnore] public bool RewatchCountSet { get; private set; }
        private DateOnly? _startedOn;
        public DateOnly? StartedOn { get => _startedOn; set { _startedOn = value; StartedOnSet = true; } }
        [JsonIgnore] public bool StartedOnSet { get; private set; }
        private DateOnly? _completedOn;
        public DateOnly? CompletedOn { get => _completedOn; set { _completedOn = value; CompletedOnSet = true; } }
        [JsonIgnore] public bool CompletedOnSet { get; private set; }
    }

    public sealed class ImportTrackedShowRequest : UpdateTrackedShowRequest
    {
        public int AniListId { get; set; }
        public int? MalId { get; set; }
    }

    public sealed class BulkTrackedShowsRequest
    {
        public List<int> AniListIds { get; set; } = new();
        public string? TrackingStatus { get; set; }
        public bool? IsFavorite { get; set; }
        public bool Delete { get; set; }
    }

    public sealed class BulkTrackedShowsResultDto
    {
        public int Updated { get; set; }
        public int Deleted { get; set; }
        public List<TrackedShowDto> Items { get; set; } = new();
    }

    public sealed class TrackedShowHistoryDto
    {
        public Guid Id { get; set; }
        public int AniListId { get; set; }
        public string Title { get; set; } = "";
        public string EventType { get; set; } = "";
        public string? FromValue { get; set; }
        public string? ToValue { get; set; }
        public int? EpisodeNumber { get; set; }
        public DateTime CreatedUtc { get; set; }
    }

    public sealed class TrackedStatsDto
    {
        public int TrackedCount { get; set; }
        public int Favorites { get; set; }
        public int EpisodesWatched { get; set; }
        public int MinutesWatched { get; set; }
        public double HoursWatched { get; set; }
        public double? AveragePersonalRating { get; set; }
        public double? AverageAniListScore { get; set; }
        public List<CountBucketDto> RatingDistribution { get; set; } = new();
        public List<CountBucketDto> GenreTrends { get; set; } = new();
        public List<CountBucketDto> YearlyCompletions { get; set; } = new();
        public List<CountBucketDto> StatusCounts { get; set; } = new();
    }

    public sealed class CountBucketDto
    {
        public string Label { get; set; } = "";
        public int Count { get; set; }
    }

    public sealed class TrackedShowDto
    {
        public Guid Id { get; set; }
        public int AniListId { get; set; }
        public string Title { get; set; } = "";
        public string? CoverImageUrl { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public int? Episodes { get; set; }
        public string? Season { get; set; }
        public int? SeasonYear { get; set; }
        public int? AverageScore { get; set; }
        public int? Popularity { get; set; }
        public List<string> Genres { get; set; } = new();
        public string TrackingStatus { get; set; } = "PlanToWatch";
        public int EpisodeProgress { get; set; }
        public int? NextEpisode { get; set; }
        public int? PersonalRating { get; set; }
        public bool IsFavorite { get; set; }
        public string? Notes { get; set; }
        public string? Review { get; set; }
        public string? CustomListName { get; set; }
        public List<string> UserTags { get; set; } = new();
        public int RewatchCount { get; set; }
        public DateOnly? StartedOn { get; set; }
        public DateOnly? CompletedOn { get; set; }
        public DateTime CreatedUtc { get; set; }
        public DateTime? UpdatedUtc { get; set; }
    }

    public sealed class MostTrackedShowDto
    {
        public int AniListId { get; set; }
        public string Title { get; set; } = "";
        public string? CoverImageUrl { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public int? Episodes { get; set; }
        public string? Season { get; set; }
        public int? SeasonYear { get; set; }
        public int? AverageScore { get; set; }
        public int? Popularity { get; set; }
        public List<string> Genres { get; set; } = new();
        public int TrackedCount { get; set; }
    }

    public sealed class ImportResultDto
    {
        public int Created { get; set; }
        public int Updated { get; set; }
        public int Skipped { get; set; }
    }
}
