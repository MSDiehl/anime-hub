using System.Security.Claims;
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
[Route("api/discussions")]
public class DiscussionsController : ControllerBase
{
    private static readonly HashSet<string> ValidReactions = new(StringComparer.OrdinalIgnoreCase)
    {
        "upvote",
        "heart",
        "laugh",
        "wow",
        "sad"
    };

    private readonly AppDbContext _db;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private bool IsModerator =>
        User.IsInRole("Moderator") || User.IsInRole("Admin");

    public DiscussionsController(AppDbContext db) => _db = db;

    [HttpGet("forums")]
    public async Task<ActionResult<PagedResult<ThreadSummaryDto>>> GetForumThreads(
        [FromQuery] string? q = null,
        [FromQuery] string? category = null,
        [FromQuery] string? tag = null,
        [FromQuery] string? sort = "active",
        [FromQuery] bool includeDeleted = false,
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 25)
    {
        page = Math.Max(page, 1);
        perPage = Math.Clamp(perPage, 1, 50);

        var query = _db.DiscussionThreads.AsNoTracking().AsQueryable();

        if (!includeDeleted || !IsModerator)
            query = query.Where(t => !t.IsDeleted);

        query = ApplyForumFilters(query, q, category, tag);
        query = ApplyForumSort(query, sort);

        return Ok(await BuildThreadPage(query, page, perPage));
    }

    [HttpGet("most-discussed")]
    public async Task<ActionResult<PagedResult<ThreadSummaryDto>>> GetMostDiscussed(
        [FromQuery] int days = 7,
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 6)
    {
        days = Math.Clamp(days, 1, 60);
        page = Math.Max(page, 1);
        perPage = Math.Clamp(perPage, 1, 20);

        var since = DateTime.UtcNow.AddDays(-days);

        var query = _db.DiscussionThreads
            .AsNoTracking()
            .Where(t => !t.IsDeleted)
            .OrderByDescending(t => t.Comments.Count(c => !c.IsDeleted && c.CreatedUtc >= since))
            .ThenByDescending(t => t.LastActivityUtc)
            .ThenByDescending(t => t.CreatedUtc);

        return Ok(await BuildThreadPage(query, page, perPage));
    }

    // GET: /api/discussions/anime/{aniListId}?episode=12
    [HttpGet("anime/{aniListId:int}")]
    public async Task<ActionResult<PagedResult<ThreadSummaryDto>>> GetThreadsForAnime(
        [FromRoute] int aniListId,
        [FromQuery] int? episode = null,
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 25)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("aniListId is required."));
        page = Math.Max(page, 1);
        perPage = Math.Clamp(perPage, 1, 50);

        var query = _db.DiscussionThreads.AsNoTracking()
            .Where(t => !t.IsDeleted && t.AniListId == aniListId && t.EpisodeNumber == episode)
            .OrderByDescending(t => t.IsPinned)
            .ThenByDescending(t => t.LastActivityUtc)
            .ThenByDescending(t => t.CreatedUtc);

        return Ok(await BuildThreadPage(query, page, perPage));
    }

    // POST: /api/discussions/anime/{aniListId}?episode=12
    [EnableRateLimiting("comments")]
    [HttpPost("anime/{aniListId:int}")]
    public async Task<ActionResult> CreateThread(
        [FromRoute] int aniListId,
        [FromQuery] int? episode,
        [FromBody] CreateThreadRequest req)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("aniListId is required."));
        if (episode is <= 0) return BadRequest(ApiError.Validation("episode must be >= 1 when provided."));

        var title = NormalizeRequired(req.Title, "Title", 200);
        if (title.Error != null) return BadRequest(title.Error);

        var body = NormalizeRequired(req.Body, "Body", 5000);
        if (body.Error != null) return BadRequest(body.Error);

        var category = NormalizeOptional(req.Category, 80) ?? "General";
        var tags = NormalizeTags(req.Tags);
        var now = DateTime.UtcNow;

        var thread = new DiscussionThread
        {
            Id = Guid.NewGuid(),
            AniListId = aniListId,
            EpisodeNumber = episode,
            UserId = CurrentUserId,
            Title = title.Value,
            Body = body.Value,
            Category = category,
            TagCsv = JoinTags(tags),
            ContainsSpoilers = req.ContainsSpoilers,
            CreatedUtc = now,
            LastActivityUtc = now
        };

        _db.DiscussionThreads.Add(thread);
        await _db.SaveChangesAsync();

        return Created($"/api/discussions/thread/{thread.Id}", new { id = thread.Id });
    }

    // GET: /api/discussions/thread/{threadId}
    [HttpGet("thread/{threadId:guid}")]
    public async Task<ActionResult<ThreadDetailDto>> GetThread([FromRoute] Guid threadId)
    {
        var uid = CurrentUserId;
        var canModerate = IsModerator;

        var thread = await _db.DiscussionThreads.AsNoTracking()
            .Where(t => t.Id == threadId)
            .Select(t => new ThreadDetailDto
            {
                Id = t.Id,
                AniListId = t.AniListId,
                EpisodeNumber = t.EpisodeNumber,
                Title = t.IsDeleted ? "[deleted]" : t.Title,
                Body = t.IsDeleted ? "" : t.Body,
                Category = t.Category,
                Tags = SplitTags(t.TagCsv),
                ContainsSpoilers = t.ContainsSpoilers,
                IsPinned = t.IsPinned,
                IsLocked = t.IsLocked,
                IsDeleted = t.IsDeleted,
                CreatedUtc = t.CreatedUtc,
                UpdatedUtc = t.UpdatedUtc,
                LastActivityUtc = t.LastActivityUtc,
                AuthorUserId = t.UserId,
                CommentCount = t.Comments.Count(c => !c.IsDeleted),
                ReactionCount = _db.DiscussionReactions.Count(r => r.ThreadId == t.Id),
                UserReaction = _db.DiscussionReactions
                    .Where(r => r.ThreadId == t.Id && r.UserId == uid)
                    .Select(r => r.Type)
                    .FirstOrDefault(),
                ReportCount = canModerate
                    ? _db.DiscussionReports.Count(r => r.ThreadId == t.Id)
                    : 0,
                CanEdit = canModerate || t.UserId == uid,
                CanDelete = canModerate || t.UserId == uid,
                CanModerate = canModerate
            })
            .FirstOrDefaultAsync();

        if (thread == null) return NotFound(ApiError.NotFound("Thread not found."));
        if (thread.IsDeleted && !thread.CanModerate && thread.AuthorUserId != uid)
            return NotFound(ApiError.NotFound("Thread not found."));

        await HydrateThreadAuthor(thread);

        var comments = await _db.DiscussionComments.AsNoTracking()
            .Where(c => c.ThreadId == threadId)
            .OrderBy(c => c.CreatedUtc)
            .Select(c => new CommentDto
            {
                Id = c.Id,
                ThreadId = c.ThreadId,
                Body = c.IsDeleted ? "" : c.Body,
                CreatedUtc = c.CreatedUtc,
                UpdatedUtc = c.UpdatedUtc,
                IsDeleted = c.IsDeleted,
                AuthorUserId = c.UserId,
                ReactionCount = _db.DiscussionReactions.Count(r => r.CommentId == c.Id),
                UserReaction = _db.DiscussionReactions
                    .Where(r => r.CommentId == c.Id && r.UserId == uid)
                    .Select(r => r.Type)
                    .FirstOrDefault(),
                ReportCount = canModerate
                    ? _db.DiscussionReports.Count(r => r.CommentId == c.Id)
                    : 0,
                CanEdit = !c.IsDeleted && (canModerate || c.UserId == uid),
                CanDelete = !c.IsDeleted && (canModerate || c.UserId == uid)
            })
            .ToListAsync();

        await HydrateCommentAuthors(comments);
        thread.Comments = comments;

        return Ok(thread);
    }

    [HttpPatch("thread/{threadId:guid}")]
    public async Task<ActionResult<ThreadDetailDto>> UpdateThread(
        [FromRoute] Guid threadId,
        [FromBody] UpdateThreadRequest req)
    {
        var thread = await _db.DiscussionThreads.FirstOrDefaultAsync(t => t.Id == threadId);
        if (thread == null || (thread.IsDeleted && !IsModerator))
            return NotFound(ApiError.NotFound("Thread not found."));

        if (!CanModify(thread.UserId))
            return Forbid();

        var title = NormalizeRequired(req.Title, "Title", 200);
        if (title.Error != null) return BadRequest(title.Error);

        var body = NormalizeRequired(req.Body, "Body", 5000);
        if (body.Error != null) return BadRequest(body.Error);

        thread.Title = title.Value;
        thread.Body = body.Value;
        thread.Category = NormalizeOptional(req.Category, 80) ?? "General";
        thread.TagCsv = JoinTags(NormalizeTags(req.Tags));
        thread.ContainsSpoilers = req.ContainsSpoilers;
        var now = DateTime.UtcNow;
        thread.UpdatedUtc = now;
        thread.LastActivityUtc = now;

        await _db.SaveChangesAsync();
        return await GetThread(threadId);
    }

    [HttpDelete("thread/{threadId:guid}")]
    public async Task<ActionResult> DeleteThread([FromRoute] Guid threadId)
    {
        var thread = await _db.DiscussionThreads.FirstOrDefaultAsync(t => t.Id == threadId);
        if (thread == null || (thread.IsDeleted && !IsModerator))
            return NotFound(ApiError.NotFound("Thread not found."));

        if (!CanModify(thread.UserId))
            return Forbid();

        thread.IsDeleted = true;
        var now = DateTime.UtcNow;
        thread.DeletedUtc = now;
        thread.LastActivityUtc = now;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpPatch("thread/{threadId:guid}/moderation")]
    public async Task<ActionResult<ThreadDetailDto>> ModerateThread(
        [FromRoute] Guid threadId,
        [FromBody] ModerateThreadRequest req)
    {
        if (!IsModerator) return Forbid();

        var thread = await _db.DiscussionThreads.FirstOrDefaultAsync(t => t.Id == threadId);
        if (thread == null) return NotFound(ApiError.NotFound("Thread not found."));

        if (req.IsPinned.HasValue) thread.IsPinned = req.IsPinned.Value;
        if (req.IsLocked.HasValue) thread.IsLocked = req.IsLocked.Value;
        thread.UpdatedUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return await GetThread(threadId);
    }

    // POST: /api/discussions/thread/{threadId}/comments
    [EnableRateLimiting("comments")]
    [HttpPost("thread/{threadId:guid}/comments")]
    public async Task<ActionResult> AddComment([FromRoute] Guid threadId, [FromBody] AddCommentRequest req)
    {
        var body = NormalizeRequired(req.Body, "Body", 3000);
        if (body.Error != null) return BadRequest(body.Error);

        var thread = await _db.DiscussionThreads.FirstOrDefaultAsync(t => t.Id == threadId);
        if (thread == null || thread.IsDeleted)
            return NotFound(ApiError.NotFound("Thread not found."));

        if (thread.IsLocked && !IsModerator)
            return Conflict(ApiError.Conflict("This thread is locked."));

        var now = DateTime.UtcNow;
        var comment = new DiscussionComment
        {
            Id = Guid.NewGuid(),
            ThreadId = threadId,
            UserId = CurrentUserId,
            Body = body.Value,
            CreatedUtc = now
        };

        thread.LastActivityUtc = now;
        _db.DiscussionComments.Add(comment);
        await _db.SaveChangesAsync();

        return Ok(new { id = comment.Id });
    }

    [EnableRateLimiting("comments")]
    [HttpPatch("comments/{commentId:guid}")]
    public async Task<ActionResult<CommentDto>> UpdateComment(
        [FromRoute] Guid commentId,
        [FromBody] AddCommentRequest req)
    {
        var body = NormalizeRequired(req.Body, "Body", 3000);
        if (body.Error != null) return BadRequest(body.Error);

        var comment = await _db.DiscussionComments
            .Include(c => c.Thread)
            .FirstOrDefaultAsync(c => c.Id == commentId);
        if (comment == null || comment.IsDeleted || comment.Thread.IsDeleted)
            return NotFound(ApiError.NotFound("Comment not found."));

        if (!CanModify(comment.UserId))
            return Forbid();

        comment.Body = body.Value;
        var now = DateTime.UtcNow;
        comment.UpdatedUtc = now;
        comment.Thread.LastActivityUtc = now;
        await _db.SaveChangesAsync();

        return Ok(new { comment.Id });
    }

    [EnableRateLimiting("comments")]
    [HttpDelete("comments/{commentId:guid}")]
    public async Task<ActionResult> DeleteComment([FromRoute] Guid commentId)
    {
        var comment = await _db.DiscussionComments
            .Include(c => c.Thread)
            .FirstOrDefaultAsync(c => c.Id == commentId);
        if (comment == null || comment.IsDeleted || comment.Thread.IsDeleted)
            return NotFound(ApiError.NotFound("Comment not found."));

        if (!CanModify(comment.UserId))
            return Forbid();

        comment.IsDeleted = true;
        var now = DateTime.UtcNow;
        comment.DeletedUtc = now;
        comment.Thread.LastActivityUtc = now;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [EnableRateLimiting("reactions")]
    [HttpPost("thread/{threadId:guid}/reactions")]
    public async Task<ActionResult<ReactionResultDto>> ToggleThreadReaction(
        [FromRoute] Guid threadId,
        [FromBody] ReactionRequest req)
    {
        var type = NormalizeReactionType(req.Type);
        if (type == null) return BadRequest(ApiError.Validation("Unsupported reaction type."));

        var thread = await _db.DiscussionThreads.FirstOrDefaultAsync(t => t.Id == threadId && !t.IsDeleted);
        if (thread == null) return NotFound(ApiError.NotFound("Thread not found."));

        var result = await ToggleReaction(type, threadId, null);
        thread.LastActivityUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(result);
    }

    [EnableRateLimiting("reactions")]
    [HttpPost("comments/{commentId:guid}/reactions")]
    public async Task<ActionResult<ReactionResultDto>> ToggleCommentReaction(
        [FromRoute] Guid commentId,
        [FromBody] ReactionRequest req)
    {
        var type = NormalizeReactionType(req.Type);
        if (type == null) return BadRequest(ApiError.Validation("Unsupported reaction type."));

        var comment = await _db.DiscussionComments
            .Include(c => c.Thread)
            .FirstOrDefaultAsync(c => c.Id == commentId && !c.IsDeleted && !c.Thread.IsDeleted);
        if (comment == null) return NotFound(ApiError.NotFound("Comment not found."));

        var result = await ToggleReaction(type, null, commentId);
        comment.Thread.LastActivityUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(result);
    }

    [EnableRateLimiting("reports")]
    [HttpPost("thread/{threadId:guid}/reports")]
    public async Task<ActionResult> ReportThread([FromRoute] Guid threadId, [FromBody] ReportRequest req)
    {
        var reason = NormalizeOptional(req.Reason, 1000) ?? "Reported by user.";
        var uid = CurrentUserId;

        var exists = await _db.DiscussionThreads.AnyAsync(t => t.Id == threadId && !t.IsDeleted);
        if (!exists) return NotFound(ApiError.NotFound("Thread not found."));

        var alreadyReported = await _db.DiscussionReports
            .AnyAsync(r => r.ThreadId == threadId && r.ReporterUserId == uid);
        if (!alreadyReported)
        {
            _db.DiscussionReports.Add(new DiscussionReport
            {
                Id = Guid.NewGuid(),
                ThreadId = threadId,
                ReporterUserId = uid,
                Reason = reason,
                CreatedUtc = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }

        return Ok(new { reported = true });
    }

    [EnableRateLimiting("reports")]
    [HttpPost("comments/{commentId:guid}/reports")]
    public async Task<ActionResult> ReportComment([FromRoute] Guid commentId, [FromBody] ReportRequest req)
    {
        var reason = NormalizeOptional(req.Reason, 1000) ?? "Reported by user.";
        var uid = CurrentUserId;

        var exists = await _db.DiscussionComments
            .AnyAsync(c => c.Id == commentId && !c.IsDeleted && !c.Thread.IsDeleted);
        if (!exists) return NotFound(ApiError.NotFound("Comment not found."));

        var alreadyReported = await _db.DiscussionReports
            .AnyAsync(r => r.CommentId == commentId && r.ReporterUserId == uid);
        if (!alreadyReported)
        {
            _db.DiscussionReports.Add(new DiscussionReport
            {
                Id = Guid.NewGuid(),
                CommentId = commentId,
                ReporterUserId = uid,
                Reason = reason,
                CreatedUtc = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }

        return Ok(new { reported = true });
    }

    private IQueryable<DiscussionThread> ApplyForumFilters(
        IQueryable<DiscussionThread> query,
        string? q,
        string? category,
        string? tag)
    {
        var term = q?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(term))
        {
            query = query.Where(t =>
                t.Title.ToLower().Contains(term) ||
                t.Body.ToLower().Contains(term) ||
                t.Category.ToLower().Contains(term) ||
                (t.TagCsv != null && t.TagCsv.ToLower().Contains(term)));
        }

        var normalizedCategory = category?.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(normalizedCategory) && normalizedCategory != "all")
            query = query.Where(t => t.Category.ToLower() == normalizedCategory);

        var normalizedTag = tag?.Trim().TrimStart('#').ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(normalizedTag))
            query = query.Where(t => t.TagCsv != null && t.TagCsv.ToLower().Contains(normalizedTag));

        return query;
    }

    private IQueryable<DiscussionThread> ApplyForumSort(IQueryable<DiscussionThread> query, string? sort)
    {
        return (sort ?? "active").Trim().ToLowerInvariant() switch
        {
            "newest" => query
                .OrderByDescending(t => t.IsPinned)
                .ThenByDescending(t => t.CreatedUtc),
            "mostreplies" => query
                .OrderByDescending(t => t.IsPinned)
                .ThenByDescending(t => t.Comments.Count(c => !c.IsDeleted))
                .ThenByDescending(t => t.LastActivityUtc),
            "top" => query
                .OrderByDescending(t => t.IsPinned)
                .ThenByDescending(t => _db.DiscussionReactions.Count(r => r.ThreadId == t.Id))
                .ThenByDescending(t => t.LastActivityUtc),
            _ => query
                .OrderByDescending(t => t.IsPinned)
                .ThenByDescending(t => t.LastActivityUtc)
                .ThenByDescending(t => t.CreatedUtc)
        };
    }

    private async Task<PagedResult<ThreadSummaryDto>> BuildThreadPage(
        IQueryable<DiscussionThread> query,
        int page,
        int perPage)
    {
        var total = await query.CountAsync();
        var items = await BuildThreadSummaries(
            query.Skip((page - 1) * perPage),
            perPage);

        return new PagedResult<ThreadSummaryDto>
        {
            Page = page,
            PerPage = perPage,
            Total = total,
            LastPage = total == 0 ? 0 : (int)Math.Ceiling(total / (double)perPage),
            HasNextPage = page * perPage < total,
            Items = items
        };
    }

    private async Task<List<ThreadSummaryDto>> BuildThreadSummaries(
        IQueryable<DiscussionThread> query,
        int take)
    {
        var uid = CurrentUserId;
        var canModerate = IsModerator;

        var threads = await query
            .Take(take)
            .Select(t => new ThreadSummaryDto
            {
                Id = t.Id,
                AniListId = t.AniListId,
                EpisodeNumber = t.EpisodeNumber,
                Title = t.IsDeleted ? "[deleted]" : t.Title,
                Category = t.Category,
                Tags = SplitTags(t.TagCsv),
                ContainsSpoilers = t.ContainsSpoilers,
                IsPinned = t.IsPinned,
                IsLocked = t.IsLocked,
                IsDeleted = t.IsDeleted,
                CreatedUtc = t.CreatedUtc,
                UpdatedUtc = t.UpdatedUtc,
                LastActivityUtc = t.LastActivityUtc,
                AuthorUserId = t.UserId,
                CommentCount = t.Comments.Count(c => !c.IsDeleted),
                ReactionCount = _db.DiscussionReactions.Count(r => r.ThreadId == t.Id),
                UserReaction = _db.DiscussionReactions
                    .Where(r => r.ThreadId == t.Id && r.UserId == uid)
                    .Select(r => r.Type)
                    .FirstOrDefault(),
                ReportCount = canModerate
                    ? _db.DiscussionReports.Count(r => r.ThreadId == t.Id)
                    : 0,
                CanEdit = canModerate || t.UserId == uid,
                CanDelete = canModerate || t.UserId == uid,
                CanModerate = canModerate
            })
            .ToListAsync();

        await HydrateThreadAuthors(threads);
        return threads;
    }

    private async Task HydrateThreadAuthors(IReadOnlyCollection<ThreadSummaryDto> threads)
    {
        var authorIds = threads.Select(x => x.AuthorUserId).Distinct().ToList();
        var authors = await _db.Users
            .AsNoTracking()
            .Where(u => authorIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.AvatarUrl })
            .ToListAsync();

        var map = authors.ToDictionary(a => a.Id, a => new AuthorDto
        {
            Id = a.Id,
            DisplayName = string.IsNullOrWhiteSpace(a.DisplayName) ? (a.Email ?? "User") : a.DisplayName,
            AvatarUrl = a.AvatarUrl
        });

        foreach (var thread in threads)
        {
            if (map.TryGetValue(thread.AuthorUserId, out var author))
            {
                thread.AuthorDisplayName = author.DisplayName;
                thread.AuthorAvatarUrl = author.AvatarUrl;
            }
        }
    }

    private async Task HydrateThreadAuthor(ThreadDetailDto thread)
    {
        var author = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == thread.AuthorUserId)
            .Select(u => new { u.DisplayName, u.Email, u.AvatarUrl })
            .FirstOrDefaultAsync();

        if (author == null) return;

        thread.AuthorDisplayName = string.IsNullOrWhiteSpace(author.DisplayName)
            ? (author.Email ?? "User")
            : author.DisplayName;
        thread.AuthorAvatarUrl = author.AvatarUrl;
    }

    private async Task HydrateCommentAuthors(IReadOnlyCollection<CommentDto> comments)
    {
        var authorIds = comments.Select(c => c.AuthorUserId).Distinct().ToList();
        var authors = await _db.Users.AsNoTracking()
            .Where(u => authorIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.AvatarUrl })
            .ToListAsync();

        var map = authors.ToDictionary(a => a.Id, a => new AuthorDto
        {
            Id = a.Id,
            DisplayName = string.IsNullOrWhiteSpace(a.DisplayName) ? (a.Email ?? "User") : a.DisplayName,
            AvatarUrl = a.AvatarUrl
        });

        foreach (var comment in comments)
        {
            if (map.TryGetValue(comment.AuthorUserId, out var author))
            {
                comment.AuthorDisplayName = author.DisplayName;
                comment.AuthorAvatarUrl = author.AvatarUrl;
            }
        }
    }

    private async Task<ReactionResultDto> ToggleReaction(string type, Guid? threadId, Guid? commentId)
    {
        var uid = CurrentUserId;
        var existing = await _db.DiscussionReactions.FirstOrDefaultAsync(r =>
            r.UserId == uid &&
            r.Type == type &&
            r.ThreadId == threadId &&
            r.CommentId == commentId);

        string? userReaction;
        if (existing == null)
        {
            _db.DiscussionReactions.Add(new DiscussionReaction
            {
                Id = Guid.NewGuid(),
                UserId = uid,
                ThreadId = threadId,
                CommentId = commentId,
                Type = type,
                CreatedUtc = DateTime.UtcNow
            });
            userReaction = type;
        }
        else
        {
            _db.DiscussionReactions.Remove(existing);
            userReaction = null;
        }

        await _db.SaveChangesAsync();

        var count = await _db.DiscussionReactions.CountAsync(r =>
            r.Type == type &&
            r.ThreadId == threadId &&
            r.CommentId == commentId);

        return new ReactionResultDto
        {
            Type = type,
            Count = count,
            UserReaction = userReaction
        };
    }

    private bool CanModify(Guid authorUserId) =>
        IsModerator || authorUserId == CurrentUserId;

    private static string? NormalizeReactionType(string? value)
    {
        var type = value?.Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(type) || !ValidReactions.Contains(type)
            ? null
            : type;
    }

    private static (string Value, ApiError? Error) NormalizeRequired(string? value, string fieldName, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return ("", ApiError.Validation($"{fieldName} is required."));

        if (trimmed.Length > maxLength)
            return ("", ApiError.Validation($"{fieldName} too long (max {maxLength})."));

        return (trimmed, null);
    }

    private static string? NormalizeOptional(string? value, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed)) return null;
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private static List<string> NormalizeTags(IEnumerable<string>? tags)
    {
        return (tags ?? Array.Empty<string>())
            .Select(t => t.Trim().TrimStart('#').ToLowerInvariant())
            .Where(t => t.Length is > 0 and <= 40)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToList();
    }

    private static string? JoinTags(IEnumerable<string> tags)
    {
        var values = tags.ToList();
        return values.Count == 0 ? null : string.Join(",", values);
    }

    private static List<string> SplitTags(string? tagCsv)
    {
        if (string.IsNullOrWhiteSpace(tagCsv)) return new List<string>();

        return tagCsv
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Take(8)
            .ToList();
    }

    public class CreateThreadRequest
    {
        public string Title { get; set; } = "";
        public string Body { get; set; } = "";
        public string? Category { get; set; }
        public List<string>? Tags { get; set; }
        public bool ContainsSpoilers { get; set; }
    }

    public sealed class UpdateThreadRequest : CreateThreadRequest;

    public sealed class AddCommentRequest
    {
        public string Body { get; set; } = "";
    }

    public sealed class ReactionRequest
    {
        public string? Type { get; set; } = "upvote";
    }

    public sealed class ReportRequest
    {
        public string? Reason { get; set; }
    }

    public sealed class ModerateThreadRequest
    {
        public bool? IsPinned { get; set; }
        public bool? IsLocked { get; set; }
    }

    public sealed class ReactionResultDto
    {
        public string Type { get; set; } = "upvote";
        public int Count { get; set; }
        public string? UserReaction { get; set; }
    }

    private sealed class AuthorDto
    {
        public Guid Id { get; set; }
        public string DisplayName { get; set; } = "User";
        public string? AvatarUrl { get; set; }
    }

    public class ThreadSummaryDto
    {
        public Guid Id { get; set; }
        public int AniListId { get; set; }
        public int? EpisodeNumber { get; set; }
        public string Title { get; set; } = "";
        public string Category { get; set; } = "General";
        public List<string> Tags { get; set; } = new();
        public bool ContainsSpoilers { get; set; }
        public bool IsPinned { get; set; }
        public bool IsLocked { get; set; }
        public bool IsDeleted { get; set; }
        public DateTime CreatedUtc { get; set; }
        public DateTime? UpdatedUtc { get; set; }
        public DateTime? LastActivityUtc { get; set; }

        public Guid AuthorUserId { get; set; }
        public string AuthorDisplayName { get; set; } = "User";
        public string? AuthorAvatarUrl { get; set; }

        public int CommentCount { get; set; }
        public int ReactionCount { get; set; }
        public string? UserReaction { get; set; }
        public int ReportCount { get; set; }
        public bool CanEdit { get; set; }
        public bool CanDelete { get; set; }
        public bool CanModerate { get; set; }
    }

    public sealed class ThreadDetailDto : ThreadSummaryDto
    {
        public string Body { get; set; } = "";
        public List<CommentDto> Comments { get; set; } = new();
    }

    public sealed class CommentDto
    {
        public Guid Id { get; set; }
        public Guid ThreadId { get; set; }
        public string Body { get; set; } = "";
        public DateTime CreatedUtc { get; set; }
        public DateTime? UpdatedUtc { get; set; }
        public bool IsDeleted { get; set; }

        public Guid AuthorUserId { get; set; }
        public string AuthorDisplayName { get; set; } = "User";
        public string? AuthorAvatarUrl { get; set; }

        public int ReactionCount { get; set; }
        public string? UserReaction { get; set; }
        public int ReportCount { get; set; }
        public bool CanEdit { get; set; }
        public bool CanDelete { get; set; }
    }
}
