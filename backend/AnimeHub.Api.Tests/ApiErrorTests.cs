using AnimeHub.Api.Models;
using Xunit;

namespace AnimeHub.Api.Tests;

public class ApiErrorTests
{
    [Fact]
    public void ValidationFactoryCreatesStableValidationCode()
    {
        var error = ApiError.Validation("Title is required.");

        Assert.Equal("validation_error", error.Code);
        Assert.Equal("Title is required.", error.Message);
    }

    [Fact]
    public void ValidationFactoryKeepsFieldErrors()
    {
        var fieldErrors = new Dictionary<string, string[]>
        {
            ["Password"] = ["Password is too short."]
        };

        var error = ApiError.Validation("Registration failed.", fieldErrors);

        Assert.Equal(fieldErrors, error.Errors);
    }

    [Fact]
    public void RateLimitedFactoryCreatesStableRateLimitCode()
    {
        var error = ApiError.RateLimited("Too many requests.");

        Assert.Equal("rate_limited", error.Code);
        Assert.Equal("Too many requests.", error.Message);
    }
}
