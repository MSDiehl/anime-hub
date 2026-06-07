using System;
using AnimeHub.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnimeHub.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260607143000_AddTrackedShowHistory")]
    public partial class AddTrackedShowHistory : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TrackedShowHistory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AniListId = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    EventType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    FromValue = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    ToValue = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    EpisodeNumber = table.Column<int>(type: "integer", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TrackedShowHistory", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShowHistory_UserId_CreatedUtc",
                table: "TrackedShowHistory",
                columns: new[] { "UserId", "CreatedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShowHistory_UserId_AniListId_CreatedUtc",
                table: "TrackedShowHistory",
                columns: new[] { "UserId", "AniListId", "CreatedUtc" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TrackedShowHistory");
        }
    }
}
