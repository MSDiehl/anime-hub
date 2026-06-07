using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AnimeHub.Api.Models;
using Microsoft.Extensions.Caching.Distributed;

namespace AnimeHub.Api.Services;

public interface IScheduleDataService
{
    Task<List<ScheduleItemDto>> GetScheduleAsync(
        DateOnly startDate,
        int days,
        IReadOnlyCollection<int>? mediaIds = null,
        CancellationToken cancellationToken = default);
}

public sealed class ScheduleDataService : IScheduleDataService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly DistributedCacheEntryOptions CacheOptions = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(20)
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IDistributedCache _cache;
    private readonly ILogger<ScheduleDataService> _logger;

    public ScheduleDataService(
        IHttpClientFactory httpClientFactory,
        IDistributedCache cache,
        ILogger<ScheduleDataService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _logger = logger;
    }

    public async Task<List<ScheduleItemDto>> GetScheduleAsync(
        DateOnly startDate,
        int days,
        IReadOnlyCollection<int>? mediaIds = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedIds = mediaIds?
            .Where(id => id > 0)
            .Distinct()
            .Order()
            .ToList();

        var cacheKey = BuildCacheKey(startDate, days, normalizedIds);
        var cached = await _cache.GetStringAsync(cacheKey, cancellationToken);
        if (!string.IsNullOrWhiteSpace(cached))
        {
            var cachedItems = JsonSerializer.Deserialize<List<ScheduleItemDto>>(cached, JsonOptions);
            if (cachedItems != null)
                return cachedItems;
        }

        var fresh = await FetchScheduleAsync(startDate, days, normalizedIds, cancellationToken);
        await _cache.SetStringAsync(
            cacheKey,
            JsonSerializer.Serialize(fresh, JsonOptions),
            CacheOptions,
            cancellationToken);

        return fresh;
    }

    private async Task<List<ScheduleItemDto>> FetchScheduleAsync(
        DateOnly startDate,
        int days,
        IReadOnlyCollection<int>? mediaIds,
        CancellationToken cancellationToken)
    {
        var startUtc = startDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var endUtc = startUtc.AddDays(days);

        var startUnix = (int)new DateTimeOffset(startUtc).ToUnixTimeSeconds();
        var endUnix = (int)new DateTimeOffset(endUtc).ToUnixTimeSeconds();
        var trackedOnly = mediaIds is { Count: > 0 };
        var nodes = new List<AiringScheduleNode>();

        for (var page = 1; page <= 5; page++)
        {
            var parsed = await FetchPageAsync(
                page,
                startUnix,
                endUnix,
                trackedOnly,
                mediaIds,
                cancellationToken);

            var pageData = parsed?.Data?.Page;
            nodes.AddRange(pageData?.AiringSchedules ?? new List<AiringScheduleNode>());

            if (pageData?.PageInfo?.HasNextPage != true)
                break;
        }

        return nodes
            .Where(x => x.Media is not null && x.Media.IsAdult != true)
            .Select(x => new ScheduleItemDto
            {
                AniListId = x.Media!.Id,
                AiringAt = x.AiringAt,
                Episode = x.Episode,
                TimeUntilAiring = x.TimeUntilAiring,
                TitleRomaji = x.Media.Title?.Romaji,
                TitleEnglish = x.Media.Title?.English,
                TitleNative = x.Media.Title?.Native,
                CoverImageUrl = x.Media.CoverImage?.Large ?? x.Media.CoverImage?.Medium,
                Format = x.Media.Format,
                Status = x.Media.Status
            })
            .ToList();
    }

    private async Task<AniListScheduleResponse?> FetchPageAsync(
        int page,
        int startUnix,
        int endUnix,
        bool trackedOnly,
        IReadOnlyCollection<int>? mediaIds,
        CancellationToken cancellationToken)
    {
        object payload = trackedOnly
            ? new
            {
                query = TrackedQuery,
                variables = new
                {
                    page,
                    perPage = 200,
                    start = startUnix,
                    end = endUnix,
                    mediaIds
                }
            }
            : new
            {
                query = GlobalQuery,
                variables = new
                {
                    page,
                    perPage = 200,
                    start = startUnix,
                    end = endUnix
                }
            };

        var client = _httpClientFactory.CreateClient("AniList");
        HttpResponseMessage? response = null;
        var body = "";

        for (var attempt = 1; attempt <= 2; attempt++)
        {
            response = await client.PostAsJsonAsync("", payload, cancellationToken);
            body = await response.Content.ReadAsStringAsync(cancellationToken);

            if ((int)response.StatusCode < 500)
                break;

            _logger.LogWarning(
                "AniList schedule attempt {Attempt} failed: {Status} {Body}",
                attempt,
                response.StatusCode,
                body);

            await Task.Delay(250 * attempt, cancellationToken);
        }

        if (response == null || !response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "AniList schedule failed: {Status} {Body}",
                response?.StatusCode,
                body);

            throw new ScheduleUpstreamException("AniList schedule request failed.");
        }

        return JsonSerializer.Deserialize<AniListScheduleResponse>(
            body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    }

    private static string BuildCacheKey(DateOnly startDate, int days, IReadOnlyCollection<int>? mediaIds)
    {
        var ids = mediaIds is { Count: > 0 } ? string.Join(",", mediaIds) : "global";
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ids)))[..16];
        return $"schedule:v2:{startDate:yyyyMMdd}:{days}:{hash}";
    }

    private const string GlobalQuery = @"
query ($page:Int,$perPage:Int,$start:Int,$end:Int) {
  Page(page:$page, perPage:$perPage) {
    pageInfo { hasNextPage }
    airingSchedules(
      airingAt_greater:$start,
      airingAt_lesser:$end,
      sort:TIME
    ) {
      airingAt
      episode
      timeUntilAiring
      media {
        id
        format
        status
        isAdult
        title { romaji english native }
        coverImage { large medium }
      }
    }
  }
}";

    private const string TrackedQuery = @"
query ($page:Int,$perPage:Int,$start:Int,$end:Int,$mediaIds:[Int]) {
  Page(page:$page, perPage:$perPage) {
    pageInfo { hasNextPage }
    airingSchedules(
      airingAt_greater:$start,
      airingAt_lesser:$end,
      mediaId_in:$mediaIds,
      sort:TIME
    ) {
      airingAt
      episode
      timeUntilAiring
      media {
        id
        format
        status
        isAdult
        title { romaji english native }
        coverImage { large medium }
      }
    }
  }
}";

    private sealed class AniListScheduleResponse { public AniListData? Data { get; set; } }
    private sealed class AniListData { public AniListPage? Page { get; set; } }
    private sealed class AniListPage
    {
        public PageInfoNode? PageInfo { get; set; }
        public List<AiringScheduleNode> AiringSchedules { get; set; } = new();
    }

    private sealed class PageInfoNode
    {
        public bool HasNextPage { get; set; }
    }

    private sealed class AiringScheduleNode
    {
        public int AiringAt { get; set; }
        public int Episode { get; set; }
        public int TimeUntilAiring { get; set; }
        public MediaNode? Media { get; set; }
    }

    private sealed class MediaNode
    {
        public int Id { get; set; }
        public bool? IsAdult { get; set; }
        public string? Format { get; set; }
        public string? Status { get; set; }
        public TitleNode? Title { get; set; }
        public CoverImageNode? CoverImage { get; set; }
    }

    private sealed class TitleNode
    {
        public string? Romaji { get; set; }
        public string? English { get; set; }
        public string? Native { get; set; }
    }

    private sealed class CoverImageNode
    {
        public string? Large { get; set; }
        public string? Medium { get; set; }
    }
}

public sealed class ScheduleUpstreamException : Exception
{
    public ScheduleUpstreamException(string message) : base(message)
    {
    }
}

public sealed class ScheduleRefreshService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ScheduleRefreshService> _logger;

    public ScheduleRefreshService(IServiceProvider services, ILogger<ScheduleRefreshService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(30));

        while (!stoppingToken.IsCancellationRequested)
        {
            await RefreshOnce(stoppingToken);

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RefreshOnce(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = _services.CreateScope();
            var scheduleData = scope.ServiceProvider.GetRequiredService<IScheduleDataService>();

            await scheduleData.GetScheduleAsync(
                DateOnly.FromDateTime(DateTime.UtcNow),
                days: 14,
                cancellationToken: stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Background schedule refresh failed.");
        }
    }
}
