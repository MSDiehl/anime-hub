using AnimeHub.Domain.Entities;
using Xunit;

namespace AnimeHub.Api.Tests;

public class TrackedShowTests
{
    [Fact]
    public void NewTrackedShowGetsIdentityAndCreatedTimestamp()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var show = new TrackedShow();
        var after = DateTime.UtcNow.AddSeconds(1);

        Assert.NotEqual(Guid.Empty, show.Id);
        Assert.InRange(show.CreatedUtc, before, after);
        Assert.Equal("PlanToWatch", show.TrackingStatus);
        Assert.Equal(0, show.EpisodeProgress);
        Assert.False(show.IsFavorite);
        Assert.Equal(0, show.RewatchCount);
    }
}
