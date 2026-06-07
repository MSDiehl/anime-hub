using AnimeHub.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnimeHub.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260607130000_AddCustomTrackingLists")]
    public partial class AddCustomTrackingLists : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomListName",
                table: "TrackedShows",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserTagCsv",
                table: "TrackedShows",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TrackedShows_UserId_CustomListName",
                table: "TrackedShows",
                columns: new[] { "UserId", "CustomListName" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TrackedShows_UserId_CustomListName",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "CustomListName",
                table: "TrackedShows");

            migrationBuilder.DropColumn(
                name: "UserTagCsv",
                table: "TrackedShows");
        }
    }
}
