using Microsoft.AspNetCore.Identity;

namespace AnimeHub.Infrastructure.Auth;

public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = "";

    public string? AvatarUrl { get; set; }

    public bool IsProfilePublic { get; set; } = true;

    public int TrustLevel { get; set; }

    public DateTime? CommunitySuspendedUntilUtc { get; set; }
}
