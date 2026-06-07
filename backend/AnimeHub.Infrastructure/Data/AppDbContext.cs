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
    public DbSet<TrackedShowHistory> TrackedShowHistory => Set<TrackedShowHistory>();

    // ✅ Discussions
    public DbSet<DiscussionThread> DiscussionThreads => Set<DiscussionThread>();
    public DbSet<DiscussionComment> DiscussionComments => Set<DiscussionComment>();
    public DbSet<DiscussionReaction> DiscussionReactions => Set<DiscussionReaction>();
    public DbSet<DiscussionReport> DiscussionReports => Set<DiscussionReport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TrackedShow>(entity =>
        {
            entity.HasIndex(x => new { x.UserId, x.AniListId }).IsUnique();
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => new { x.UserId, x.TrackingStatus });
            entity.HasIndex(x => new { x.UserId, x.IsFavorite });
            entity.HasIndex(x => new { x.UserId, x.CustomListName });
            entity.Property(x => x.Title).HasMaxLength(300);
            entity.Property(x => x.GenreCsv).HasMaxLength(500);
            entity.Property(x => x.TrackingStatus).HasMaxLength(32);
            entity.Property(x => x.Notes).HasMaxLength(4000);
            entity.Property(x => x.Review).HasMaxLength(8000);
            entity.Property(x => x.CustomListName).HasMaxLength(80);
            entity.Property(x => x.UserTagCsv).HasMaxLength(500);
        });

        modelBuilder.Entity<TrackedShowHistory>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.UserId, x.CreatedUtc });
            entity.HasIndex(x => new { x.UserId, x.AniListId, x.CreatedUtc });
            entity.Property(x => x.Title).HasMaxLength(300);
            entity.Property(x => x.EventType).HasMaxLength(40);
            entity.Property(x => x.FromValue).HasMaxLength(80);
            entity.Property(x => x.ToValue).HasMaxLength(80);
        });

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(x => x.DisplayName).HasMaxLength(80);
            entity.Property(x => x.AvatarUrl).HasMaxLength(1000);
            entity.Property(x => x.IsProfilePublic).HasDefaultValue(true);
        });

        // -------------------------
        // Discussions configuration
        // -------------------------
        modelBuilder.Entity<DiscussionThread>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.AniListId, x.EpisodeNumber, x.CreatedUtc });
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => new { x.Category, x.LastActivityUtc });
            entity.HasIndex(x => x.IsPinned);
            entity.HasIndex(x => x.IsDeleted);

            entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Body).HasMaxLength(5000);
            entity.Property(x => x.Category).HasMaxLength(80);
            entity.Property(x => x.TagCsv).HasMaxLength(500);

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
            entity.HasIndex(x => x.IsDeleted);

            entity.Property(x => x.Body).HasMaxLength(3000);
        });

        modelBuilder.Entity<DiscussionReaction>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.ThreadId, x.UserId, x.Type })
                .IsUnique()
                .HasFilter("\"ThreadId\" IS NOT NULL");
            entity.HasIndex(x => new { x.CommentId, x.UserId, x.Type })
                .IsUnique()
                .HasFilter("\"CommentId\" IS NOT NULL");
            entity.HasIndex(x => x.UserId);

            entity.Property(x => x.Type).HasMaxLength(40);

            entity.HasOne(x => x.Thread)
                .WithMany()
                .HasForeignKey(x => x.ThreadId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Comment)
                .WithMany()
                .HasForeignKey(x => x.CommentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DiscussionReport>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.ThreadId, x.ReporterUserId })
                .IsUnique()
                .HasFilter("\"ThreadId\" IS NOT NULL");
            entity.HasIndex(x => new { x.CommentId, x.ReporterUserId })
                .IsUnique()
                .HasFilter("\"CommentId\" IS NOT NULL");
            entity.HasIndex(x => x.ReporterUserId);

            entity.Property(x => x.Reason).HasMaxLength(1000);

            entity.HasOne(x => x.Thread)
                .WithMany()
                .HasForeignKey(x => x.ThreadId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Comment)
                .WithMany()
                .HasForeignKey(x => x.CommentId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
