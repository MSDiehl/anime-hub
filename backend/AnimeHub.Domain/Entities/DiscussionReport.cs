using System.ComponentModel.DataAnnotations;

namespace AnimeHub.Domain.Entities;

public class DiscussionReport
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ReporterUserId { get; set; }

    public Guid? ThreadId { get; set; }
    public DiscussionThread? Thread { get; set; }

    public Guid? CommentId { get; set; }
    public DiscussionComment? Comment { get; set; }

    [MaxLength(1000)]
    public string Reason { get; set; } = "";

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
