using AnimeHub.Domain.Entities;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

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

    [HttpPost]
    public async Task<ActionResult> Track([FromBody] TrackShowRequest req)
    {
        if (req.AniListId <= 0) return BadRequest("AniListId is required.");
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title is required.");

        var uid = CurrentUserId;

        var exists = await _db.TrackedShows.AnyAsync(x => x.UserId == uid && x.AniListId == req.AniListId);
        if (exists) return Conflict("This show is already tracked.");

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
}
