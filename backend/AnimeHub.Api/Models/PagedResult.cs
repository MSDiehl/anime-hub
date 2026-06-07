namespace AnimeHub.Api.Models;

public sealed class PagedResult<T>
{
    public int Page { get; set; }
    public int PerPage { get; set; }
    public int? Total { get; set; }
    public int? LastPage { get; set; }
    public bool HasNextPage { get; set; }
    public List<T> Items { get; set; } = new();
}
