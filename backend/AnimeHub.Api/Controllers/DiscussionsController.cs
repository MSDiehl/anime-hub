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
[Route("api/discussions")]
public class DiscussionsController : ControllerBase
{
    private readonly AppDbContext _db;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public DiscussionsController(AppDbContext db) => _db = db;

    // GET: /api/discussions/anime/{aniListId}?episode=12
    [HttpGet("anime/{aniListId:int}")]
    public async Task<ActionResult> GetThreadsForAnime(
        [FromRoute] int aniListId,
        [FromQuery] int? episode = null)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("aniListId is required."));

        var query = _db.DiscussionThreads.AsNoTracking()
            .Where(t => t.AniListId == aniListId && t.EpisodeNumber == episode)
            .OrderByDescending(t => t.CreatedUtc);

        var threads = await query
            .Select(t => new ThreadSummaryDto
            {
                Id = t.Id,
                AniListId = t.AniListId,
                EpisodeNumber = t.EpisodeNumber,
                Title = t.Title,
                CreatedUtc = t.CreatedUtc,
                AuthorUserId = t.UserId,
                CommentCount = t.Comments.Count
            })
            .Take(50)
            .ToListAsync();

        // hydrate author display names
        var authorIds = threads.Select(x => x.AuthorUserId).Distinct().ToList();
        var authors = await _db.Users
            .Where(u => authorIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email })
            .ToListAsync();

        var map = authors.ToDictionary(a => a.Id, a => string.IsNullOrWhiteSpace(a.DisplayName) ? (a.Email ?? "User") : a.DisplayName);

        foreach (var t in threads)
            t.AuthorDisplayName = map.TryGetValue(t.AuthorUserId, out var name) ? name : "User";

        return Ok(threads);
    }

    // POST: /api/discussions/anime/{aniListId}?episode=12
    [HttpPost("anime/{aniListId:int}")]
    public async Task<ActionResult> CreateThread(
        [FromRoute] int aniListId,
        [FromQuery] int? episode,
        [FromBody] CreateThreadRequest req)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("aniListId is required."));
        if (episode is <= 0) return BadRequest(ApiError.Validation("episode must be >= 1 when provided."));
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest(ApiError.Validation("Title is required."));
        if (string.IsNullOrWhiteSpace(req.Body)) return BadRequest(ApiError.Validation("Body is required."));

        var title = req.Title.Trim();
        var body = req.Body.Trim();

        if (title.Length > 200) return BadRequest(ApiError.Validation("Title too long (max 200)."));
        if (body.Length > 5000) return BadRequest(ApiError.Validation("Body too long (max 5000)."));

        var thread = new DiscussionThread
        {
            Id = Guid.NewGuid(),
            AniListId = aniListId,
            EpisodeNumber = episode,
            UserId = CurrentUserId,
            Title = title,
            Body = body,
            CreatedUtc = DateTime.UtcNow
        };

        _db.DiscussionThreads.Add(thread);
        await _db.SaveChangesAsync();

        return Created($"/api/discussions/thread/{thread.Id}", new { id = thread.Id });
    }

    // GET: /api/discussions/thread/{threadId}
    [HttpGet("thread/{threadId:guid}")]
    public async Task<ActionResult> GetThread([FromRoute] Guid threadId)
    {
        var thread = await _db.DiscussionThreads.AsNoTracking()
            .Where(t => t.Id == threadId)
            .Select(t => new ThreadDetailDto
            {
                Id = t.Id,
                AniListId = t.AniListId,
                EpisodeNumber = t.EpisodeNumber,
                Title = t.Title,
                Body = t.Body,
                CreatedUtc = t.CreatedUtc,
                AuthorUserId = t.UserId
            })
            .FirstOrDefaultAsync();

        if (thread == null) return NotFound(ApiError.NotFound("Thread not found."));

        // author name
        var author = await _db.Users.AsNoTracking()
            .Where(u => u.Id == thread.AuthorUserId)
            .Select(u => new { u.DisplayName, u.Email })
            .FirstOrDefaultAsync();

        thread.AuthorDisplayName = author == null
            ? "User"
            : (string.IsNullOrWhiteSpace(author.DisplayName) ? (author.Email ?? "User") : author.DisplayName);

        var comments = await _db.DiscussionComments.AsNoTracking()
            .Where(c => c.ThreadId == threadId)
            .OrderBy(c => c.CreatedUtc)
            .Select(c => new CommentDto
            {
                Id = c.Id,
                ThreadId = c.ThreadId,
                Body = c.Body,
                CreatedUtc = c.CreatedUtc,
                AuthorUserId = c.UserId
            })
            .ToListAsync();

        var commentAuthorIds = comments.Select(c => c.AuthorUserId).Distinct().ToList();
        var commentAuthors = await _db.Users.AsNoTracking()
            .Where(u => commentAuthorIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email })
            .ToListAsync();

        var cmap = commentAuthors.ToDictionary(a => a.Id, a => string.IsNullOrWhiteSpace(a.DisplayName) ? (a.Email ?? "User") : a.DisplayName);
        foreach (var c in comments)
            c.AuthorDisplayName = cmap.TryGetValue(c.AuthorUserId, out var name) ? name : "User";

        thread.Comments = comments;

        return Ok(thread);
    }

    // POST: /api/discussions/thread/{threadId}/comments
    [HttpPost("thread/{threadId:guid}/comments")]
    public async Task<ActionResult> AddComment([FromRoute] Guid threadId, [FromBody] AddCommentRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Body)) return BadRequest(ApiError.Validation("Body is required."));

        var body = req.Body.Trim();
        if (body.Length > 3000) return BadRequest(ApiError.Validation("Comment too long (max 3000)."));

        var exists = await _db.DiscussionThreads.AnyAsync(t => t.Id == threadId);
        if (!exists) return NotFound(ApiError.NotFound("Thread not found."));

        var comment = new DiscussionComment
        {
            Id = Guid.NewGuid(),
            ThreadId = threadId,
            UserId = CurrentUserId,
            Body = body,
            CreatedUtc = DateTime.UtcNow
        };

        _db.DiscussionComments.Add(comment);
        await _db.SaveChangesAsync();

        return Ok(new { id = comment.Id });
    }

    // ---------------- DTOs ----------------

    public sealed class CreateThreadRequest
    {
        public string Title { get; set; } = "";
        public string Body { get; set; } = "";
    }

    public sealed class AddCommentRequest
    {
        public string Body { get; set; } = "";
    }

    public sealed class ThreadSummaryDto
    {
        public Guid Id { get; set; }
        public int AniListId { get; set; }
        public int? EpisodeNumber { get; set; }
        public string Title { get; set; } = "";
        public DateTime CreatedUtc { get; set; }

        public Guid AuthorUserId { get; set; }
        public string AuthorDisplayName { get; set; } = "User";

        public int CommentCount { get; set; }
    }

    public sealed class ThreadDetailDto
    {
        public Guid Id { get; set; }
        public int AniListId { get; set; }
        public int? EpisodeNumber { get; set; }
        public string Title { get; set; } = "";
        public string Body { get; set; } = "";
        public DateTime CreatedUtc { get; set; }

        public Guid AuthorUserId { get; set; }
        public string AuthorDisplayName { get; set; } = "User";

        public List<CommentDto> Comments { get; set; } = new();
    }

    public sealed class CommentDto
    {
        public Guid Id { get; set; }
        public Guid ThreadId { get; set; }
        public string Body { get; set; } = "";
        public DateTime CreatedUtc { get; set; }

        public Guid AuthorUserId { get; set; }
        public string AuthorDisplayName { get; set; } = "User";
    }
}
