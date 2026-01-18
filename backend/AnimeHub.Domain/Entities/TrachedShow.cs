namespace AnimeHub.Domain.Entities;

public class TrackedShow
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // External source (AniList)
    public int AniListId { get; set; }

    // Basic metadata stored locally
    public string Title { get; set; } = string.Empty;
    public string? CoverImageUrl { get; set; }
    public string? Format { get; set; }
    public string? Status { get; set; }
    public int? Episodes { get; set; }
    public string? Season { get; set; }
    public int? SeasonYear { get; set; }

    // Snapshotted metrics (optional for now)
    public int? AverageScore { get; set; }
    public int? Popularity { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
