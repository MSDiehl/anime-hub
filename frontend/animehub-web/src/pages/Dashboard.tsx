import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getErrorMessage, readApiError } from "../utils/apiError";
import "./Dashboard.css";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracked", { credentials: "include" });
      if (!res.ok) throw new Error(await readApiError(res));
      setItems(await res.json());
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load tracked shows"));
      setItems([]);
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
    <div className="dashPage">
      {/* Manga background layers (visual only) */}
      <div className="dashBg" aria-hidden="true">
        <div className="dashSpeedLines" />
        <div className="dashHalftone" />
        <div className="dashInkWash" />
      </div>

      <header className="dashTopBar">
        <div className="dashBrand" onClick={() => navigate("/dashboard")}>
          AnimeHub
        </div>

        <div className="dashTopBarRight">
          <button
            className="dashPillBtn isActive"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </button>
          <button className="dashPillBtn" onClick={() => navigate("/search")}>
            Search
          </button>
          <button className="dashPillBtn" disabled title="Coming soon">
            Forums
          </button>
          <button className="dashPillBtn" onClick={() => navigate("/schedule")}>
            Schedule
          </button>

          <button className="dashLogoutBtn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashMain">
        <div className="dashHeaderRow">
          <div className="dashTitleBlock">
            <h1 className="dashH1">
              Dashboard{" "}
              <span className="dashBang" aria-hidden="true">
                !
              </span>
            </h1>
            <div className="dashSub">Your tracked anime, at a glance.</div>
          </div>

          <div className="dashStatsRow" aria-label="Stats">
            <div className="dashStatCard">
              <div className="dashStatLabel">Tracked</div>
              <div className="dashStatValue">{stats.trackedCount}</div>
            </div>
            <div className="dashStatCard">
              <div className="dashStatLabel">Avg score</div>
              <div className="dashStatValue">{stats.avgScore ?? "—"}</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="dashPanel">Loading…</div>
        ) : error ? (
          <div className="dashPanel">{error}</div>
        ) : items.length === 0 ? (
          <div className="dashPanel dashEmptyPanel">
            <div className="dashEmptyTitle">No tracked shows yet</div>
            <div className="dashEmptySub">
              Go to Search and track your first anime to see it here.
            </div>
            <button
              className="dashPrimaryBtn"
              onClick={() => navigate("/search")}
            >
              <span className="dashPrimaryBurst" aria-hidden="true" />
              <span className="dashPrimaryText">Go to Search</span>
            </button>
          </div>
        ) : (
          <div className="dashGrid">
            {items.map((x) => (
              <button
                key={x.id}
                className="dashCard"
                onClick={() => navigate(`/anime/${x.aniListId}`)}
                title="Open details"
              >
                <div
                  className="dashCover"
                  style={{
                    backgroundImage: x.coverImageUrl
                      ? `url(${x.coverImageUrl})`
                      : undefined,
                  }}
                />

                <div className="dashCardBody">
                  <div className="dashCardTitle">{x.title}</div>
                  <div className="dashMeta">
                    {x.format ?? "—"} • {x.status ?? "—"}
                    {typeof x.episodes === "number"
                      ? ` • ${x.episodes} eps`
                      : ""}
                  </div>

                  <div className="dashRow">
                    <span className="dashSmall">
                      Score: {x.averageScore ?? "—"}
                    </span>
                    <span className="dashSmall">
                      Pop: {x.popularity ?? "—"}
                    </span>
                  </div>
                </div>

                <span className="dashCardCorner" aria-hidden="true">
                  READ →
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
