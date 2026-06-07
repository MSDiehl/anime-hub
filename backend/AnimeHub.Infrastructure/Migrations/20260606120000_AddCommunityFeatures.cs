using System;
using AnimeHub.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnimeHub.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260606120000_AddCommunityFeatures")]
    public partial class AddCommunityFeatures : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AvatarUrl",
                table: "AspNetUsers",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "DiscussionThreads",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "General");

            migrationBuilder.AddColumn<bool>(
                name: "ContainsSpoilers",
                table: "DiscussionThreads",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedUtc",
                table: "DiscussionThreads",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "DiscussionThreads",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsLocked",
                table: "DiscussionThreads",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                table: "DiscussionThreads",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastActivityUtc",
                table: "DiscussionThreads",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AddColumn<string>(
                name: "TagCsv",
                table: "DiscussionThreads",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedUtc",
                table: "DiscussionComments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "DiscussionComments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedUtc",
                table: "DiscussionComments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql(@"
UPDATE ""DiscussionThreads""
SET ""LastActivityUtc"" = COALESCE(
    (
        SELECT MAX(c.""CreatedUtc"")
        FROM ""DiscussionComments"" c
        WHERE c.""ThreadId"" = ""DiscussionThreads"".""Id""
    ),
    ""CreatedUtc""
);
");

            migrationBuilder.CreateTable(
                name: "DiscussionReactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uuid", nullable: true),
                    CommentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscussionReactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscussionReactions_DiscussionComments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "DiscussionComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DiscussionReactions_DiscussionThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "DiscussionThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DiscussionReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReporterUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uuid", nullable: true),
                    CommentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscussionReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscussionReports_DiscussionComments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "DiscussionComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DiscussionReports_DiscussionThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "DiscussionThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreads_Category_LastActivityUtc",
                table: "DiscussionThreads",
                columns: new[] { "Category", "LastActivityUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreads_IsDeleted",
                table: "DiscussionThreads",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreads_IsPinned",
                table: "DiscussionThreads",
                column: "IsPinned");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionComments_IsDeleted",
                table: "DiscussionComments",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReactions_CommentId_UserId_Type",
                table: "DiscussionReactions",
                columns: new[] { "CommentId", "UserId", "Type" },
                unique: true,
                filter: "\"CommentId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReactions_ThreadId_UserId_Type",
                table: "DiscussionReactions",
                columns: new[] { "ThreadId", "UserId", "Type" },
                unique: true,
                filter: "\"ThreadId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReactions_UserId",
                table: "DiscussionReactions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReports_CommentId_ReporterUserId",
                table: "DiscussionReports",
                columns: new[] { "CommentId", "ReporterUserId" },
                unique: true,
                filter: "\"CommentId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReports_ReporterUserId",
                table: "DiscussionReports",
                column: "ReporterUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReports_ThreadId_ReporterUserId",
                table: "DiscussionReports",
                columns: new[] { "ThreadId", "ReporterUserId" },
                unique: true,
                filter: "\"ThreadId\" IS NOT NULL");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "DiscussionReports");
            migrationBuilder.DropTable(name: "DiscussionReactions");

            migrationBuilder.DropIndex(
                name: "IX_DiscussionThreads_Category_LastActivityUtc",
                table: "DiscussionThreads");
            migrationBuilder.DropIndex(
                name: "IX_DiscussionThreads_IsDeleted",
                table: "DiscussionThreads");
            migrationBuilder.DropIndex(
                name: "IX_DiscussionThreads_IsPinned",
                table: "DiscussionThreads");
            migrationBuilder.DropIndex(
                name: "IX_DiscussionComments_IsDeleted",
                table: "DiscussionComments");

            migrationBuilder.DropColumn(name: "AvatarUrl", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "Category", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "ContainsSpoilers", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "DeletedUtc", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "IsDeleted", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "IsLocked", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "IsPinned", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "LastActivityUtc", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "TagCsv", table: "DiscussionThreads");
            migrationBuilder.DropColumn(name: "DeletedUtc", table: "DiscussionComments");
            migrationBuilder.DropColumn(name: "IsDeleted", table: "DiscussionComments");
            migrationBuilder.DropColumn(name: "UpdatedUtc", table: "DiscussionComments");
        }
    }
}
