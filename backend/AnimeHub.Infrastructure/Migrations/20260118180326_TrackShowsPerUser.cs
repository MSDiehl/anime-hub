using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnimeHub.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TrackShowsPerUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TrackedShows_AniListId",
                table: "TrackedShows");

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "TrackedShows",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShows_UserId",
                table: "TrackedShows",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShows_UserId_AniListId",
                table: "TrackedShows",
                columns: new[] { "UserId", "AniListId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TrackedShows_UserId",
                table: "TrackedShows");

            migrationBuilder.DropIndex(
                name: "IX_TrackedShows_UserId_AniListId",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "TrackedShows");

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShows_AniListId",
                table: "TrackedShows",
                column: "AniListId",
                unique: true);
        }
    }
}
