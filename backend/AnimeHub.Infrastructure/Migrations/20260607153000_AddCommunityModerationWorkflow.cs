using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnimeHub.Infrastructure.Migrations
{
    public partial class AddCommunityModerationWorkflow : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CommunitySuspendedUntilUtc",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TrustLevel",
                table: "AspNetUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Resolution",
                table: "DiscussionReports",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ResolvedByUserId",
                table: "DiscussionReports",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ResolvedUtc",
                table: "DiscussionReports",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "DiscussionReports",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Open");

            migrationBuilder.CreateTable(
                name: "DiscussionThreadReads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastReadUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscussionThreadReads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscussionThreadReads_DiscussionThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "DiscussionThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DiscussionThreadSubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationsEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscussionThreadSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscussionThreadSubscriptions_DiscussionThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "DiscussionThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReports_Status_CreatedUtc",
                table: "DiscussionReports",
                columns: new[] { "Status", "CreatedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreadReads_ThreadId",
                table: "DiscussionThreadReads",
                column: "ThreadId");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreadReads_UserId_ThreadId",
                table: "DiscussionThreadReads",
                columns: new[] { "UserId", "ThreadId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreadSubscriptions_ThreadId",
                table: "DiscussionThreadSubscriptions",
                column: "ThreadId");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionThreadSubscriptions_UserId_ThreadId",
                table: "DiscussionThreadSubscriptions",
                columns: new[] { "UserId", "ThreadId" },
                unique: true);

            migrationBuilder.Sql(@"
CREATE INDEX IF NOT EXISTS ""IX_DiscussionThreads_SearchVector""
ON ""DiscussionThreads""
USING GIN (
    to_tsvector(
        'simple',
        coalesce(""Title"", '') || ' ' ||
        coalesce(""Body"", '') || ' ' ||
        coalesce(""Category"", '') || ' ' ||
        coalesce(""TagCsv"", '')
    )
);
");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP INDEX IF EXISTS ""IX_DiscussionThreads_SearchVector"";");

            migrationBuilder.DropTable(name: "DiscussionThreadReads");
            migrationBuilder.DropTable(name: "DiscussionThreadSubscriptions");

            migrationBuilder.DropIndex(
                name: "IX_DiscussionReports_Status_CreatedUtc",
                table: "DiscussionReports");

            migrationBuilder.DropColumn(name: "CommunitySuspendedUntilUtc", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "TrustLevel", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "Resolution", table: "DiscussionReports");
            migrationBuilder.DropColumn(name: "ResolvedByUserId", table: "DiscussionReports");
            migrationBuilder.DropColumn(name: "ResolvedUtc", table: "DiscussionReports");
            migrationBuilder.DropColumn(name: "Status", table: "DiscussionReports");
        }
    }
}
