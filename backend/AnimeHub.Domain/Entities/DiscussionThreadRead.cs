namespace AnimeHub.Domain.Entities;

public class DiscussionThreadRead
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public Guid ThreadId { get; set; }
    public DiscussionThread Thread { get; set; } = null!;

    public DateTime LastReadUtc { get; set; } = DateTime.UtcNow;
}
