using System.Security.Claims;
using AnimeHub.Api.Models;
using AnimeHub.Api.Services;
using AnimeHub.Domain.Entities;
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
    private readonly IScheduleDataService _scheduleData;
    private readonly AppDbContext _db;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public ScheduleController(IScheduleDataService scheduleData, AppDbContext db)
    {
        _scheduleData = scheduleData;
        _db = db;
    }

    [HttpGet("week")]
    public async Task<ActionResult<List<ScheduleItemDto>>> GetWeek(
        [FromQuery] string? start = null,
        [FromQuery] int days = 7,
        [FromQuery] bool trackedOnly = false,
        [FromQuery] bool unwatchedOnly = false,
        [FromQuery] string? format = null,
        [FromQuery] string? q = null,
        CancellationToken cancellationToken = default)
    {
        days = Math.Clamp(days, 1, 42);

        var startDate =
            string.IsNullOrWhiteSpace(start)
                ? DateOnly.FromDateTime(DateTime.UtcNow)
                : DateOnly.Parse(start);

        var tracked = await _db.TrackedShows
            .AsNoTracking()
            .Where(x => x.UserId == CurrentUserId)
            .ToDictionaryAsync(x => x.AniListId, cancellationToken);

        var mediaIds = trackedOnly || unwatchedOnly
            ? tracked.Keys.ToList()
            : null;

        if ((trackedOnly || unwatchedOnly) && tracked.Count == 0)
            return Ok(new List<ScheduleItemDto>());

        List<ScheduleItemDto> items;
        try
        {
            items = await _scheduleData.GetScheduleAsync(startDate, days, mediaIds, cancellationToken);
        }
        catch (ScheduleUpstreamException)
        {
            return StatusCode(502, ApiError.Upstream("AniList schedule request failed."));
        }

        var enriched = items
            .Select(item => Enrich(item, tracked.GetValueOrDefault(item.AniListId)))
            .Where(item => !unwatchedOnly || item is { IsTracked: true, IsWatched: false })
            .Where(item => string.IsNullOrWhiteSpace(format) ||
                           string.Equals(format, "All", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(item.Format, format, StringComparison.OrdinalIgnoreCase))
            .Where(item => MatchesQuery(item, q))
            .OrderBy(item => item.AiringAt)
            .ThenBy(item => item.TitleEnglish ?? item.TitleRomaji ?? item.TitleNative)
            .ToList();

        return Ok(enriched);
    }

    private static ScheduleItemDto Enrich(ScheduleItemDto item, TrackedShow? tracked)
    {
        if (tracked == null)
            return item;

        item.IsTracked = true;
        item.EpisodeProgress = tracked.EpisodeProgress;
        item.IsWatched = item.Episode <= tracked.EpisodeProgress;
        return item;
    }

    private static bool MatchesQuery(ScheduleItemDto item, string? query)
    {
        if (string.IsNullOrWhiteSpace(query))
            return true;

        var needle = query.Trim();
        return Contains(item.TitleEnglish, needle) ||
               Contains(item.TitleRomaji, needle) ||
               Contains(item.TitleNative, needle);
    }

    private static bool Contains(string? value, string needle) =>
        value?.Contains(needle, StringComparison.OrdinalIgnoreCase) == true;
}
