using System.Net.Http.Json;
using System.Text.Json;
using AnimeHub.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace AnimeHub.Api.Controllers;

[ApiController]
[Route("api/anime")]
public class AnimeController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;

    public AnimeController(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    // -------------------------
    // GET /api/anime/search?q=...
    // -------------------------
    [HttpGet("search")]
    public async Task<ActionResult<List<AnimeSearchItem>>> Search(
        [FromQuery] string q,
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 10)
    {
        q = (q ?? "").Trim();
        if (q.Length < 2) return BadRequest(ApiError.Validation("Query must be at least 2 characters."));

        perPage = Math.Clamp(perPage, 1, 25);
        page = Math.Max(page, 1);

        var query = @"
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
      id
      title { romaji english native }
      format
      status
      episodes
      season
      seasonYear
      averageScore
      popularity
      coverImage { large }
    }
  }
}";

        var payload = new
        {
            query,
            variables = new { search = q, page, perPage }
        };

        var client = _httpClientFactory.CreateClient("AniList");
        using var resp = await client.PostAsJsonAsync("", payload);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            return StatusCode((int)resp.StatusCode, ApiError.Upstream("AniList search request failed."));

        var parsed = JsonSerializer.Deserialize<AniListResponse>(body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        var items = parsed?.Data?.Page?.Media?
            .Select(m => new AnimeSearchItem
            {
                AniListId = m.Id,
                TitleRomaji = m.Title?.Romaji,
                TitleEnglish = m.Title?.English,
                TitleNative = m.Title?.Native,
                Format = m.Format,
                Status = m.Status,
                Episodes = m.Episodes,
                Season = m.Season,
                SeasonYear = m.SeasonYear,
                AverageScore = m.AverageScore,
                Popularity = m.Popularity,
                CoverImageUrl = m.CoverImage?.Large
            })
            .ToList() ?? new List<AnimeSearchItem>();

        return Ok(items);
    }

    // -------------------------
    // GET /api/anime/{aniListId}
    // -------------------------
    [HttpGet("{aniListId:int}")]
    public async Task<ActionResult<AnimeDetailsDto>> GetById([FromRoute] int aniListId)
    {
        if (aniListId <= 0) return BadRequest(ApiError.Validation("Invalid AniList ID."));

        var query = @"
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    description(asHtml: true)
    format
    status
    episodes
    season
    seasonYear
    averageScore
    popularity
    genres
    source
    siteUrl
    coverImage { extraLarge large }
    bannerImage
    nextAiringEpisode { episode airingAt timeUntilAiring }
    trailer { id site thumbnail }
    studios(isMain: true) {
      nodes { id name siteUrl }
    }
    externalLinks { id url site type color icon }
    characters(perPage: 8, sort: ROLE) {
      edges {
        role
        node { id name { full } image { medium } }
        voiceActors(language: JAPANESE, sort: RELEVANCE) {
          id
          name { full }
          image { medium }
        }
      }
    }
    staff(perPage: 8) {
      edges {
        role
        node { id name { full } image { medium } }
      }
    }
    relations {
      edges {
        relationType
        node {
          id
          type
          format
          status
          season
          seasonYear
          averageScore
          popularity
          title { romaji english native }
          coverImage { large }
        }
      }
    }
  }
}";

        var payload = new
        {
            query,
            variables = new { id = aniListId }
        };

        var client = _httpClientFactory.CreateClient("AniList");
        using var resp = await client.PostAsJsonAsync("", payload);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            return StatusCode((int)resp.StatusCode, ApiError.Upstream("AniList details request failed."));

        var parsed = JsonSerializer.Deserialize<AniListDetailsResponse>(body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        var m = parsed?.Data?.Media;
        if (m == null) return NotFound(ApiError.NotFound("Anime was not found."));

        var relatedSeasons = m.Relations?.Edges?
            .Where(e =>
                e?.Node != null &&
                string.Equals(e.Node.Type, "ANIME", StringComparison.OrdinalIgnoreCase))
            .Select(e => new RelatedAnimeDto
            {
                AniListId = e!.Node!.Id,
                Title = e.Node.Title?.English ?? e.Node.Title?.Romaji ?? e.Node.Title?.Native ?? "Unknown",
                RelationType = e.RelationType,
                Format = e.Node.Format,
                Season = e.Node.Season,
                SeasonYear = e.Node.SeasonYear,
                Status = e.Node.Status,
                AverageScore = e.Node.AverageScore,
                Popularity = e.Node.Popularity,
                CoverImageUrl = e.Node.CoverImage?.Large
            })
            .OrderBy(x => x.SeasonYear ?? 9999)
            .ThenBy(x => SeasonSortValue(x.Season))
            .ThenBy(x => RelationSortValue(x.RelationType))
            .ThenBy(x => x.Title)
            .ToList() ?? new List<RelatedAnimeDto>();

        return Ok(new AnimeDetailsDto
        {
            AniListId = m.Id,
            Title = m.Title?.English ?? m.Title?.Romaji ?? m.Title?.Native ?? "Unknown",
            Description = m.Description,
            Format = m.Format,
            Status = m.Status,
            Episodes = m.Episodes,
            Season = m.Season,
            SeasonYear = m.SeasonYear,
            AverageScore = m.AverageScore,
            Popularity = m.Popularity,
            Genres = m.Genres ?? new List<string>(),
            Source = m.Source,
            SiteUrl = m.SiteUrl,
            CoverImageUrl = m.CoverImage?.ExtraLarge ?? m.CoverImage?.Large,
            BannerImageUrl = m.BannerImage,
            NextAiringEpisode = m.NextAiringEpisode == null
                ? null
                : new AiringEpisodeDto
                {
                    Episode = m.NextAiringEpisode.Episode,
                    AiringAt = m.NextAiringEpisode.AiringAt,
                    TimeUntilAiring = m.NextAiringEpisode.TimeUntilAiring
                },
            Trailer = ToTrailerDto(m.Trailer),
            Studios = m.Studios?.Nodes?
                .Select(x => new StudioDto { AniListId = x.Id, Name = x.Name ?? "Unknown", SiteUrl = x.SiteUrl })
                .Where(x => !string.IsNullOrWhiteSpace(x.Name))
                .ToList() ?? new List<StudioDto>(),
            ExternalLinks = m.ExternalLinks?
                .Where(x => !string.IsNullOrWhiteSpace(x.Url) && !string.IsNullOrWhiteSpace(x.Site))
                .Select(x => new ExternalLinkDto
                {
                    AniListId = x.Id,
                    Site = x.Site ?? "Link",
                    Url = x.Url ?? "",
                    Type = x.Type,
                    Color = x.Color,
                    IconUrl = x.Icon
                })
                .ToList() ?? new List<ExternalLinkDto>(),
            Characters = m.Characters?.Edges?
                .Where(x => x.Node != null)
                .Select(x =>
                {
                    var actor = x.VoiceActors?.FirstOrDefault();
                    return new CharacterDto
                    {
                        AniListId = x.Node!.Id,
                        Name = x.Node.Name?.Full ?? "Unknown",
                        ImageUrl = x.Node.Image?.Medium,
                        Role = x.Role,
                        VoiceActorName = actor?.Name?.Full,
                        VoiceActorImageUrl = actor?.Image?.Medium
                    };
                })
                .ToList() ?? new List<CharacterDto>(),
            Staff = m.Staff?.Edges?
                .Where(x => x.Node != null)
                .Select(x => new StaffDto
                {
                    AniListId = x.Node!.Id,
                    Name = x.Node.Name?.Full ?? "Unknown",
                    ImageUrl = x.Node.Image?.Medium,
                    Role = x.Role
                })
                .ToList() ?? new List<StaffDto>(),
            RelatedSeasons = relatedSeasons
        });
    }

    private static int SeasonSortValue(string? season) =>
        season?.ToUpperInvariant() switch
        {
            "WINTER" => 1,
            "SPRING" => 2,
            "SUMMER" => 3,
            "FALL" => 4,
            _ => 9
        };

    private static int RelationSortValue(string? relationType) =>
        relationType?.ToUpperInvariant() switch
        {
            "PREQUEL" => 1,
            "SEQUEL" => 2,
            "PARENT" => 3,
            "SIDE_STORY" => 4,
            "SPIN_OFF" => 5,
            "ADAPTATION" => 6,
            "ALTERNATIVE" => 7,
            "SUMMARY" => 8,
            _ => 20
        };

    private static TrailerDto? ToTrailerDto(AniListTrailer? trailer)
    {
        if (string.IsNullOrWhiteSpace(trailer?.Id))
            return null;

        var site = trailer.Site ?? "";
        var lowerSite = site.ToLowerInvariant();
        var url = lowerSite == "youtube"
            ? $"https://www.youtube.com/watch?v={trailer.Id}"
            : lowerSite == "dailymotion"
                ? $"https://www.dailymotion.com/video/{trailer.Id}"
                : null;
        var embedUrl = lowerSite == "youtube"
            ? $"https://www.youtube.com/embed/{trailer.Id}"
            : lowerSite == "dailymotion"
                ? $"https://www.dailymotion.com/embed/video/{trailer.Id}"
                : null;

        return new TrailerDto
        {
            Id = trailer.Id,
            Site = site,
            ThumbnailUrl = trailer.Thumbnail,
            Url = url,
            EmbedUrl = embedUrl
        };
    }

    // -------------------------
    // DTOs returned by our API
    // -------------------------
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

    // -------------------------
    // AniList response shapes (search)
    // -------------------------
    private sealed class AniListResponse
    {
        public AniListData? Data { get; set; }
    }

    private sealed class AniListData
    {
        public AniListPage? Page { get; set; }
    }

    private sealed class AniListPage
    {
        public List<AniListMedia>? Media { get; set; }
    }

    private sealed class AniListMedia
    {
        public int Id { get; set; }
        public AniListTitle? Title { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public int? Episodes { get; set; }
        public string? Season { get; set; }
        public int? SeasonYear { get; set; }
        public int? AverageScore { get; set; }
        public int? Popularity { get; set; }
        public AniListCoverImage? CoverImage { get; set; }
    }

    private sealed class AniListTitle
    {
        public string? Romaji { get; set; }
        public string? English { get; set; }
        public string? Native { get; set; }
    }

    private sealed class AniListCoverImage
    {
        public string? Large { get; set; }
    }

    // -------------------------
    // AniList response shapes (details)
    // -------------------------
    private sealed class AniListDetailsResponse
    {
        public AniListDetailsData? Data { get; set; }
    }

    private sealed class AniListDetailsData
    {
        public AniListDetailsMedia? Media { get; set; }
    }

    private sealed class AniListDetailsMedia
    {
        public int Id { get; set; }
        public AniListTitle? Title { get; set; }
        public string? Description { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public int? Episodes { get; set; }
        public string? Season { get; set; }
        public int? SeasonYear { get; set; }
        public int? AverageScore { get; set; }
        public int? Popularity { get; set; }
        public List<string>? Genres { get; set; }
        public string? Source { get; set; }
        public string? SiteUrl { get; set; }
        public AniListCoverImageEx? CoverImage { get; set; }
        public string? BannerImage { get; set; }
        public AniListAiringEpisode? NextAiringEpisode { get; set; }
        public AniListTrailer? Trailer { get; set; }
        public AniListStudioConnection? Studios { get; set; }
        public List<AniListExternalLink>? ExternalLinks { get; set; }
        public AniListCharacterConnection? Characters { get; set; }
        public AniListStaffConnection? Staff { get; set; }
        public AniListRelations? Relations { get; set; }
    }

    private sealed class AniListAiringEpisode
    {
        public int Episode { get; set; }
        public long AiringAt { get; set; }
        public int? TimeUntilAiring { get; set; }
    }

    private sealed class AniListTrailer
    {
        public string? Id { get; set; }
        public string? Site { get; set; }
        public string? Thumbnail { get; set; }
    }

    private sealed class AniListStudioConnection
    {
        public List<AniListStudio>? Nodes { get; set; }
    }

    private sealed class AniListStudio
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public string? SiteUrl { get; set; }
    }

    private sealed class AniListExternalLink
    {
        public int Id { get; set; }
        public string? Url { get; set; }
        public string? Site { get; set; }
        public string? Type { get; set; }
        public string? Color { get; set; }
        public string? Icon { get; set; }
    }

    private sealed class AniListCharacterConnection
    {
        public List<AniListCharacterEdge>? Edges { get; set; }
    }

    private sealed class AniListCharacterEdge
    {
        public string? Role { get; set; }
        public AniListCharacterNode? Node { get; set; }
        public List<AniListStaffNode>? VoiceActors { get; set; }
    }

    private sealed class AniListCharacterNode
    {
        public int Id { get; set; }
        public AniListName? Name { get; set; }
        public AniListImage? Image { get; set; }
    }

    private sealed class AniListStaffConnection
    {
        public List<AniListStaffEdge>? Edges { get; set; }
    }

    private sealed class AniListStaffEdge
    {
        public string? Role { get; set; }
        public AniListStaffNode? Node { get; set; }
    }

    private sealed class AniListStaffNode
    {
        public int Id { get; set; }
        public AniListName? Name { get; set; }
        public AniListImage? Image { get; set; }
    }

    private sealed class AniListName
    {
        public string? Full { get; set; }
    }

    private sealed class AniListImage
    {
        public string? Medium { get; set; }
    }

    private sealed class AniListCoverImageEx
    {
        public string? ExtraLarge { get; set; }
        public string? Large { get; set; }
    }

    private sealed class AniListRelations
    {
        public List<AniListRelationEdge>? Edges { get; set; }
    }

    private sealed class AniListRelationEdge
    {
        public string? RelationType { get; set; }
        public AniListRelationNode? Node { get; set; }
    }

    private sealed class AniListRelationNode
    {
        public int Id { get; set; }
        public string? Type { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public string? Season { get; set; }
        public int? SeasonYear { get; set; }
        public int? AverageScore { get; set; }
        public int? Popularity { get; set; }
        public AniListTitle? Title { get; set; }
        public AniListCoverImage? CoverImage { get; set; }
    }
}
