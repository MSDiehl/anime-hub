using AnimeHub.Infrastructure.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Infrastructure.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<AnimeHub.Domain.Entities.TrackedShow> TrackedShows => Set<AnimeHub.Domain.Entities.TrackedShow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AnimeHub.Domain.Entities.TrackedShow>(entity =>
        {
            entity.HasIndex(x => new { x.UserId, x.AniListId }).IsUnique();
            entity.HasIndex(x => x.UserId);
            entity.Property(x => x.Title).HasMaxLength(300);
        });

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(x => x.DisplayName).HasMaxLength(80);
        });
    }
}
