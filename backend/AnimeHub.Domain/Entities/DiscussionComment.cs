using System.ComponentModel.DataAnnotations;

namespace AnimeHub.Domain.Entities;

public class DiscussionComment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ThreadId { get; set; }
    public DiscussionThread Thread { get; set; } = null!;

    public Guid UserId { get; set; }

    [MaxLength(3000)]
    public string Body { get; set; } = "";

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedUtc { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedUtc { get; set; }
}
