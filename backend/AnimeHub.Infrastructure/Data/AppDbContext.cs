using AnimeHub.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AnimeHub.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<TrackedShow> TrackedShows => Set<TrackedShow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TrackedShow>(entity =>
        {
            entity.HasIndex(x => x.AniListId).IsUnique(); // prevent duplicates
            entity.Property(x => x.Title).HasMaxLength(300);
        });
    }
}
