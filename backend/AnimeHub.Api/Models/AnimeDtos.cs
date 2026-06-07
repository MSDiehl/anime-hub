namespace AnimeHub.Api.Models;

public sealed class AnimeSearchItem
{
    public int AniListId { get; set; }
    public string? TitleRomaji { get; set; }
    public string? TitleEnglish { get; set; }
    public string? TitleNative { get; set; }
    public string? Format { get; set; }
    public string? Status { get; set; }
    public int? Episodes { get; set; }
    public string? Season { get; set; }
    public int? SeasonYear { get; set; }
    public int? AverageScore { get; set; }
    public int? Popularity { get; set; }
    public string? CoverImageUrl { get; set; }
}

public sealed class AnimeDetailsDto
{
    public int AniListId { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string? Format { get; set; }
    public string? Status { get; set; }
    public int? Episodes { get; set; }
    public string? Season { get; set; }
    public int? SeasonYear { get; set; }
    public int? AverageScore { get; set; }
    public int? Popularity { get; set; }
    public List<string> Genres { get; set; } = new();
    public string? Source { get; set; }
    public string? SiteUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? BannerImageUrl { get; set; }
    public AiringEpisodeDto? NextAiringEpisode { get; set; }
    public TrailerDto? Trailer { get; set; }
    public List<StudioDto> Studios { get; set; } = new();
    public List<ExternalLinkDto> ExternalLinks { get; set; } = new();
    public List<CharacterDto> Characters { get; set; } = new();
    public List<StaffDto> Staff { get; set; } = new();
    public List<RelatedAnimeDto> RelatedSeasons { get; set; } = new();
}

public sealed class RelatedAnimeDto
{
    public int AniListId { get; set; }
    public string Title { get; set; } = "";
    public string? RelationType { get; set; }
    public string? Format { get; set; }
    public string? Season { get; set; }
    public int? SeasonYear { get; set; }
    public string? Status { get; set; }
    public int? AverageScore { get; set; }
    public int? Popularity { get; set; }
    public string? CoverImageUrl { get; set; }
}

public sealed class AiringEpisodeDto
{
    public int Episode { get; set; }
    public long AiringAt { get; set; }
    public int? TimeUntilAiring { get; set; }
}

public sealed class TrailerDto
{
    public string Id { get; set; } = "";
    public string? Site { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? Url { get; set; }
    public string? EmbedUrl { get; set; }
}

public sealed class StudioDto
{
    public int AniListId { get; set; }
    public string Name { get; set; } = "";
    public string? SiteUrl { get; set; }
}

public sealed class ExternalLinkDto
{
    public int AniListId { get; set; }
    public string Site { get; set; } = "";
    public string Url { get; set; } = "";
    public string? Type { get; set; }
    public string? Color { get; set; }
    public string? IconUrl { get; set; }
}

public sealed class CharacterDto
{
    public int AniListId { get; set; }
    public string Name { get; set; } = "";
    public string? ImageUrl { get; set; }
    public string? Role { get; set; }
    public string? VoiceActorName { get; set; }
    public string? VoiceActorImageUrl { get; set; }
}

public sealed class StaffDto
{
    public int AniListId { get; set; }
    public string Name { get; set; } = "";
    public string? ImageUrl { get; set; }
    public string? Role { get; set; }
}
