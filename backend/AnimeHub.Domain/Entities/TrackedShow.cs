namespace AnimeHub.Domain.Entities;

public class TrackedShow
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public int AniListId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? CoverImageUrl { get; set; }
    public string? Format { get; set; }
    public string? Status { get; set; }
    public int? Episodes { get; set; }
    public string? Season { get; set; }
    public int? SeasonYear { get; set; }
    public int? AverageScore { get; set; }
    public int? Popularity { get; set; }
    public string? GenreCsv { get; set; }

    public string TrackingStatus { get; set; } = "PlanToWatch";
    public int EpisodeProgress { get; set; }
    public int? PersonalRating { get; set; }
    public bool IsFavorite { get; set; }
    public string? Notes { get; set; }
    public string? Review { get; set; }
    public string? CustomListName { get; set; }
    public string? UserTagCsv { get; set; }
    public int RewatchCount { get; set; }
    public DateOnly? StartedOn { get; set; }
    public DateOnly? CompletedOn { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedUtc { get; set; }
}
