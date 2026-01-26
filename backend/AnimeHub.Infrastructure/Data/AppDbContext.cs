using AnimeHub.Domain.Entities;
using AnimeHub.Infrastructure.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Infrastructure.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<TrackedShow> TrackedShows => Set<TrackedShow>();

    // ✅ Discussions
    public DbSet<DiscussionThread> DiscussionThreads => Set<DiscussionThread>();
    public DbSet<DiscussionComment> DiscussionComments => Set<DiscussionComment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TrackedShow>(entity =>
        {
            entity.HasIndex(x => new { x.UserId, x.AniListId }).IsUnique();
            entity.HasIndex(x => x.UserId);
            entity.Property(x => x.Title).HasMaxLength(300);
        });

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(x => x.DisplayName).HasMaxLength(80);
        });

        // -------------------------
        // Discussions configuration
        // -------------------------
        modelBuilder.Entity<DiscussionThread>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.AniListId, x.EpisodeNumber, x.CreatedUtc });
            entity.HasIndex(x => x.UserId);

            entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Body).HasMaxLength(5000);

            entity.HasMany(x => x.Comments)
                .WithOne(c => c.Thread)
                .HasForeignKey(c => c.ThreadId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DiscussionComment>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.ThreadId, x.CreatedUtc });
            entity.HasIndex(x => x.UserId);

            entity.Property(x => x.Body).HasMaxLength(3000);
        });
    }
}
