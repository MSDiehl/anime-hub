import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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
    <div style={styles.page}>
      <div style={styles.bgGlow} />
      <header style={styles.topBar}>
        <div style={styles.brand}>AnimeHub</div>
        <div style={styles.topBarRight}>
          <span style={styles.pill}>Dashboard</span>
          <span style={styles.pill}>Forums</span>
          <span style={styles.pill}>Schedule</span>

          <button
            onClick={onLogout}
            style={{
              marginLeft: 8,
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.08)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </header>
      <section
        style={{
          ...styles.hero,
          ...(hasSearched ? styles.heroCompact : styles.heroCentered),
        }}
      >
        <div style={styles.heroInner}>
          <div style={{ textAlign: "center" }}>
            <h1 style={styles.h1}>Find your next anime</h1>
            <p style={styles.sub}>
              Search, track, and analyze anime — clean, fast, and
              community-driven.
            </p>
          </div>

          <div style={styles.searchRow}>
            <div style={styles.searchBox}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search anime (Naruto, Frieren, One Piece...)"
                style={styles.input}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSearch && !loading) runSearch();
                  if (e.key === "Escape") resetToHero();
                }}
              />
              <button
                onClick={runSearch}
                disabled={!canSearch || loading}
                style={{
                  ...styles.searchBtn,
                  ...(loading || !canSearch ? styles.searchBtnDisabled : null),
                }}
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>

            {hasSearched && (
              <button
                onClick={resetToHero}
                style={styles.ghostBtn}
                title="Back to home"
              >
                Clear
              </button>
            )}
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {!hasSearched && (
            <div style={styles.mostTracked}>
              <div style={styles.sectionHead}>
                <h2 style={styles.h2}>Most tracked</h2>
                <span style={styles.muted}>
                  Dummy cards for now — I'll wire to DB next.
                </span>
              </div>

              <div style={styles.cardGrid}>
                {dummyMostTracked.map((c) => (
                  <div key={c.title} style={styles.card}>
                    <div
                      style={{
                        ...styles.cardCover,
                        backgroundImage: `url(${c.cover})`,
                      }}
                    />
                    <div style={styles.cardBody}>
                      <div style={styles.cardTitle}>{c.title}</div>
                      <div style={styles.cardSub}>{c.subtitle}</div>
                      <button
                        style={styles.cardBtn}
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

      <main style={styles.main}>
        {hasSearched && (
          <div style={styles.resultsWrap}>
            <div style={styles.sectionHead}>
              <h2 style={styles.h2}>Search results</h2>
              <span style={styles.muted}>Showing top matches from AniList</span>
            </div>

            <div style={styles.resultsGrid}>
              {items.map((x) => {
                const isTracked = trackedIds.has(x.aniListId);
                const isTracking = trackingIds.has(x.aniListId);

                return (
                  <div
                    key={x.aniListId}
                    style={styles.resultCard}
                    onClick={() => navigate(`/anime/${x.aniListId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.key === "Enter" && navigate(`/anime/${x.aniListId}`)
                    }
                  >
                    <div
                      style={{
                        ...styles.resultCover,
                        backgroundImage: x.coverImageUrl
                          ? `url(${x.coverImageUrl})`
                          : undefined,
                      }}
                    />
                    <div style={styles.resultBody}>
                      <div style={styles.resultTitle}>{bestTitle(x)}</div>

                      <div style={styles.resultMeta}>
                        {x.format ?? "—"} • {x.status ?? "—"}
                        {typeof x.episodes === "number"
                          ? ` • ${x.episodes} eps`
                          : ""}
                      </div>

                      <div style={styles.resultStats}>
                        <span>Score: {x.averageScore ?? "—"}</span>
                        <span>Popularity: {x.popularity ?? "—"}</span>
                      </div>

                      {/* Track ONLY (no external links) */}
                      <div style={styles.resultActions}>
                        <button
                          style={{
                            ...styles.primaryBtn,
                            ...(isTracked ? styles.primaryBtnTracked : null),
                            ...(isTracking ? styles.primaryBtnDisabled : null),
                          }}
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
              <div style={styles.empty}>No results. Try another search.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 20% 0%, rgba(108,99,255,.25), transparent 60%), #0b0b10",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    position: "relative",
    overflowX: "hidden",
  },
  bgGlow: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(700px 300px at 70% 20%, rgba(140,80,255,.18), transparent 60%)",
    filter: "blur(0px)",
  },
  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    backdropFilter: "blur(10px)",
    background: "rgba(11,11,16,.55)",
    borderBottom: "1px solid rgba(255,255,255,.06)",
  },
  brand: { fontWeight: 800, letterSpacing: 0.2, fontSize: 18 },
  topBarRight: { display: "flex", gap: 10 },
  pill: {
    fontSize: 12,
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.08)",
    opacity: 0.85,
  },

  hero: {
    width: "100%",
    transition: "padding 450ms ease, transform 450ms ease",
  },
  heroCentered: { padding: "80px 16px 28px" },
  heroCompact: { padding: "28px 16px 12px" },
  heroInner: { maxWidth: 980, margin: "0 auto" },
  h1: { margin: 0, fontSize: 44, lineHeight: 1.05, letterSpacing: -0.6 },
  sub: { marginTop: 10, marginBottom: 0, opacity: 0.78, fontSize: 16 },

  searchRow: {
    marginTop: 22,
    display: "flex",
    gap: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  searchBox: {
    width: "100%",
    maxWidth: 760,
    display: "flex",
    gap: 10,
    padding: 10,
    borderRadius: 18,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    boxShadow: "0 12px 40px rgba(0,0,0,.25)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(0,0,0,.25)",
    color: "#fff",
    outline: "none",
    fontSize: 16,
  },
  searchBtn: {
    padding: "12px 18px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background:
      "linear-gradient(135deg, rgba(108,99,255,1), rgba(168,94,255,1))",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  searchBtnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  ghostBtn: {
    padding: "10px 14px",
    borderRadius: 14,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    color: "#fff",
    cursor: "pointer",
    opacity: 0.9,
  },
  error: { marginTop: 14, textAlign: "center", color: "#ff9aa2" },

  mostTracked: { marginTop: 28 },
  sectionHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  h2: { margin: 0, fontSize: 18, letterSpacing: -0.2 },
  muted: { fontSize: 12, opacity: 0.7 },

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 14,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    boxShadow: "0 18px 50px rgba(0,0,0,.25)",
  },
  cardCover: {
    height: 170,
    backgroundSize: "cover",
    backgroundPosition: "center",
  },
  cardBody: { padding: 12 },
  cardTitle: { fontWeight: 800, fontSize: 14, lineHeight: 1.2 },
  cardSub: { marginTop: 6, fontSize: 12, opacity: 0.7 },
  cardBtn: {
    marginTop: 12,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(108,99,255,.22)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },

  main: { padding: "12px 16px 64px" },
  resultsWrap: { maxWidth: 1100, margin: "0 auto", paddingTop: 12 },
  resultsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  resultCard: {
    borderRadius: 18,
    overflow: "hidden",
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    boxShadow: "0 18px 60px rgba(0,0,0,.30)",
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    minHeight: 170,
    cursor: "pointer",
    transition: "transform 120ms ease, border-color 120ms ease",
  },
  resultCover: {
    backgroundColor: "rgba(255,255,255,.06)",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },
  resultBody: { padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  resultTitle: { fontWeight: 900, letterSpacing: -0.2 },
  resultMeta: { fontSize: 12, opacity: 0.75 },
  resultStats: { display: "flex", gap: 12, fontSize: 12, opacity: 0.75 },

  resultActions: { marginTop: "auto", display: "flex" },
  primaryBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.12)",
    background:
      "linear-gradient(135deg, rgba(108,99,255,1), rgba(168,94,255,1))",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryBtnTracked: {
    background: "rgba(255,255,255,.10)",
  },
  primaryBtnDisabled: {
    opacity: 0.75,
    cursor: "not-allowed",
  },

  empty: { marginTop: 16, opacity: 0.7, textAlign: "center" },
};
