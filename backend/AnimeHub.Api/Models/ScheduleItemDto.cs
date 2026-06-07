namespace AnimeHub.Api.Models;

public sealed class ScheduleItemDto
{
    public int AniListId { get; set; }
    public int AiringAt { get; set; }
    public int Episode { get; set; }
    public int TimeUntilAiring { get; set; }
    public string? TitleRomaji { get; set; }
    public string? TitleEnglish { get; set; }
    public string? TitleNative { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? Format { get; set; }
    public string? Status { get; set; }
    public bool IsTracked { get; set; }
    public int? EpisodeProgress { get; set; }
    public bool IsWatched { get; set; }
}
