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
            User.IsInRole("Owner") ||
            User.IsInRole("Moderator") ||
            User.IsInRole("Admin");
        if (!user.IsProfilePublic && !canViewPrivateProfile)
            return NotFound(ApiError.NotFound("User not found."));

        var trackedShows = await _db.TrackedShows
            .AsNoTracking()
            .Where(t => t.UserId == userId)
            .OrderByDescending(t => t.UpdatedUtc ?? t.CreatedUtc)
            .ToListAsync();

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

        var favorites = trackedShows
            .Where(t => t.IsFavorite)
            .OrderBy(t => t.Title)
            .Take(16)
            .Select(ToFavoriteDto)
            .ToList();

        var shelves = BuildShelves(trackedShows);
        var stats = BuildStats(trackedShows);
        var recentActivity = recentThreads
            .Select(thread => new UserActivityDto
            {
                Type = "thread",
                Title = thread.Title,
                OccurredUtc = thread.LastActivityUtc ?? thread.CreatedUtc,
                ThreadId = thread.Id,
                AniListId = thread.AniListId
            })
            .Concat(trackedShows.Take(10).Select(show => new UserActivityDto
            {
                Type = string.Equals(show.TrackingStatus, "Completed", StringComparison.OrdinalIgnoreCase)
                    ? "completed"
                    : "tracked",
                Title = show.Title,
                OccurredUtc = show.UpdatedUtc ?? show.CreatedUtc,
                AniListId = show.AniListId,
                CoverImageUrl = show.CoverImageUrl
            }))
            .OrderByDescending(activity => activity.OccurredUtc)
            .Take(16)
            .ToList();

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
            Stats = stats,
            Shelves = shelves,
            RecentActivity = recentActivity,
            RecentThreads = recentThreads,
            Favorites = favorites
        });
    }

    private static UserProfileStatsDto BuildStats(IReadOnlyCollection<Domain.Entities.TrackedShow> trackedShows)
    {
        var ratings = trackedShows
            .Where(show => show.PersonalRating.HasValue)
            .Select(show => show.PersonalRating!.Value)
            .ToList();

        return new UserProfileStatsDto
        {
            TrackedCount = trackedShows.Count,
            WatchingCount = trackedShows.Count(show => string.Equals(show.TrackingStatus, "Watching", StringComparison.OrdinalIgnoreCase)),
            CompletedCount = trackedShows.Count(show => string.Equals(show.TrackingStatus, "Completed", StringComparison.OrdinalIgnoreCase)),
            PlanToWatchCount = trackedShows.Count(show => string.Equals(show.TrackingStatus, "PlanToWatch", StringComparison.OrdinalIgnoreCase)),
            FavoriteCount = trackedShows.Count(show => show.IsFavorite),
            EpisodesWatched = trackedShows.Sum(show => show.EpisodeProgress),
            AverageRating = ratings.Count == 0 ? null : Math.Round(ratings.Average(), 1),
            TopGenres = trackedShows
                .SelectMany(show => SplitCsv(show.GenreCsv))
                .GroupBy(genre => genre, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(group => group.Count())
                .ThenBy(group => group.Key)
                .Take(6)
                .Select(group => group.Key)
                .ToList()
        };
    }

    private static List<UserShelfDto> BuildShelves(IReadOnlyCollection<Domain.Entities.TrackedShow> trackedShows)
    {
        var customShelves = trackedShows
            .Where(show => !string.IsNullOrWhiteSpace(show.CustomListName))
            .GroupBy(show => show.CustomListName!, StringComparer.OrdinalIgnoreCase)
            .OrderBy(group => group.Key)
            .Select(group => new UserShelfDto
            {
                Name = group.Key,
                Kind = "custom",
                Items = group
                    .OrderByDescending(show => show.IsFavorite)
                    .ThenByDescending(show => show.PersonalRating ?? -1)
                    .ThenBy(show => show.Title)
                    .Take(8)
                    .Select(ToFavoriteDto)
                    .ToList()
            });

        var statusShelves = new[] { "Watching", "Completed", "PlanToWatch" }
            .Select(status => new UserShelfDto
            {
                Name = status == "PlanToWatch" ? "Plan to Watch" : status,
                Kind = "status",
                Items = trackedShows
                    .Where(show => string.Equals(show.TrackingStatus, status, StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(show => show.IsFavorite)
                    .ThenByDescending(show => show.UpdatedUtc ?? show.CreatedUtc)
                    .Take(8)
                    .Select(ToFavoriteDto)
                    .ToList()
            })
            .Where(shelf => shelf.Items.Count > 0);

        return customShelves.Concat(statusShelves).Take(8).ToList();
    }

    private static UserFavoriteDto ToFavoriteDto(Domain.Entities.TrackedShow show) => new()
    {
        AniListId = show.AniListId,
        Title = show.Title,
        CoverImageUrl = show.CoverImageUrl,
        Format = show.Format,
        AverageScore = show.AverageScore,
        PersonalRating = show.PersonalRating,
        TrackingStatus = show.TrackingStatus,
        CustomListName = show.CustomListName,
        UserTags = SplitCsv(show.UserTagCsv)
    };

    private static List<string> SplitCsv(string? csv) =>
        string.IsNullOrWhiteSpace(csv)
            ? new List<string>()
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    public sealed class UserProfileDto
    {
        public Guid Id { get; set; }
        public string DisplayName { get; set; } = "User";
        public string? AvatarUrl { get; set; }
        public bool IsProfilePublic { get; set; }
        public int ThreadCount { get; set; }
        public int CommentCount { get; set; }
        public UserProfileStatsDto Stats { get; set; } = new();
        public List<UserShelfDto> Shelves { get; set; } = new();
        public List<UserActivityDto> RecentActivity { get; set; } = new();
        public List<UserThreadDto> RecentThreads { get; set; } = new();
        public List<UserFavoriteDto> Favorites { get; set; } = new();
    }

    public sealed class UserProfileStatsDto
    {
        public int TrackedCount { get; set; }
        public int WatchingCount { get; set; }
        public int CompletedCount { get; set; }
        public int PlanToWatchCount { get; set; }
        public int FavoriteCount { get; set; }
        public int EpisodesWatched { get; set; }
        public double? AverageRating { get; set; }
        public List<string> TopGenres { get; set; } = new();
    }

    public sealed class UserShelfDto
    {
        public string Name { get; set; } = "";
        public string Kind { get; set; } = "custom";
        public List<UserFavoriteDto> Items { get; set; } = new();
    }

    public sealed class UserActivityDto
    {
        public string Type { get; set; } = "";
        public string Title { get; set; } = "";
        public DateTime OccurredUtc { get; set; }
        public int? AniListId { get; set; }
        public Guid? ThreadId { get; set; }
        public string? CoverImageUrl { get; set; }
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
        public int? PersonalRating { get; set; }
        public string TrackingStatus { get; set; } = "PlanToWatch";
        public string? CustomListName { get; set; }
        public List<string> UserTags { get; set; } = new();
    }

    private Guid? CurrentUserId()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(id, out var parsed) ? parsed : null;
    }
}
