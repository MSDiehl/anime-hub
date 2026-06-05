using System;
using AnimeHub.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnimeHub.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260605190000_AddTrackingMetadata")]
    public partial class AddTrackingMetadata : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "CompletedOn",
                table: "TrackedShows",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EpisodeProgress",
                table: "TrackedShows",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "GenreCsv",
                table: "TrackedShows",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsFavorite",
                table: "TrackedShows",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "TrackedShows",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PersonalRating",
                table: "TrackedShows",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Review",
                table: "TrackedShows",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RewatchCount",
                table: "TrackedShows",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "StartedOn",
                table: "TrackedShows",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrackingStatus",
                table: "TrackedShows",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "PlanToWatch");

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedUtc",
                table: "TrackedShows",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShows_UserId_IsFavorite",
                table: "TrackedShows",
                columns: new[] { "UserId", "IsFavorite" });

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShows_UserId_TrackingStatus",
                table: "TrackedShows",
                columns: new[] { "UserId", "TrackingStatus" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TrackedShows_UserId_IsFavorite",
                table: "TrackedShows");

            migrationBuilder.DropIndex(
                name: "IX_TrackedShows_UserId_TrackingStatus",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "CompletedOn",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "EpisodeProgress",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "GenreCsv",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "IsFavorite",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "PersonalRating",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "Review",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "RewatchCount",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "StartedOn",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "TrackingStatus",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "UpdatedUtc",
                table: "TrackedShows");
        }
    }
}
