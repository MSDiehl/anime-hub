# AnimeHub

AnimeHub is a full-stack anime tracker built with ASP.NET Core, Entity Framework Core, PostgreSQL, and a React/Vite frontend. It uses AniList GraphQL for anime search, details, and airing schedules.

## Features

- Cookie-based registration, login, logout, current-user lookup, email confirmation, password reset, password change, and account deletion.
- CSRF-protected cookie auth with configurable CORS, login lockout, and stronger production password rules.
- AniList search and anime detail pages.
- Per-user track and untrack endpoints.
- Community "Most tracked" cards backed by tracked-show data.
- Release schedule with week/month views, tracked/unwatched filters, format/search filters, and Redis-backed caching.
- Anime and episode-scoped discussion threads with global forums, reactions, reports, soft deletes, and moderator pin/lock tools.
- AniList service layer with paginated search, detail caching, and rate-limit handling.

## Prerequisites

- .NET 10 SDK
- Docker Desktop
- Node.js 24 or newer
- pnpm 10 or newer

## Configuration

Copy the example env file before local setup:

```bash
cp .env.example .env
```

Important values:

- `POSTGRES_PORT`: local PostgreSQL port exposed by Docker, default `5432`.
- `ConnectionStrings__Default`: backend PostgreSQL connection string.
- `ConnectionStrings__Redis`: backend Redis connection string for schedule caching, default `localhost:6379`.
- `ExternalApis__AniList__BaseUrl`: AniList GraphQL endpoint, default `https://graphql.anilist.co`.
- `ASPNETCORE_URLS`: API URLs, default `https://localhost:7162;http://localhost:5162`.
- `VITE_DEV_PORT`: frontend dev server port, default `5173`.
- `VITE_API_TARGET`: Vite proxy target for `/api`, default `https://127.0.0.1:7162`.
- `Identity__RequireConfirmedEmail`: requires email confirmation before sign-in, default `true`.
- `SeedData__DemoPassword`: required when `SeedData__Enabled=true`.
- `AccountEmail__PublicBaseUrl`: public frontend origin used in confirmation and reset links.
- `AccountEmail__FromEmail`, `AccountEmail__Smtp__Host`, `AccountEmail__Smtp__UserName`, `AccountEmail__Smtp__Password`: optional SMTP delivery settings.
- `Cors__AllowedOrigins__0`: trusted frontend origin for credentialed browser requests.

Production signups require working `AccountEmail__*` SMTP settings when `Identity__RequireConfirmedEmail=true`.

ASP.NET also reads `backend/AnimeHub.Api/appsettings.Development.json` during local development, but secrets are intentionally kept out of that file. Use environment variables or .NET user secrets for local connection strings, seed passwords, and SMTP credentials:

```bash
cd backend/AnimeHub.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=animehub;Username=animehub;Password=<your-local-db-password>"
dotnet user-secrets set "ConnectionStrings:Redis" "localhost:6379"
dotnet user-secrets set "SeedData:DemoPassword" "change-this-local-demo-password"
```

The API also loads a gitignored `.env` file from the repository root before startup. EF Core design-time commands use the same startup path, so `dotnet ef database update` can read `ConnectionStrings__Default` from `.env` as long as you copy `.env.example` to `.env` and set the database password there. If your Docker database was created before this change, keep the password in `.env` aligned with the existing `POSTGRES_PASSWORD`.

## Start Dependencies

From the repository root:

```bash
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` and Redis on `localhost:6379` by default.

## Backend Setup

Restore packages and apply migrations:

```bash
cd backend
dotnet restore AnimeHub.slnx
dotnet ef database update --project AnimeHub.Infrastructure --startup-project AnimeHub.Api
```

From the repository root, the same migration command is:

```bash
dotnet ef database update --project backend/AnimeHub.Infrastructure --startup-project backend/AnimeHub.Api --context AppDbContext
```

If `dotnet ef` is not installed:

```bash
dotnet tool install --global dotnet-ef
```

Run the API:

```bash
dotnet run --project AnimeHub.Api
```

The API defaults to:

- HTTPS: `https://localhost:7162`
- HTTP: `http://localhost:5162`
- Swagger in development: `https://localhost:7162/swagger`
- Health: `https://localhost:7162/health`

Optional dev seed data is available through configuration. It creates a demo user, moderator role, sample tracked shows, and a starter forum thread:

```bash
dotnet run --project AnimeHub.Api --SeedData:Enabled=true
```

Default demo email is `demo@animehub.local`; configure `SeedData__DemoPassword` or `SeedData:DemoPassword` yourself before enabling seed data.

## Frontend Setup

Install and run the Vite app:

```bash
cd frontend/animehub-web
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

## Tests And Checks

Backend:

```bash
cd backend
dotnet test AnimeHub.slnx
```

Frontend:

```bash
cd frontend/animehub-web
pnpm lint
pnpm test
pnpm build
```

Generate frontend OpenAPI TypeScript types after the API is running:

```bash
cd frontend/animehub-web
pnpm openapi:types
```

## API Notes

- `POST /api/tracked` tracks an anime for the signed-in user.
- `DELETE /api/tracked/{aniListId}` untracks an anime for the signed-in user.
- `GET /api/tracked` returns the signed-in user's tracked list.
- `GET /api/tracked/most?limit=4` returns the most tracked anime across users.
- `GET /api/anime/search?q=frieren&page=1&perPage=12` returns a paged result.
- `GET /api/discussions/forums?page=1&perPage=20&sort=active` returns paged forum threads.
- `GET /api/auth/csrf` returns the request token required in the `X-CSRF-TOKEN` header for unsafe `/api` requests.
- `POST /api/auth/confirm-email`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/change-password`, and `DELETE /api/auth/me` handle account security workflows.
- `PATCH /api/auth/me` updates display name, avatar URL, and `isProfilePublic`.

Validation and upstream failures return a JSON error object:

```json
{
    "code": "validation_error",
    "message": "Title is required.",
    "errors": null
}
```

## CI

GitHub Actions runs backend restore/build/test and frontend install/lint/test/build on pushes to `main` and pull requests.

## Production Docker

Build and run the production stack:

```bash
docker compose -f docker-compose.prod.yml up --build
```

The frontend is exposed on `http://localhost:8080` by default and proxies `/api` and `/swagger` to the API container.

Apply migrations against the production compose database before first use:

```bash
dotnet ef database update --project backend/AnimeHub.Infrastructure --startup-project backend/AnimeHub.Api --context AppDbContext
```
