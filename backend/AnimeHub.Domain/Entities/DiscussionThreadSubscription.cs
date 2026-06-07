namespace AnimeHub.Domain.Entities;

public class DiscussionThreadSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public Guid ThreadId { get; set; }
    public DiscussionThread Thread { get; set; } = null!;

    public bool NotificationsEnabled { get; set; } = true;

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
