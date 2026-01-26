import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Schedule.css";

type Props = { onLogout: () => void | Promise<void> };

type ScheduleItem = {
  aniListId: number;
  airingAt: number; // unix seconds
  episode: number;
  timeUntilAiring: number; // seconds
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  coverImageUrl?: string | null;
  format?: string | null;
  status?: string | null;
};

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDayHeader(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTimeLocalFromUnix(unixSeconds: number) {
  const dt = new Date(unixSeconds * 1000);
  return dt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function clampTitle(x: ScheduleItem) {
  return (
    x.titleEnglish ||
    x.titleRomaji ||
    x.titleNative ||
    `AniList #${x.aniListId}`
  );
}

export default function Schedule({ onLogout }: Props) {
  const navigate = useNavigate();

  const [trackedOnly, setTrackedOnly] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfDayLocal(new Date()));
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startISO = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/schedule/week?start=${encodeURIComponent(
        startISO,
      )}&days=7&trackedOnly=${trackedOnly ? "true" : "false"}`;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setItems(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load schedule");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, trackedOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const d of weekDays) map.set(toISODate(d), []);

    for (const it of items) {
      const day = toISODate(new Date(it.airingAt * 1000));
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(it);
    }

    // sort within day by airing time
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.airingAt - b.airingAt);
      map.set(k, arr);
    }

    return map;
  }, [items, weekDays]);

  return (
    <div className="schedPage">
      {/* background (manga vibe) */}
      <div className="schedBg" aria-hidden="true">
        <div className="schedSpeedLines" />
        <div className="schedHalftone" />
        <div className="schedInkWash" />
      </div>

      <header className="schedTopBar">
        <div className="schedBrand" onClick={() => navigate("/dashboard")}>
          AnimeHub
        </div>

        <div className="schedTopBarRight">
          <button
            className="schedPillBtn"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </button>
          <button className="schedPillBtn" onClick={() => navigate("/search")}>
            Search
          </button>
          <button className="schedPillBtn" disabled title="Coming soon">
            Forums
          </button>
          <button
            className="schedPillBtn isActive"
            onClick={() => navigate("/schedule")}
          >
            Schedule
          </button>

          <button className="schedLogoutBtn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="schedMain">
        <div className="schedHeaderRow">
          <div className="schedTitleBlock">
            <h1 className="schedH1">
              Release Schedule <span className="schedBang">!</span>
            </h1>
            <div className="schedSub">
              Upcoming episodes for the next 7 days — powered by AniList.
            </div>
          </div>

          <div className="schedControls">
            <div className="schedWeekNav">
              <button
                className="schedNavBtn"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                aria-label="Previous week"
              >
                ◀
              </button>
              <div className="schedWeekLabel">
                {formatDayHeader(weekStart)} →{" "}
                {formatDayHeader(addDays(weekStart, 6))}
              </div>
              <button
                className="schedNavBtn"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                aria-label="Next week"
              >
                ▶
              </button>
            </div>

            <label className="schedToggle">
              <input
                type="checkbox"
                checked={trackedOnly}
                onChange={(e) => setTrackedOnly(e.target.checked)}
              />
              <span className="schedTogglePill" />
              <span className="schedToggleText">Tracked only</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="schedPanel schedError">
            <div className="schedErrorTitle">BAM!</div>
            <div className="schedErrorMsg">{error}</div>
          </div>
        )}

        {loading ? (
          <div className="schedPanel">Loading…</div>
        ) : (
          <div className="schedGrid">
            {weekDays.map((d) => {
              const key = toISODate(d);
              const dayItems = grouped.get(key) ?? [];
              return (
                <section className="schedDay" key={key}>
                  <div className="schedDayHeader">
                    <div className="schedDayName">{formatDayHeader(d)}</div>
                    <div className="schedDayCount">{dayItems.length} drops</div>
                  </div>

                  {dayItems.length === 0 ? (
                    <div className="schedEmptyCard">
                      <div className="schedEmptyTitle">No releases</div>
                      <div className="schedEmptySub">
                        {trackedOnly
                          ? "Nothing from your tracked list this day."
                          : "It’s quiet… for now."}
                      </div>
                    </div>
                  ) : (
                    <div className="schedCards">
                      {dayItems.map((it) => (
                        <button
                          key={`${it.aniListId}-${it.episode}-${it.airingAt}`}
                          className="schedCard"
                          onClick={() => navigate(`/anime/${it.aniListId}`)}
                          title="Open details"
                        >
                          <div className="schedCoverWrap">
                            {it.coverImageUrl ? (
                              <img
                                className="schedCover"
                                src={it.coverImageUrl}
                                alt={clampTitle(it)}
                                loading="lazy"
                              />
                            ) : (
                              <div className="schedCoverFallback" />
                            )}
                            <div className="schedEpBadge">
                              EP <span>{it.episode}</span>
                            </div>
                          </div>

                          <div className="schedCardBody">
                            <div className="schedTitle">{clampTitle(it)}</div>

                            <div className="schedMetaRow">
                              <span className="schedMetaChip">
                                {formatTimeLocalFromUnix(it.airingAt)}
                              </span>
                              {it.format && (
                                <span className="schedMetaChip">
                                  {it.format}
                                </span>
                              )}
                              {it.status && (
                                <span className="schedMetaChip">
                                  {it.status}
                                </span>
                              )}
                            </div>

                            <div className="schedHint">
                              Click to view details →
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
