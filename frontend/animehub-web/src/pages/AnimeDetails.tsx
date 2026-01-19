import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type RelatedSeason = {
  aniListId: number;
  title: string;
  relationType?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
  coverImageUrl?: string | null;
};

type AnimeDetailsDto = {
  aniListId: number;
  title: string;
  coverImageUrl?: string | null;
  bannerImageUrl?: string | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  description?: string | null;
  averageScore?: number | null;
  popularity?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  genres?: string[];
  relatedSeasons?: RelatedSeason[];
};

type Props = { onLogout: () => void | Promise<void> };

export default function AnimeDetails({ onLogout }: Props) {
  const nav = useNavigate();
  const { aniListId } = useParams();
  const routeId = Number(aniListId);

  // allows “switch season without page reload”
  const [activeId, setActiveId] = useState(routeId);

  const [data, setData] = useState<AnimeDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setActiveId(routeId), [routeId]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const baseScore = data.averageScore ?? 70;
    const basePop = data.popularity ?? 100000;

    return Array.from({ length: 10 }).map((_, i) => ({
      t: `W${i + 1}`,
      score: Math.max(0, Math.min(100, baseScore + (i - 5) * 0.6)),
      pop: Math.max(0, basePop + (i - 5) * 1500),
    }));
  }, [data]);

  // v1 episodes: generate from episode count
  const episodes = useMemo(() => {
    const n = data?.episodes ?? 0;
    if (!n || n <= 0) return [];
    return Array.from({ length: n }).map((_, i) => ({
      num: i + 1,
      // later: arc/season/filler/user rating/community avg
      arc: null as string | null,
      isFiller: false,
    }));
  }, [data?.episodes]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/anime/${activeId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = (await res.json()) as AnimeDetailsDto;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(activeId) && activeId > 0) load();

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  if (loading)
    return (
      <div style={styles.page}>
        <div style={styles.loadingCard}>Loading…</div>
      </div>
    );
  if (!data)
    return (
      <div style={styles.page}>
        <div style={styles.loadingCard}>Not found.</div>
      </div>
    );

  const seasons = (data.relatedSeasons ?? [])
    .slice()
    .sort((a, b) => (a.seasonYear ?? 9999) - (b.seasonYear ?? 9999));

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <div style={styles.brand} onClick={() => nav("/")}>
          AnimeHub
        </div>
        <div style={styles.topBarRight}>
          <button style={styles.pillBtn} onClick={() => nav("/")}>
            Back
          </button>
          <button style={styles.pillBtn} onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div style={styles.hero}>
        <div
          style={{
            ...styles.banner,
            backgroundImage: data.bannerImageUrl
              ? `url(${data.bannerImageUrl})`
              : undefined,
          }}
        />
        <div style={styles.heroOverlay} />
        <div style={styles.heroInner}>
          <div
            style={{
              ...styles.cover,
              backgroundImage: data.coverImageUrl
                ? `url(${data.coverImageUrl})`
                : undefined,
            }}
          />

          <div style={styles.heroText}>
            <h1 style={styles.h1}>{data.title}</h1>

            <div style={styles.metaRow}>
              <span style={styles.chip}>{data.format ?? "—"}</span>
              <span style={styles.chip}>{data.status ?? "—"}</span>
              {typeof data.episodes === "number" && (
                <span style={styles.chip}>{data.episodes} eps</span>
              )}
              {(data.season || data.seasonYear) && (
                <span style={styles.chip}>
                  {data.season ?? ""} {data.seasonYear ?? ""}
                </span>
              )}
            </div>

            <div style={styles.statRow}>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Score</div>
                <div style={styles.statValue}>{data.averageScore ?? "—"}</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Popularity</div>
                <div style={styles.statValue}>{data.popularity ?? "—"}</div>
              </div>
            </div>

            {data.genres?.length ? (
              <div style={styles.genreRow}>
                {data.genres.slice(0, 8).map((g) => (
                  <span key={g} style={styles.genre}>
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div style={styles.seasonPanel}>
            <div style={styles.seasonPanelTitle}>Seasons</div>
            {seasons.length === 0 ? (
              <div style={styles.seasonEmpty}>
                No related seasons found yet.
              </div>
            ) : (
              <div style={styles.seasonList}>
                {seasons.map((s) => {
                  const active = s.aniListId === data.aniListId;
                  return (
                    <button
                      key={s.aniListId}
                      onClick={() => setActiveId(s.aniListId)}
                      style={{
                        ...styles.seasonItem,
                        ...(active ? styles.seasonItemActive : null),
                      }}
                      title={s.title}
                    >
                      <div
                        style={{
                          ...styles.seasonThumb,
                          backgroundImage: s.coverImageUrl
                            ? `url(${s.coverImageUrl})`
                            : undefined,
                        }}
                      />
                      <div style={styles.seasonText}>
                        <div style={styles.seasonName}>{s.title}</div>
                        <div style={styles.seasonMeta}>
                          {s.season || s.seasonYear
                            ? `${s.season ?? ""} ${s.seasonYear ?? ""}`.trim()
                            : (s.relationType ?? "Season")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <main style={styles.main}>
        <div style={styles.grid}>
          <section style={styles.panel}>
            <h2 style={styles.h2}>Overview</h2>
            <div
              style={styles.desc}
              dangerouslySetInnerHTML={{ __html: data.description ?? "" }}
            />
          </section>

          <section style={styles.panel}>
            <h2 style={styles.h2}>Trends</h2>

            <div style={styles.chartBlock}>
              <div style={styles.chartLabel}>Score (placeholder)</div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="t" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="score"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.chartBlock}>
              <div style={styles.chartLabel}>Popularity (placeholder)</div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="t" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="pop"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.note}>
              Next: store real snapshots + per-episode ratings.
            </div>
          </section>
        </div>

        <section style={{ ...styles.panel, marginTop: 16 }}>
          <div style={styles.episodesHeader}>
            <h2 style={{ ...styles.h2, marginBottom: 0 }}>Episodes</h2>
            <div style={styles.episodesMeta}>
              {episodes.length
                ? `${episodes.length} episodes`
                : "No episode count"}
            </div>
          </div>

          {!episodes.length ? (
            <div style={styles.note}>
              AniList didn’t return an episode count for this show yet — we’ll
              still support community episode lists later.
            </div>
          ) : (
            <div style={styles.episodeGrid}>
              {episodes.map((ep) => (
                <div key={ep.num} style={styles.epCard}>
                  <div style={styles.epNum}>EP {ep.num}</div>
                  <div style={styles.epBadges}>
                    {ep.isFiller && <span style={styles.badge}>Filler</span>}
                    {ep.arc && <span style={styles.badge}>{ep.arc}</span>}
                  </div>
                  <button style={styles.rateBtn} disabled title="Next step">
                    Rate (coming next)
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 20% 0%, rgba(108,99,255,.20), transparent 60%), #0b0b10",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },

  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    backdropFilter: "blur(10px)",
    background: "rgba(11,11,16,.55)",
    borderBottom: "1px solid rgba(255,255,255,.06)",
  },
  brand: {
    fontWeight: 900,
    letterSpacing: 0.2,
    fontSize: 18,
    cursor: "pointer",
  },
  topBarRight: { display: "flex", gap: 10 },
  pillBtn: {
    fontSize: 12,
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    color: "#fff",
    cursor: "pointer",
  },

  hero: { position: "relative" },
  banner: {
    height: 260,
    background:
      "radial-gradient(700px 300px at 70% 25%, rgba(140,80,255,.22), transparent 60%)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderBottom: "1px solid rgba(255,255,255,.06)",
  },
  heroOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 260,
    background:
      "linear-gradient(to bottom, rgba(11,11,16,.15), rgba(11,11,16,.80) 75%, rgba(11,11,16,1))",
  },

  heroInner: {
    maxWidth: 1200,
    margin: "-86px auto 0",
    padding: "0 16px 16px",
    display: "grid",
    gridTemplateColumns: "160px 1fr 320px",
    gap: 16,
    alignItems: "end",
    position: "relative",
    zIndex: 2,
  },
  cover: {
    width: 160,
    height: 230,
    borderRadius: 18,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: "0 18px 70px rgba(0,0,0,.35)",
  },
  heroText: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    backdropFilter: "blur(10px)",
    minHeight: 230,
  },
  h1: { margin: 0, fontSize: 34, letterSpacing: -0.6, lineHeight: 1.05 },

  metaRow: { marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(0,0,0,.20)",
    opacity: 0.95,
  },

  statRow: { marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap" },
  stat: {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(0,0,0,.20)",
    border: "1px solid rgba(255,255,255,.08)",
    minWidth: 120,
  },
  statLabel: { fontSize: 11, opacity: 0.7 },
  statValue: { fontSize: 18, fontWeight: 900, marginTop: 2 },

  genreRow: { marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" },
  genre: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(108,99,255,.18)",
    border: "1px solid rgba(108,99,255,.22)",
  },

  seasonPanel: {
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    backdropFilter: "blur(10px)",
    minHeight: 230,
  },
  seasonPanelTitle: { fontSize: 12, opacity: 0.75, marginBottom: 10 },
  seasonEmpty: { fontSize: 12, opacity: 0.6 },
  seasonList: { display: "grid", gap: 10 },

  seasonItem: {
    display: "grid",
    gridTemplateColumns: "46px 1fr",
    gap: 10,
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(0,0,0,.18)",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
  },
  seasonItemActive: {
    border: "1px solid rgba(108,99,255,.35)",
    background: "rgba(108,99,255,.14)",
  },
  seasonThumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },
  seasonText: { overflow: "hidden" },
  seasonName: {
    fontWeight: 850,
    fontSize: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  seasonMeta: { fontSize: 11, opacity: 0.7, marginTop: 2 },

  main: { maxWidth: 1200, margin: "0 auto", padding: "12px 16px 60px" },
  grid: { display: "grid", gridTemplateColumns: "1fr 420px", gap: 16 },

  panel: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    boxShadow: "0 18px 60px rgba(0,0,0,.25)",
  },
  h2: { margin: 0, fontSize: 16, letterSpacing: -0.2, marginBottom: 10 },
  desc: { opacity: 0.85, fontSize: 14, lineHeight: 1.55 },
  note: { marginTop: 10, fontSize: 12, opacity: 0.7 },

  chartBlock: {
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,.18)",
    border: "1px solid rgba(255,255,255,.08)",
    marginTop: 10,
  },
  chartLabel: { fontSize: 12, opacity: 0.75, marginBottom: 6 },

  episodesHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  episodesMeta: { fontSize: 12, opacity: 0.7 },

  episodeGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
  },
  epCard: {
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(0,0,0,.18)",
    display: "grid",
    gap: 8,
  },
  epNum: { fontWeight: 900, letterSpacing: 0.2 },
  epBadges: { display: "flex", gap: 8, flexWrap: "wrap" },
  badge: {
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(255,255,255,.06)",
    opacity: 0.9,
  },
  rateBtn: {
    marginTop: 2,
    padding: "9px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(108,99,255,.18)",
    color: "#fff",
    fontWeight: 850,
    cursor: "not-allowed",
    opacity: 0.85,
  },

  loadingCard: {
    maxWidth: 520,
    margin: "120px auto 0",
    padding: 18,
    borderRadius: 18,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
  },
};
