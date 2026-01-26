using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/schedule")]
public class ScheduleController : ControllerBase
{
    private const string AniListEndpoint = "https://graphql.anilist.co";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly AppDbContext _db;
    private readonly ILogger<ScheduleController> _logger;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public ScheduleController(IHttpClientFactory httpClientFactory, AppDbContext db, ILogger<ScheduleController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _logger = logger;
    }

    [HttpGet("week")]
    public async Task<ActionResult<List<ScheduleItemDto>>> GetWeek(
        [FromQuery] string? start = null,
        [FromQuery] int days = 7,
        [FromQuery] bool trackedOnly = false)
    {
        days = Math.Clamp(days, 1, 14);

        var startDate =
            string.IsNullOrWhiteSpace(start)
                ? DateOnly.FromDateTime(DateTime.UtcNow)
                : DateOnly.Parse(start);

        var startUtc = startDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var endUtc = startUtc.AddDays(days);

        var startUnix = (int)new DateTimeOffset(startUtc).ToUnixTimeSeconds();
        var endUnix = (int)new DateTimeOffset(endUtc).ToUnixTimeSeconds();

        List<int>? trackedIds = null;
        if (trackedOnly)
        {
            trackedIds = await _db.TrackedShows
                .Where(x => x.UserId == CurrentUserId)
                .Select(x => x.AniListId)
                .ToListAsync();

            if (trackedIds.Count == 0)
                return Ok(new List<ScheduleItemDto>());
        }

        // Use different queries so we never send mediaId_in: null
        const string globalQuery = @"
query ($page:Int,$perPage:Int,$start:Int,$end:Int) {
  Page(page:$page, perPage:$perPage) {
    airingSchedules(
      airingAt_greater:$start,
      airingAt_lesser:$end,
      sort:TIME
    ) {
      airingAt
      episode
      timeUntilAiring
      media {
        id
        format
        status
        isAdult
        title { romaji english native }
        coverImage { large medium }
      }
    }
  }
}";

        const string trackedQuery = @"
query ($page:Int,$perPage:Int,$start:Int,$end:Int,$mediaIds:[Int]) {
  Page(page:$page, perPage:$perPage) {
    airingSchedules(
      airingAt_greater:$start,
      airingAt_lesser:$end,
      mediaId_in:$mediaIds,
      sort:TIME
    ) {
      airingAt
      episode
      timeUntilAiring
      media {
        id
        format
        status
        isAdult
        title { romaji english native }
        coverImage { large medium }
      }
    }
  }
}";

        object payload = trackedOnly
            ? new
            {
                query = trackedQuery,
                variables = new
                {
                    page = 1,
                    perPage = 200,
                    start = startUnix,
                    end = endUnix,
                    mediaIds = trackedIds
                }
            }
            : new
            {
                query = globalQuery,
                variables = new
                {
                    page = 1,
                    perPage = 200,
                    start = startUnix,
                    end = endUnix
                }
            };

        var client = _httpClientFactory.CreateClient("AniList");

        // Small retry for upstream 500s
        HttpResponseMessage? resp = null;
        string body = "";

        for (var attempt = 1; attempt <= 2; attempt++)
        {
            resp = await client.PostAsJsonAsync(AniListEndpoint, payload);
            body = await resp.Content.ReadAsStringAsync();

            if ((int)resp.StatusCode < 500) break; // not an upstream 5xx
            _logger.LogWarning("AniList schedule attempt {Attempt} failed: {Status} {Body}", attempt, resp.StatusCode, body);
            await Task.Delay(250 * attempt);
        }

        if (resp == null)
            return StatusCode(502, "Upstream schedule provider did not respond.");

        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogWarning("AniList schedule failed: {Status} {Body}", resp.StatusCode, body);
            // Return 502 so the frontend knows this is upstream, not your API logic
            return StatusCode(502, body);
        }

        var parsed = JsonSerializer.Deserialize<AniListScheduleResponse>(body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        var items = parsed?.Data?.Page?.AiringSchedules ?? new();

        var mapped = items
            .Where(x => x.Media is not null && x.Media.IsAdult != true)
            .Select(x => new ScheduleItemDto
            {
                AniListId = x.Media!.Id,
                AiringAt = x.AiringAt,
                Episode = x.Episode,
                TimeUntilAiring = x.TimeUntilAiring,
                TitleRomaji = x.Media.Title?.Romaji,
                TitleEnglish = x.Media.Title?.English,
                TitleNative = x.Media.Title?.Native,
                CoverImageUrl = x.Media.CoverImage?.Large ?? x.Media.CoverImage?.Medium,
                Format = x.Media.Format,
                Status = x.Media.Status
            })
            .ToList();

        return Ok(mapped);
    }

    public sealed class ScheduleItemDto
    {
        public int AniListId { get; set; }
        public int AiringAt { get; set; }
        public int Episode { get; set; }
        public int TimeUntilAiring { get; set; }
        public string? TitleRomaji { get; set; }
        public string? TitleEnglish { get; set; }
        public string? TitleNative { get; set; }
        public string? CoverImageUrl { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
    }

    // ---- AniList response shapes ----
    private sealed class AniListScheduleResponse { public AniListData? Data { get; set; } }
    private sealed class AniListData { public AniListPage? Page { get; set; } }
    private sealed class AniListPage { public List<AiringScheduleNode> AiringSchedules { get; set; } = new(); }

    private sealed class AiringScheduleNode
    {
        public int AiringAt { get; set; }
        public int Episode { get; set; }
        public int TimeUntilAiring { get; set; }
        public MediaNode? Media { get; set; }
    }

    private sealed class MediaNode
    {
        public int Id { get; set; }
        public bool? IsAdult { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public TitleNode? Title { get; set; }
        public CoverImageNode? CoverImage { get; set; }
    }

    private sealed class TitleNode
    {
        public string? Romaji { get; set; }
        public string? English { get; set; }
        public string? Native { get; set; }
    }

    private sealed class CoverImageNode
    {
        public string? Large { get; set; }
        public string? Medium { get; set; }
    }
}
