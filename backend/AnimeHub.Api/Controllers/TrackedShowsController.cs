using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AnimeHub.Api.Models;
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
    private static readonly HashSet<string> ValidTrackingStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Watching",
        "Completed",
        "Paused",
        "Dropped",
        "PlanToWatch"
    };

    private readonly AppDbContext _db;
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public TrackedShowsController(AppDbContext db) => _db = db;

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

        var items = await _db.TrackedShows
            .AsNoTracking()
            .Where(x => x.UserId == uid)
            .ToListAsync();

        var filtered = ApplyFilters(items, q, trackingStatus, format, genre, season, customList, tag, year, favoritesOnly);
        var sorted = ApplySort(filtered, sort).Select(ToDto).ToList();

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

    [HttpDelete("{aniListId:int}")]
    public async Task<ActionResult> Untrack([FromRoute] int aniListId)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("AniListId is required."));

        var entity = await _db.TrackedShows
            .FirstOrDefaultAsync(x => x.UserId == CurrentUserId && x.AniListId == aniListId);

        if (entity == null)
            return NotFound(ApiError.NotFound("This show is not tracked."));

        _db.TrackedShows.Remove(entity);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] string format = "json")
    {
        var items = await _db.TrackedShows
            .AsNoTracking()
            .Where(x => x.UserId == CurrentUserId)
            .OrderBy(x => x.Title)
            .Select(x => ToDto(x))
            .ToListAsync();

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
    public async Task<ActionResult<ImportResultDto>> Import([FromBody] List<ImportTrackedShowRequest>? items)
    {
        if (items is null || items.Count == 0)
            return BadRequest(ApiError.Validation("Import file did not contain any tracked shows."));

        var uid = CurrentUserId;
        var existing = await _db.TrackedShows
            .Where(x => x.UserId == uid)
            .ToDictionaryAsync(x => x.AniListId);

        var created = 0;
        var updated = 0;

        foreach (var item in items)
        {
            var title = item.Title?.Trim();
            if (item.AniListId <= 0 || string.IsNullOrWhiteSpace(title))
                continue;

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
                created++;
            }
            else
            {
                updated++;
            }

            ApplyUpdate(entity, item);
        }

        await _db.SaveChangesAsync();

        return Ok(new ImportResultDto { Created = created, Updated = updated });
    }

    private static IEnumerable<TrackedShow> ApplyFilters(
        IEnumerable<TrackedShow> items,
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
        var query = items;

        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim();
            query = query.Where(x => x.Title.Contains(needle, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(trackingStatus) && !string.Equals(trackingStatus, "All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => string.Equals(x.TrackingStatus, trackingStatus, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(format) && !string.Equals(format, "All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => string.Equals(x.Format, format, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(genre) && !string.Equals(genre, "All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => SplitGenres(x.GenreCsv).Any(g => string.Equals(g, genre, StringComparison.OrdinalIgnoreCase)));

        if (!string.IsNullOrWhiteSpace(season) && !string.Equals(season, "All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => string.Equals(x.Season, season, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(customList) && !string.Equals(customList, "All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => string.Equals(x.CustomListName, customList, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(tag) && !string.Equals(tag, "All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => SplitTags(x.UserTagCsv).Any(t => string.Equals(t, tag, StringComparison.OrdinalIgnoreCase)));

        if (year is not null)
            query = query.Where(x => x.SeasonYear == year);

        if (favoritesOnly)
            query = query.Where(x => x.IsFavorite);

        return query;
    }

    private static IEnumerable<TrackedShow> ApplySort(IEnumerable<TrackedShow> items, string? sort)
    {
        return (sort ?? "recentlyAdded").Trim().ToLowerInvariant() switch
        {
            "title" => items.OrderBy(x => x.Title),
            "score" => items.OrderByDescending(x => x.AverageScore ?? -1).ThenBy(x => x.Title),
            "popularity" => items.OrderByDescending(x => x.Popularity ?? -1).ThenBy(x => x.Title),
            "nextepisode" => items.OrderBy(x => NextEpisodeSortValue(x)).ThenBy(x => x.Title),
            _ => items.OrderByDescending(x => x.CreatedUtc)
        };
    }

    private static int NextEpisodeSortValue(TrackedShow show)
    {
        if (show.Episodes is null || show.EpisodeProgress >= show.Episodes)
            return int.MaxValue;

        return Math.Max(1, show.EpisodeProgress + 1);
    }

    private static void ApplyUpdate(TrackedShow entity, UpdateTrackedShowRequest req)
    {
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
    }
}
