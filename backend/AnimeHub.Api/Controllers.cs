using System.Net.Http.Json;
using System.Text.Json;
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
        if (q.Length < 2) return BadRequest("Query must be at least 2 characters.");

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
            return StatusCode((int)resp.StatusCode, body);

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
        if (aniListId <= 0) return BadRequest("Invalid AniList ID.");

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
    coverImage { extraLarge large }
    bannerImage
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
            return StatusCode((int)resp.StatusCode, body);

        var parsed = JsonSerializer.Deserialize<AniListDetailsResponse>(body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        var m = parsed?.Data?.Media;
        if (m == null) return NotFound();

        // Extract “seasons” from relations:
        // v1: include PREQUEL/SEQUEL only, sorted by season year.
        var relatedSeasons = m.Relations?.Edges?
            .Where(e =>
                e?.Node != null &&
                string.Equals(e.Node.Type, "ANIME", StringComparison.OrdinalIgnoreCase) &&
                (string.Equals(e.RelationType, "PREQUEL", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(e.RelationType, "SEQUEL", StringComparison.OrdinalIgnoreCase)))
            .Select(e => new RelatedAnimeDto
            {
                AniListId = e!.Node!.Id,
                Title = e.Node.Title?.English ?? e.Node.Title?.Romaji ?? e.Node.Title?.Native ?? "Unknown",
                RelationType = e.RelationType,
                Season = e.Node.Season,
                SeasonYear = e.Node.SeasonYear,
                Status = e.Node.Status,
                CoverImageUrl = e.Node.CoverImage?.Large
            })
            .OrderBy(x => x.SeasonYear ?? 9999)
            .ThenBy(x => x.Season ?? "")
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
            CoverImageUrl = m.CoverImage?.ExtraLarge ?? m.CoverImage?.Large,
            BannerImageUrl = m.BannerImage,
            RelatedSeasons = relatedSeasons
        });
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
        public string? Season { get; set; }
        public int? SeasonYear { get; set; }
        public string? Status { get; set; }
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
        public string? CoverImageUrl { get; set; }
        public string? BannerImageUrl { get; set; }

        // ✅ This is where RelatedSeasons belongs
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
        public AniListCoverImageEx? CoverImage { get; set; }
        public string? BannerImage { get; set; }

        public AniListRelations? Relations { get; set; }
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
        public AniListTitle? Title { get; set; }
        public AniListCoverImage? CoverImage { get; set; }
    }
}
