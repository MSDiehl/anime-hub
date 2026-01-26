using Microsoft.AspNetCore.Identity;

namespace AnimeHub.Infrastructure.Auth;

public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = "";
}
