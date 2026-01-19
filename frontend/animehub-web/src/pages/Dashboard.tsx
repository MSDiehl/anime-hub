import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = { onLogout: () => void | Promise<void> };

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

export default function Dashboard({ onLogout }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<TrackedShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/tracked", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const trackedCount = items.length;
    const avgScore =
      trackedCount === 0
        ? null
        : Math.round(
            items.reduce((sum, x) => sum + (x.averageScore ?? 0), 0) /
              trackedCount,
          );
    return { trackedCount, avgScore };
  }, [items]);

  return (
    <div style={styles.page}>
      <div style={styles.bgGlow} />

      <header style={styles.topBar}>
        <div style={styles.brand} onClick={() => navigate("/dashboard")}>
          AnimeHub
        </div>

        <div style={styles.topBarRight}>
          <button style={styles.pillBtn} onClick={() => navigate("/dashboard")}>
            Dashboard
          </button>
          <button style={styles.pillBtn} onClick={() => navigate("/search")}>
            Search
          </button>
          <button style={styles.pillBtn} disabled title="Coming soon">
            Forums
          </button>
          <button style={styles.pillBtn} disabled title="Coming soon">
            Schedule
          </button>

          <button style={styles.logoutBtn} onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>Dashboard</h1>
            <div style={styles.sub}>Your tracked anime, at a glance.</div>
          </div>

          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Tracked</div>
              <div style={styles.statValue}>{stats.trackedCount}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Avg score</div>
              <div style={styles.statValue}>{stats.avgScore ?? "—"}</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={styles.panel}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={styles.panel}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              No tracked shows yet
            </div>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              Go to Search and track your first anime to see it here.
            </div>
            <button
              style={styles.primaryBtn}
              onClick={() => navigate("/search")}
            >
              Go to Search
            </button>
          </div>
        ) : (
          <div style={styles.grid}>
            {items.map((x) => (
              <button
                key={x.id}
                style={styles.card}
                onClick={() => navigate(`/anime/${x.aniListId}`)}
                title="Open details"
              >
                <div
                  style={{
                    ...styles.cover,
                    backgroundImage: x.coverImageUrl
                      ? `url(${x.coverImageUrl})`
                      : undefined,
                  }}
                />
                <div style={styles.cardBody}>
                  <div style={styles.title}>{x.title}</div>
                  <div style={styles.meta}>
                    {x.format ?? "—"} • {x.status ?? "—"}
                    {typeof x.episodes === "number"
                      ? ` • ${x.episodes} eps`
                      : ""}
                  </div>
                  <div style={styles.row}>
                    <span style={styles.small}>
                      Score: {x.averageScore ?? "—"}
                    </span>
                    <span style={styles.small}>Pop: {x.popularity ?? "—"}</span>
                  </div>
                </div>
              </button>
            ))}
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
      "radial-gradient(1200px 600px at 20% 0%, rgba(108,99,255,.20), transparent 60%), #0b0b10",
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
  brand: {
    fontWeight: 900,
    letterSpacing: 0.2,
    fontSize: 18,
    cursor: "pointer",
  },
  topBarRight: { display: "flex", gap: 10, alignItems: "center" },
  pillBtn: {
    fontSize: 12,
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.08)",
    opacity: 0.9,
    color: "#fff",
    cursor: "pointer",
  },
  logoutBtn: {
    marginLeft: 6,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.08)",
    color: "#fff",
    cursor: "pointer",
  },

  main: { maxWidth: 1100, margin: "0 auto", padding: "18px 16px 64px" },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  h1: { margin: 0, fontSize: 34, letterSpacing: -0.6 },
  sub: { marginTop: 6, opacity: 0.75 },

  statsRow: { display: "flex", gap: 12 },
  statCard: {
    padding: "10px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    minWidth: 120,
  },
  statLabel: { fontSize: 11, opacity: 0.7 },
  statValue: { fontSize: 18, fontWeight: 950 as any, marginTop: 3 },

  panel: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    boxShadow: "0 18px 60px rgba(0,0,0,.25)",
  },
  primaryBtn: {
    marginTop: 12,
    width: "100%",
    padding: "11px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background:
      "linear-gradient(135deg, rgba(108,99,255,1), rgba(168,94,255,1))",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
    marginTop: 10,
  },
  card: {
    textAlign: "left",
    borderRadius: 18,
    overflow: "hidden",
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    boxShadow: "0 18px 60px rgba(0,0,0,.30)",
    padding: 0,
    cursor: "pointer",
    color: "#fff",
  },
  cover: {
    height: 140,
    background: "rgba(255,255,255,.06)",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },
  cardBody: { padding: 12, display: "grid", gap: 6 },
  title: { fontWeight: 950 as any, letterSpacing: -0.2 },
  meta: { fontSize: 12, opacity: 0.75 },
  row: { display: "flex", gap: 12, flexWrap: "wrap" },
  small: { fontSize: 12, opacity: 0.75 },
};
