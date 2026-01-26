# AnimeHub (V1)

AnimeHub is a centralized hub for discovering anime, tracking what you’re watching, viewing anime details, and checking an upcoming release schedule — all with a clean, modern UI.

V1 focuses on:

- Searching anime (powered by AniList)
- Tracking anime per-user (login required)
- A detailed anime page with stats + placeholder trend graphs
- A weekly release schedule with a “Tracked only” filter
- Discussions attached to each anime (general + episode scope)

---

## Features (V1)

### Authentication (per-user)

- Create an account
- Sign in / sign out
- User-specific tracking data (your tracked list is not shared with other accounts)

### Search + Track

- Search anime by title (AniList)
- Track/untrack an anime
- Tracked status persists in the database

### Anime Details Page

- Banner art + metadata (format/status/episodes/season/etc.)
- Overview/description section
- Trend graphs (placeholder for V1 — real snapshots/metrics planned)
- Episode section (foundation for per-episode ratings in future)
- **Discussion tab**: start threads + read threads (scoped to the anime, with episode scoping available)

### Release Schedule

- Week view for upcoming episodes (AniList airing schedule)
- Navigation to move the date range
- Toggle: **Tracked only** (filters schedule to just shows you track)

### Forums (Global)

- The nav button routes to a “Coming soon” page in V1
- Planned for a future release as a global feed (Reddit-style) built on top of anime/episode discussions

---

## Tech Stack

### Frontend

- React + TypeScript (Vite)
- CSS (custom UI theme)

### Backend

- ASP.NET Core Web API (.NET)
- Entity Framework Core (database persistence)
- ASP.NET Identity (cookie auth)

### External Data

- AniList GraphQL API (search, anime details, schedules)
