using System.Security.Claims;
using AnimeHub.Api.Models;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db) => _db = db;

    [HttpGet("{userId:guid}")]
    public async Task<ActionResult<UserProfileDto>> GetProfile([FromRoute] Guid userId)
    {
        var user = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new
            {
                u.Id,
                u.DisplayName,
                u.Email,
                u.AvatarUrl,
                u.IsProfilePublic
            })
            .FirstOrDefaultAsync();

        if (user == null) return NotFound(ApiError.NotFound("User not found."));

        var currentUserId = CurrentUserId();
        var canViewPrivateProfile = currentUserId == user.Id ||
            User.IsInRole("Moderator") ||
            User.IsInRole("Admin");
        if (!user.IsProfilePublic && !canViewPrivateProfile)
            return NotFound(ApiError.NotFound("User not found."));

        var recentThreads = await _db.DiscussionThreads
            .AsNoTracking()
            .Where(t => t.UserId == userId && !t.IsDeleted)
            .OrderByDescending(t => t.LastActivityUtc)
            .ThenByDescending(t => t.CreatedUtc)
            .Take(12)
            .Select(t => new UserThreadDto
            {
                Id = t.Id,
                AniListId = t.AniListId,
                EpisodeNumber = t.EpisodeNumber,
                Title = t.Title,
                Category = t.Category,
                ContainsSpoilers = t.ContainsSpoilers,
                IsLocked = t.IsLocked,
                IsPinned = t.IsPinned,
                CreatedUtc = t.CreatedUtc,
                LastActivityUtc = t.LastActivityUtc,
                CommentCount = t.Comments.Count(c => !c.IsDeleted),
                ReactionCount = _db.DiscussionReactions.Count(r => r.ThreadId == t.Id)
            })
            .ToListAsync();

        var favorites = await _db.TrackedShows
            .AsNoTracking()
            .Where(t => t.UserId == userId && t.IsFavorite)
            .OrderBy(t => t.Title)
            .Take(16)
            .Select(t => new UserFavoriteDto
            {
                AniListId = t.AniListId,
                Title = t.Title,
                CoverImageUrl = t.CoverImageUrl,
                Format = t.Format,
                AverageScore = t.AverageScore
            })
            .ToListAsync();

        var threadCount = await _db.DiscussionThreads
            .AsNoTracking()
            .CountAsync(t => t.UserId == userId && !t.IsDeleted);
        var commentCount = await _db.DiscussionComments
            .AsNoTracking()
            .CountAsync(c => c.UserId == userId && !c.IsDeleted && !c.Thread.IsDeleted);

        return Ok(new UserProfileDto
        {
            Id = user.Id,
            DisplayName = string.IsNullOrWhiteSpace(user.DisplayName) ? (user.Email ?? "User") : user.DisplayName,
            AvatarUrl = user.AvatarUrl,
            IsProfilePublic = user.IsProfilePublic,
            ThreadCount = threadCount,
            CommentCount = commentCount,
            RecentThreads = recentThreads,
            Favorites = favorites
        });
    }

    public sealed class UserProfileDto
    {
        public Guid Id { get; set; }
        public string DisplayName { get; set; } = "User";
        public string? AvatarUrl { get; set; }
        public bool IsProfilePublic { get; set; }
        public int ThreadCount { get; set; }
        public int CommentCount { get; set; }
        public List<UserThreadDto> RecentThreads { get; set; } = new();
        public List<UserFavoriteDto> Favorites { get; set; } = new();
    }

    public sealed class UserThreadDto
    {
        public Guid Id { get; set; }
        public int AniListId { get; set; }
        public int? EpisodeNumber { get; set; }
        public string Title { get; set; } = "";
        public string Category { get; set; } = "General";
        public bool ContainsSpoilers { get; set; }
        public bool IsPinned { get; set; }
        public bool IsLocked { get; set; }
        public DateTime CreatedUtc { get; set; }
        public DateTime? LastActivityUtc { get; set; }
        public int CommentCount { get; set; }
        public int ReactionCount { get; set; }
    }

    public sealed class UserFavoriteDto
    {
        public int AniListId { get; set; }
        public string Title { get; set; } = "";
        public string? CoverImageUrl { get; set; }
        public string? Format { get; set; }
        public int? AverageScore { get; set; }
    }

    private Guid? CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(id, out var parsed) ? parsed : null;
    }
}
