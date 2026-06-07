using System.ComponentModel.DataAnnotations;

namespace AnimeHub.Domain.Entities;

public class DiscussionReaction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public Guid? ThreadId { get; set; }
    public DiscussionThread? Thread { get; set; }

    public Guid? CommentId { get; set; }
    public DiscussionComment? Comment { get; set; }

    [MaxLength(40)]
    public string Type { get; set; } = "upvote";

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
