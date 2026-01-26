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

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedUtc { get; set; }

    public ICollection<DiscussionComment> Comments { get; set; } = new List<DiscussionComment>();
}
