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

    [HttpGet("search")]
    public async Task<ActionResult<List<AnimeSearchItem>>> Search([FromQuery] string q, [FromQuery] int page = 1, [FromQuery] int perPage = 10)
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

    // --- DTOs ---
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

    // --- AniList response shapes ---
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
}
