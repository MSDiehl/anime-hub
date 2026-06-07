using AnimeHub.Domain.Entities;
using AnimeHub.Infrastructure.Auth;
using AnimeHub.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Api.Services;

public sealed class DevDataSeeder
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly RoleManager<IdentityRole<Guid>> _roles;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DevDataSeeder> _logger;

    public DevDataSeeder(
        AppDbContext db,
        UserManager<ApplicationUser> users,
        RoleManager<IdentityRole<Guid>> roles,
        IConfiguration configuration,
        ILogger<DevDataSeeder> logger)
    {
        _db = db;
        _users = users;
        _roles = roles;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (!_configuration.GetValue("SeedData:Enabled", false))
            return;

        await EnsureRole("Owner");
        await EnsureRole("Admin");
        await EnsureRole("Moderator");

        var ownerEmail = _configuration["SeedData:OwnerEmail"];
        await GrantConfiguredOwner(ownerEmail);

        var email = _configuration["SeedData:DemoEmail"] ?? "demo@animehub.local";
        var password = _configuration["SeedData:DemoPassword"];
        if (string.IsNullOrWhiteSpace(password))
        {
            _logger.LogWarning("SeedData is enabled but SeedData:DemoPassword is not configured. Demo user seeding was skipped.");
            return;
        }

        var user = await _users.FindByEmailAsync(email);
        if (user == null)
        {
            user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = email,
                Email = email,
                DisplayName = "Demo Senpai",
                EmailConfirmed = true
            };

            var result = await _users.CreateAsync(user, password);
            if (!result.Succeeded)
            {
                _logger.LogWarning(
                    "Seed user creation failed: {Errors}",
                    string.Join("; ", result.Errors.Select(e => e.Description)));
                return;
            }
        }
        else if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await _users.UpdateAsync(user);
        }

        await GrantRole(user, "Moderator");
        await GrantConfiguredOwner(ownerEmail);

        await SeedTrackedShows(user.Id, cancellationToken);
        await SeedDiscussion(user.Id, cancellationToken);
    }

    private async Task EnsureRole(string name)
    {
        if (!await _roles.RoleExistsAsync(name))
            await _roles.CreateAsync(new IdentityRole<Guid>(name));
    }

    private async Task GrantRole(ApplicationUser user, string role)
    {
        if (!await _users.IsInRoleAsync(user, role))
            await _users.AddToRoleAsync(user, role);
    }

    private async Task GrantConfiguredOwner(string? ownerEmail)
    {
        if (string.IsNullOrWhiteSpace(ownerEmail)) return;

        var owner = await _users.FindByEmailAsync(ownerEmail);
        if (owner == null)
        {
            _logger.LogWarning("SeedData:OwnerEmail is configured, but no matching user exists: {Email}", ownerEmail);
            return;
        }

        await GrantOwnerRoles(owner);
    }

    private async Task GrantOwnerRoles(ApplicationUser user)
    {
        await GrantRole(user, "Owner");
        await GrantRole(user, "Admin");
        await GrantRole(user, "Moderator");

        if (user.TrustLevel < 4)
        {
            user.TrustLevel = 4;
            await _users.UpdateAsync(user);
        }
    }

    private async Task SeedTrackedShows(Guid userId, CancellationToken cancellationToken)
    {
        var existingIds = await _db.TrackedShows
            .Where(x => x.UserId == userId)
            .Select(x => x.AniListId)
            .ToListAsync(cancellationToken);

        var existing = existingIds.ToHashSet();
        if (!existing.Contains(154587))
        {
            _db.TrackedShows.Add(new TrackedShow
            {
                UserId = userId,
                AniListId = 154587,
                Title = "Frieren: Beyond Journey's End",
                CoverImageUrl = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg",
                Format = "TV",
                Status = "FINISHED",
                Episodes = 28,
                Season = "FALL",
                SeasonYear = 2023,
                AverageScore = 89,
                Popularity = 541000,
                GenreCsv = "Adventure,Drama,Fantasy",
                TrackingStatus = "Watching",
                EpisodeProgress = 12,
                IsFavorite = true,
                PersonalRating = 10
            });
        }

        if (!existing.Contains(21))
        {
            _db.TrackedShows.Add(new TrackedShow
            {
                UserId = userId,
                AniListId = 21,
                Title = "ONE PIECE",
                CoverImageUrl = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg",
                Format = "TV",
                Status = "RELEASING",
                Episodes = null,
                Season = "FALL",
                SeasonYear = 1999,
                AverageScore = 88,
                Popularity = 720000,
                GenreCsv = "Action,Adventure,Comedy",
                TrackingStatus = "Watching",
                EpisodeProgress = 100,
                IsFavorite = true
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedDiscussion(Guid userId, CancellationToken cancellationToken)
    {
        var exists = await _db.DiscussionThreads
            .AnyAsync(x => x.UserId == userId && x.AniListId == 154587, cancellationToken);
        if (exists) return;

        var now = DateTime.UtcNow;
        _db.DiscussionThreads.Add(new DiscussionThread
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            AniListId = 154587,
            Title = "What made Frieren click for you?",
            Body = "Seed thread for local development. Try **markdown**, [spoiler]spoiler tags[/spoiler], reactions, and replies.",
            Category = "General",
            TagCsv = "dev,frieren",
            CreatedUtc = now,
            LastActivityUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);
    }
}
