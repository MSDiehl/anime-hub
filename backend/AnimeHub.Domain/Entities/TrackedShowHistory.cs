namespace AnimeHub.Domain.Entities;

public class TrackedShowHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public int AniListId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string EventType { get; set; } = string.Empty;

    public string? FromValue { get; set; }

    public string? ToValue { get; set; }

    public int? EpisodeNumber { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
