using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AnimeHub.Api.Models;
using Microsoft.Extensions.Caching.Distributed;

namespace AnimeHub.Api.Services;

public interface IAniListService
{
    Task<PagedResult<AnimeSearchItem>> SearchAnimeAsync(
        string search,
        int page,
        int perPage,
        CancellationToken cancellationToken = default);

    Task<AnimeDetailsDto?> GetAnimeDetailsAsync(
        int aniListId,
        CancellationToken cancellationToken = default);
}

public sealed class AniListService : IAniListService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly DistributedCacheEntryOptions DetailsCacheOptions = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IDistributedCache _cache;
    private readonly ILogger<AniListService> _logger;

    public AniListService(
        IHttpClientFactory httpClientFactory,
        IDistributedCache cache,
        ILogger<AniListService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _logger = logger;
    }

    public async Task<PagedResult<AnimeSearchItem>> SearchAnimeAsync(
        string search,
        int page,
        int perPage,
        CancellationToken cancellationToken = default)
    {
        var parsed = await PostAsync<AniListSearchResponse>(
            SearchQuery,
            new { search, page, perPage },
            "anime search",
            cancellationToken);

        var pageData = parsed.Data?.Page;
        var items = pageData?.Media?
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

        return new PagedResult<AnimeSearchItem>
        {
            Page = pageData?.PageInfo?.CurrentPage ?? page,
            PerPage = pageData?.PageInfo?.PerPage ?? perPage,
            Total = pageData?.PageInfo?.Total,
            LastPage = pageData?.PageInfo?.LastPage,
            HasNextPage = pageData?.PageInfo?.HasNextPage ?? false,
            Items = items
        };
    }

    public async Task<AnimeDetailsDto?> GetAnimeDetailsAsync(
        int aniListId,
        CancellationToken cancellationToken = default)
    {
        var cacheKey = $"anime:details:v1:{aniListId}";
        var cached = await _cache.GetStringAsync(cacheKey, cancellationToken);
        if (!string.IsNullOrWhiteSpace(cached))
        {
            var cachedDetails = JsonSerializer.Deserialize<AnimeDetailsDto>(cached, JsonOptions);
            if (cachedDetails != null) return cachedDetails;
        }

        var parsed = await PostAsync<AniListDetailsResponse>(
            DetailsQuery,
            new { id = aniListId },
            "anime details",
            cancellationToken);

        var m = parsed.Data?.Media;
        if (m == null) return null;

        var details = MapDetails(m);
        await _cache.SetStringAsync(
            cacheKey,
            JsonSerializer.Serialize(details, JsonOptions),
            DetailsCacheOptions,
            cancellationToken);

        return details;
    }

    private async Task<T> PostAsync<T>(
        string query,
        object variables,
        string operationName,
        CancellationToken cancellationToken)
    {
        var payload = new { query, variables };
        var client = _httpClientFactory.CreateClient("AniList");
        HttpResponseMessage? response = null;
        var body = "";

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            response = await client.PostAsJsonAsync("", payload, cancellationToken);
            body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
                return JsonSerializer.Deserialize<T>(body, JsonOptions)
                    ?? throw new AniListUpstreamException($"AniList {operationName} returned an empty response.");

            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                var delay = GetRetryDelay(response, attempt);
                _logger.LogWarning(
                    "AniList rate limited {Operation} attempt {Attempt}; retrying in {DelayMs} ms.",
                    operationName,
                    attempt,
                    delay.TotalMilliseconds);

                if (attempt == 3)
                    throw new AniListRateLimitException("AniList rate limit reached. Try again shortly.");

                await Task.Delay(delay, cancellationToken);
                continue;
            }

            if ((int)response.StatusCode >= 500 && attempt < 3)
            {
                var delay = TimeSpan.FromMilliseconds(300 * attempt);
                _logger.LogWarning(
                    "AniList {Operation} attempt {Attempt} failed: {Status}.",
                    operationName,
                    attempt,
                    response.StatusCode);

                await Task.Delay(delay, cancellationToken);
                continue;
            }

            break;
        }

        _logger.LogWarning(
            "AniList {Operation} failed: {Status} {Body}",
            operationName,
            response?.StatusCode,
            body);

        throw new AniListUpstreamException($"AniList {operationName} request failed.");
    }

    private static TimeSpan GetRetryDelay(HttpResponseMessage response, int attempt)
    {
        if (response.Headers.RetryAfter?.Delta is { } delta)
            return TimeSpan.FromMilliseconds(Math.Min(delta.TotalMilliseconds, 4000));

        return TimeSpan.FromMilliseconds(500 * attempt);
    }

    private static AnimeDetailsDto MapDetails(AniListDetailsMedia m)
    {
        var relatedSeasons = m.Relations?.Edges?
            .Where(e =>
                e?.Node != null &&
                string.Equals(e.Node.Type, "ANIME", StringComparison.OrdinalIgnoreCase))
            .Select(e => new RelatedAnimeDto
            {
                AniListId = e!.Node!.Id,
                Title = BestTitle(e.Node.Title),
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

        return new AnimeDetailsDto
        {
            AniListId = m.Id,
            Title = BestTitle(m.Title),
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
        };
    }

    private static string BestTitle(AniListTitle? title) =>
        title?.English ?? title?.Romaji ?? title?.Native ?? "Unknown";

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

    private const string SearchQuery = @"
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage perPage }
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

    private const string DetailsQuery = @"
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

    private sealed class AniListSearchResponse { public AniListSearchData? Data { get; set; } }
    private sealed class AniListSearchData { public AniListSearchPage? Page { get; set; } }
    private sealed class AniListSearchPage
    {
        public AniListPageInfo? PageInfo { get; set; }
        public List<AniListMedia>? Media { get; set; }
    }

    private sealed class AniListPageInfo
    {
        public int? Total { get; set; }
        public int? CurrentPage { get; set; }
        public int? LastPage { get; set; }
        public bool HasNextPage { get; set; }
        public int? PerPage { get; set; }
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

    private sealed class AniListDetailsResponse { public AniListDetailsData? Data { get; set; } }
    private sealed class AniListDetailsData { public AniListDetailsMedia? Media { get; set; } }
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

public class AniListUpstreamException : Exception
{
    public AniListUpstreamException(string message) : base(message)
    {
    }
}

public sealed class AniListRateLimitException : AniListUpstreamException
{
    public AniListRateLimitException(string message) : base(message)
    {
    }
}
