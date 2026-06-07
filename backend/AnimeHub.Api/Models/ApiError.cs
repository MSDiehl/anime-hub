namespace AnimeHub.Api.Models;

public sealed record ApiError(
    string Code,
    string Message,
    IReadOnlyDictionary<string, string[]>? Errors = null)
{
    public static ApiError Validation(string message, IReadOnlyDictionary<string, string[]>? errors = null) =>
        new("validation_error", message, errors);

    public static ApiError NotFound(string message) =>
        new("not_found", message);

    public static ApiError Conflict(string message) =>
        new("conflict", message);

    public static ApiError Unauthorized(string message) =>
        new("unauthorized", message);

    public static ApiError Upstream(string message) =>
        new("upstream_error", message);

    public static ApiError RateLimited(string message) =>
        new("rate_limited", message);
}
