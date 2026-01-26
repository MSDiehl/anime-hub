import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

type HomeProps = {
  onLogout: () => void | Promise<void>;
};

type AnimeSearchItem = {
  aniListId: number;
  titleRomaji?: string;
  titleEnglish?: string;
  titleNative?: string;
  format?: string;
  status?: string;
  episodes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  coverImageUrl?: string | null;
};

type TrendingCard = {
  title: string;
  subtitle: string;
  cover: string;
};

type TrackedShow = {
  id: string;
  aniListId: number;
  title: string;
  coverImageUrl?: string | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
};

const dummyMostTracked: TrendingCard[] = [
  {
    title: "Frieren: Beyond Journey’s End",
    subtitle: "Most tracked this week",
    cover:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-6m3bQK8cM6oG.jpg",
  },
  {
    title: "Jujutsu Kaisen",
    subtitle: "Community favorite",
    cover:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101517-8Zp8pWQbHjvT.jpg",
  },
  {
    title: "One Piece",
    subtitle: "Always trending",
    cover:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkxY8J.jpg",
  },
  {
    title: "Attack on Titan",
    subtitle: "Top rated",
    cover:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-1K7uTzZQ7GJY.jpg",
  },
];

export default function Home({ onLogout }: HomeProps) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AnimeSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const navigate = useNavigate();

  // tracked
  const [tracked, setTracked] = useState<TrackedShow[]>([]);
  const [trackingIds, setTrackingIds] = useState<Set<number>>(new Set());

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);
  const trackedIds = useMemo(
    () => new Set(tracked.map((t) => t.aniListId)),
    [tracked],
  );

  useEffect(() => {
    loadTracked();
  }, []);

  async function loadTracked() {
    try {
      const res = await fetch("/api/tracked", { credentials: "include" });
      if (!res.ok) return;
      setTracked(await res.json());
    } catch {
      // ignore for now
    }
  }

  async function runSearch() {
    const query = q.trim();
    if (query.length < 2) return;

    setError(null);
    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(
        `/api/anime/search?q=${encodeURIComponent(query)}&perPage=12`,
      );
      if (!res.ok) throw new Error(await res.text());
      setItems(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function resetToHero() {
    setHasSearched(false);
    setItems([]);
    setError(null);
  }

  function bestTitle(x: AnimeSearchItem) {
    return x.titleEnglish || x.titleRomaji || x.titleNative || "Untitled";
  }

  async function trackShow(x: AnimeSearchItem) {
    const id = x.aniListId;
    if (trackedIds.has(id)) return;

    // mark "tracking..." for this specific card
    setTrackingIds((prev) => new Set(prev).add(id));

    try {
      const res = await fetch("/api/tracked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          aniListId: x.aniListId,
          title: bestTitle(x),
          coverImageUrl: x.coverImageUrl,
          format: x.format,
          status: x.status,
          episodes: x.episodes,
          season: x.season,
          seasonYear: x.seasonYear,
          averageScore: x.averageScore,
          popularity: x.popularity,
        }),
      });

      // 409 means already tracked (safe to treat as success)
      if (!res.ok && res.status !== 409) {
        throw new Error(await res.text());
      }

      await loadTracked();
    } catch (e: any) {
      setError(e?.message ?? "Failed to track show");
    } finally {
      setTrackingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="homePage">
      {/* Manga background layers (visual only) */}
      <div className="homeBg" aria-hidden="true">
        <div className="homeSpeedLines" />
        <div className="homeHalftone" />
        <div className="homeInkWash" />
      </div>

      <header className="homeTopBar">
        <div className="homeBrand" aria-label="AnimeHub">
          AnimeHub
        </div>

        <div className="homeTopBarRight">
          <button
            className="homePillBtn"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </button>
          <button className="homePillBtn" disabled title="Coming soon">
            Forums
          </button>
          <button className="dashPillBtn" onClick={() => navigate("/schedule")}>
            Schedule
          </button>

          <button onClick={onLogout} className="homeLogoutBtn">
            Logout
          </button>
        </div>
      </header>

      <section className={`homeHero ${hasSearched ? "compact" : "centered"}`}>
        <div className="homeHeroInner">
          <div className="homeHeroText">
            <h1 className="homeH1">Find your next anime</h1>
            <p className="homeSub">
              Search, track, and analyze anime — clean, fast, and
              community-driven.
            </p>
          </div>

          <div className="homeSearchRow">
            <div className="homeSearchBox">
              <span className="homeSearchIcon" aria-hidden="true">
                🔎
              </span>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search anime (Naruto, Frieren, One Piece...)"
                className="homeInput"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSearch && !loading) runSearch();
                  if (e.key === "Escape") resetToHero();
                }}
              />

              <button
                onClick={runSearch}
                disabled={!canSearch || loading}
                className={`homeSearchBtn ${
                  loading || !canSearch ? "isDisabled" : ""
                }`}
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>

            {hasSearched && (
              <button
                onClick={resetToHero}
                className="homeClearBtn"
                title="Back to home"
              >
                Clear
              </button>
            )}
          </div>

          {error && <div className="homeError">{error}</div>}

          {!hasSearched && (
            <div className="homeMostTracked">
              <div className="homeSectionHead">
                <div className="homeSectionTitleWrap">
                  <h2 className="homeH2">Most tracked</h2>
                  <span className="homeSectionBadge" aria-hidden="true">
                    HOT!
                  </span>
                </div>
                <span className="homeMuted">Dummy cards currently.</span>
              </div>

              <div className="homeCardGrid">
                {dummyMostTracked.map((c) => (
                  <div key={c.title} className="homeCard">
                    <div
                      className="homeCardCover"
                      style={{ backgroundImage: `url(${c.cover})` }}
                    />
                    <div className="homeCardBody">
                      <div className="homeCardTitle">{c.title}</div>
                      <div className="homeCardSub">{c.subtitle}</div>
                      <button
                        className="homeCardBtn"
                        onClick={() => {
                          setQ(c.title);
                          // runSearch(); // optional
                        }}
                      >
                        Search
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="homeMain">
        {hasSearched && (
          <div className="homeResultsWrap">
            <div className="homeSectionHead">
              <div className="homeSectionTitleWrap">
                <h2 className="homeH2">Search results</h2>
                <span className="homeSectionBadge alt" aria-hidden="true">
                  POW!
                </span>
              </div>
              <span className="homeMuted">
                Showing top matches from AniList
              </span>
            </div>

            <div className="homeResultsGrid">
              {items.map((x) => {
                const isTracked = trackedIds.has(x.aniListId);
                const isTracking = trackingIds.has(x.aniListId);

                return (
                  <div
                    key={x.aniListId}
                    className="homeResultCard"
                    onClick={() => navigate(`/anime/${x.aniListId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.key === "Enter" && navigate(`/anime/${x.aniListId}`)
                    }
                  >
                    <div
                      className="homeResultCover"
                      style={{
                        backgroundImage: x.coverImageUrl
                          ? `url(${x.coverImageUrl})`
                          : undefined,
                      }}
                    />

                    <div className="homeResultBody">
                      <div className="homeResultTitle">{bestTitle(x)}</div>

                      <div className="homeResultMeta">
                        {x.format ?? "—"} • {x.status ?? "—"}
                        {typeof x.episodes === "number"
                          ? ` • ${x.episodes} eps`
                          : ""}
                      </div>

                      <div className="homeResultStats">
                        <span>Score: {x.averageScore ?? "—"}</span>
                        <span>Popularity: {x.popularity ?? "—"}</span>
                      </div>

                      <div className="homeResultActions">
                        <button
                          className={[
                            "homeTrackBtn",
                            isTracked ? "isTracked" : "",
                            isTracking ? "isBusy" : "",
                          ].join(" ")}
                          onClick={(e) => {
                            e.stopPropagation();
                            trackShow(x);
                          }}
                          disabled={isTracked || isTracking}
                          title={
                            isTracked ? "Already tracked" : "Track this show"
                          }
                        >
                          {isTracked
                            ? "Tracked ✓"
                            : isTracking
                              ? "Tracking…"
                              : "Track"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!loading && items.length === 0 && !error && (
              <div className="homeEmpty">No results. Try another search.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
