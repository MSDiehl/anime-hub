# AnimeHub

AnimeHub is a full-stack anime tracker built with ASP.NET Core, Entity Framework Core, PostgreSQL, and a React/Vite frontend. It uses AniList GraphQL for anime search, details, and airing schedules.

## Features

- Cookie-based registration, login, logout, and current-user lookup.
- AniList search and anime detail pages.
- Per-user track and untrack endpoints.
- Community "Most tracked" cards backed by tracked-show data.
- Weekly release schedule with a tracked-only filter.
- Anime and episode-scoped discussion threads.

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
- `ExternalApis__AniList__BaseUrl`: AniList GraphQL endpoint, default `https://graphql.anilist.co`.
- `ASPNETCORE_URLS`: API URLs, default `https://localhost:7162;http://localhost:5162`.
- `VITE_DEV_PORT`: frontend dev server port, default `5173`.
- `VITE_API_TARGET`: Vite proxy target for `/api`, default `https://127.0.0.1:7162`.

ASP.NET also reads `backend/AnimeHub.Api/appsettings.Development.json` during local development.

## Start Dependencies

From the repository root:

```bash
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` by default.

## Backend Setup

Restore packages and apply migrations:

```bash
cd backend
dotnet restore AnimeHub.slnx
dotnet ef database update --project AnimeHub.Infrastructure --startup-project AnimeHub.Api
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
- Swagger: `https://localhost:7162/swagger`

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

## API Notes

- `POST /api/tracked` tracks an anime for the signed-in user.
- `DELETE /api/tracked/{aniListId}` untracks an anime for the signed-in user.
- `GET /api/tracked` returns the signed-in user's tracked list.
- `GET /api/tracked/most?limit=4` returns the most tracked anime across users.

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
