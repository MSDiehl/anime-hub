using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnimeHub.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDiscussions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DiscussionThreads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AniListId = table.Column<int>(type: "integer", nullable: false),
                    EpisodeNumber = table.Column<int>(type: "integer", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscussionThreads", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DiscussionComments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscussionComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscussionComments_DiscussionThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "DiscussionThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionComments_ThreadId_CreatedUtc",
                table: "DiscussionComments",
                columns: new[] { "ThreadId", "CreatedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionComments_UserId",
                table: "DiscussionComments",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreads_AniListId_EpisodeNumber_CreatedUtc",
                table: "DiscussionThreads",
                columns: new[] { "AniListId", "EpisodeNumber", "CreatedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreads_UserId",
                table: "DiscussionThreads",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiscussionComments");

            migrationBuilder.DropTable(
                name: "DiscussionThreads");
        }
    }
}
