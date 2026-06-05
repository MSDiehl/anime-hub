using System.Security.Claims;
using AnimeHub.Api.Models;
using AnimeHub.Domain.Entities;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/tracked")]
public class TrackedShowsController : ControllerBase
{
    private readonly AppDbContext _db;
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public TrackedShowsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<List<TrackedShow>>> GetAll()
    {
        var uid = CurrentUserId;

        var items = await _db.TrackedShows
            .Where(x => x.UserId == uid)
            .OrderByDescending(x => x.CreatedUtc)
            .ToListAsync();

        return Ok(items);
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
    public async Task<ActionResult> Track([FromBody] TrackShowRequest req)
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
            Popularity = req.Popularity
        };

        _db.TrackedShows.Add(entity);
        await _db.SaveChangesAsync();

        return Created($"/api/tracked/{entity.Id}", new { entity.Id });
    }

    [HttpDelete("{aniListId:int}")]
    public async Task<ActionResult> Untrack([FromRoute] int aniListId)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("AniListId is required."));

        var uid = CurrentUserId;
        var entity = await _db.TrackedShows
            .FirstOrDefaultAsync(x => x.UserId == uid && x.AniListId == aniListId);

        if (entity == null)
            return NotFound(ApiError.NotFound("This show is not tracked."));

        _db.TrackedShows.Remove(entity);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    public sealed class TrackShowRequest
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
        public int TrackedCount { get; set; }
    }
}
