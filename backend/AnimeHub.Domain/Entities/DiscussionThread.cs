using System.ComponentModel.DataAnnotations;

namespace AnimeHub.Domain.Entities;

public class DiscussionThread
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public int AniListId { get; set; }

    // null = general show discussion, otherwise episode-scoped thread
    public int? EpisodeNumber { get; set; }

    public Guid UserId { get; set; }

    [MaxLength(200)]
    public string Title { get; set; } = "";

    [MaxLength(5000)]
    public string Body { get; set; } = "";

    [MaxLength(80)]
    public string Category { get; set; } = "General";

    [MaxLength(500)]
    public string? TagCsv { get; set; }

    public bool ContainsSpoilers { get; set; }

    public bool IsPinned { get; set; }

    public bool IsLocked { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedUtc { get; set; }

    public DateTime? DeletedUtc { get; set; }

    public DateTime LastActivityUtc { get; set; } = DateTime.UtcNow;

    public ICollection<DiscussionComment> Comments { get; set; } = new List<DiscussionComment>();
}
