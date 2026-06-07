import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { csrfFetch } from "../api/csrf";
import AppNav from "../components/AppNav";
import { CoverFallback, EmptyState, SkeletonBlock, useToast } from "../components/Feedback";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/Icons";
import { getErrorMessage, readApiError } from "../utils/apiError";
import "./Schedule.css";

type Props = { onLogout: () => void | Promise<void> };

type ScheduleItem = {
  aniListId: number;
  airingAt: number;
  episode: number;
  timeUntilAiring: number;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  coverImageUrl?: string | null;
  format?: string | null;
  status?: string | null;
  isTracked: boolean;
  episodeProgress?: number | null;
  isWatched: boolean;
};

type ViewMode = "week" | "month";

const formatOptions = ["All", "TV", "MOVIE", "OVA", "ONA"];

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonthLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months, 1);
  return x;
}

function formatDayHeader(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatMonthHeader(d: Date) {
  return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
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

function calendarDays(anchor: Date) {
  const first = startOfMonthLocal(anchor);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function countdownLabel(airingAt: number, nowMs: number) {
  const seconds = Math.floor((airingAt * 1000 - nowMs) / 1000);
  if (seconds <= -3600) return "aired";
  if (seconds <= 0) return "now";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function displayFormat(value: string) {
  return value === "MOVIE" ? "Movie" : value;
}

export default function Schedule({ onLogout }: Props) {
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [trackedOnly, setTrackedOnly] = useState(false);
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);
  const [groupByTracked, setGroupByTracked] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDayLocal(new Date()));
  const [formatFilter, setFormatFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted",
  );

  const localTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time",
    [],
  );

  const visibleDays = useMemo(
    () =>
      viewMode === "month"
        ? calendarDays(anchorDate)
        : Array.from({ length: 7 }, (_, i) => addDays(anchorDate, i)),
    [anchorDate, viewMode],
  );

  const startISO = useMemo(() => toISODate(visibleDays[0]), [visibleDays]);
  const dayCount = visibleDays.length;
  const rangeLabel =
    viewMode === "month"
      ? formatMonthHeader(anchorDate)
      : `${formatDayHeader(visibleDays[0])} to ${formatDayHeader(visibleDays[6])}`;
  const hasActiveFilters =
    trackedOnly || unwatchedOnly || formatFilter !== "All" || search.trim().length > 0;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start: startISO,
        days: String(dayCount),
        trackedOnly: trackedOnly ? "true" : "false",
        unwatchedOnly: unwatchedOnly ? "true" : "false",
      });

      const res = await csrfFetch(`/api/schedule/week?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setItems(await res.json());
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load schedule"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, dayCount, trackedOnly, unwatchedOnly]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notificationsEnabled) return;

    const timers = items
      .filter((item) => item.isTracked && item.airingAt * 1000 > Date.now())
      .map((item) => {
        const delay = item.airingAt * 1000 - Date.now();
        if (delay > 2_147_000_000) return null;

        return window.setTimeout(() => {
          new Notification(`${clampTitle(item)} is airing`, {
            body: `Episode ${item.episode} is available now.`,
          });
        }, delay);
      })
      .filter((timer): timer is number => timer !== null);

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [items, notificationsEnabled]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    pushToast(
      permission === "granted"
        ? "Episode notifications enabled."
        : "Notifications were not enabled.",
      permission === "granted" ? "success" : "info",
    );
  }

  function clearFilters() {
    setTrackedOnly(false);
    setUnwatchedOnly(false);
    setFormatFilter("All");
    setSearch("");
  }

  function jumpToday() {
    setAnchorDate(startOfDayLocal(new Date()));
  }

  function jumpTomorrow() {
    setAnchorDate(addDays(startOfDayLocal(new Date()), 1));
  }

  function moveRange(direction: -1 | 1) {
    setAnchorDate((current) =>
      viewMode === "month" ? addMonths(current, direction) : addDays(current, direction * 7),
    );
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items
      .filter((item) => formatFilter === "All" || item.format === formatFilter)
      .filter((item) => !query || clampTitle(item).toLowerCase().includes(query))
      .sort((a, b) => a.airingAt - b.airingAt);
  }, [formatFilter, items, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const day of visibleDays) map.set(toISODate(day), []);

    for (const item of filteredItems) {
      const day = toISODate(new Date(item.airingAt * 1000));
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(item);
    }

    for (const [key, dayItems] of map.entries()) {
      dayItems.sort((a, b) => a.airingAt - b.airingAt);
      map.set(key, dayItems);
    }

    return map;
  }, [filteredItems, visibleDays]);

  return (
    <div className="schedPage">
      <div className="schedBg" aria-hidden="true">
        <div className="schedSpeedLines" />
        <div className="schedHalftone" />
        <div className="schedInkWash" />
      </div>

      <AppNav active="schedule" onLogout={onLogout} />

      <main className="schedMain">
        <div className="schedHeaderRow">
          <div className="schedTitleBlock">
            <h1 className="schedH1">
              Release Schedule <span className="schedBang">!</span>
            </h1>
            <div className="schedSub">
              Times shown in {localTimeZone}. Cached schedule data refreshes in the background.
            </div>
          </div>

          <div className="schedControls">
            <div className="schedWeekNav">
              <button className="schedNavBtn" onClick={() => moveRange(-1)} aria-label="Previous range">
                <ChevronLeftIcon size={18} />
              </button>
              <div className="schedWeekLabel">{rangeLabel}</div>
              <button className="schedNavBtn" onClick={() => moveRange(1)} aria-label="Next range">
                <ChevronRightIcon size={18} />
              </button>
            </div>

            <button className="schedQuickBtn" onClick={jumpToday}>
              Today
            </button>
            <button className="schedQuickBtn" onClick={jumpTomorrow}>
              Tomorrow
            </button>

            <div className="schedSegmented" aria-label="Schedule view">
              {(["week", "month"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  className={viewMode === mode ? "isActive" : ""}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="schedFilterPanel">
          <input
            className="schedSearchInput"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search schedule"
          />

          <label className="schedSelectLabel">
            Format
            <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}>
              {formatOptions.map((format) => (
                <option key={format} value={format}>
                  {displayFormat(format)}
                </option>
              ))}
            </select>
          </label>

          <ScheduleToggle
            checked={trackedOnly}
            onChange={setTrackedOnly}
            label="Tracked only"
          />
          <ScheduleToggle
            checked={unwatchedOnly}
            onChange={setUnwatchedOnly}
            label="Only unwatched"
          />
          <ScheduleToggle
            checked={groupByTracked}
            onChange={setGroupByTracked}
            label="Group tracked"
          />

          <button
            className="schedNotifyBtn"
            onClick={enableNotifications}
            disabled={typeof Notification === "undefined" || notificationsEnabled}
            title={notificationsEnabled ? "Tracked episode notifications are enabled" : "Notify when tracked episodes air"}
          >
            {notificationsEnabled ? "Notifications on" : "Notify tracked"}
          </button>
        </div>

        {error && (
          <div className="schedPanel schedError">
            <div className="schedErrorTitle">BAM!</div>
            <div className="schedErrorMsg">{error}</div>
          </div>
        )}

        {loading ? (
          <div className="schedPanel">
            <SkeletonBlock rows={6} />
          </div>
        ) : (
          <div className={viewMode === "month" ? "schedGrid schedMonthGrid" : "schedGrid"}>
            {visibleDays.map((day) => {
              const key = toISODate(day);
              const dayItems = grouped.get(key) ?? [];
              const trackedItems = dayItems.filter((item) => item.isTracked);
              const untrackedItems = dayItems.filter((item) => !item.isTracked);
              const isOutsideMonth =
                viewMode === "month" && day.getMonth() !== anchorDate.getMonth();

              return (
                <section
                  className={[
                    "schedDay",
                    viewMode === "month" ? "schedDayMonth" : "",
                    isOutsideMonth ? "isOutsideMonth" : "",
                  ].join(" ")}
                  key={key}
                >
                  <div className="schedDayHeader">
                    <div className="schedDayName">{formatDayHeader(day)}</div>
                    <div className="schedDayCount">
                      {dayItems.length} {dayItems.length === 1 ? "drop" : "drops"}
                    </div>
                  </div>

                  {dayItems.length === 0 ? (
                    <div className="schedEmptyCard">
                      <EmptyState
                        actionLabel={hasActiveFilters ? "Clear filters" : "Search anime"}
                        message={
                          hasActiveFilters
                            ? "Nothing matches the current filters on this day."
                            : "Nothing is scheduled here yet."
                        }
                        onAction={hasActiveFilters ? clearFilters : () => navigate("/search")}
                        title="No releases"
                      />
                    </div>
                  ) : groupByTracked ? (
                    <div className="schedCards">
                      <ScheduleGroup
                        title="Tracked"
                        items={trackedItems}
                        nowMs={nowMs}
                        onOpen={(id) => navigate(`/anime/${id}`)}
                      />
                      <ScheduleGroup
                        title="Untracked"
                        items={untrackedItems}
                        nowMs={nowMs}
                        onOpen={(id) => navigate(`/anime/${id}`)}
                      />
                    </div>
                  ) : (
                    <div className="schedCards">
                      {dayItems.map((item) => (
                        <ScheduleCard
                          key={`${item.aniListId}-${item.episode}-${item.airingAt}`}
                          item={item}
                          nowMs={nowMs}
                          onOpen={() => navigate(`/anime/${item.aniListId}`)}
                        />
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

function ScheduleToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="schedToggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="schedTogglePill" />
      <span className="schedToggleText">{label}</span>
    </label>
  );
}

function ScheduleGroup({
  title,
  items,
  nowMs,
  onOpen,
}: {
  title: string;
  items: ScheduleItem[];
  nowMs: number;
  onOpen: (aniListId: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="schedGroup">
      <div className="schedGroupTitle">{title}</div>
      {items.map((item) => (
        <ScheduleCard
          key={`${item.aniListId}-${item.episode}-${item.airingAt}`}
          item={item}
          nowMs={nowMs}
          onOpen={() => onOpen(item.aniListId)}
        />
      ))}
    </div>
  );
}

function ScheduleCard({
  item,
  nowMs,
  onOpen,
}: {
  item: ScheduleItem;
  nowMs: number;
  onOpen: () => void;
}) {
  return (
    <button
      aria-label={`Open details for ${clampTitle(item)} episode ${item.episode}`}
      className={[
        "schedCard",
        item.isTracked ? "isTracked" : "",
        item.isWatched ? "isWatched" : "",
      ].join(" ")}
      onClick={onOpen}
      title="Open details"
    >
      <div className="schedCoverWrap">
        {item.coverImageUrl ? (
          <img
            className="schedCover"
            src={item.coverImageUrl}
            alt={clampTitle(item)}
            loading="lazy"
          />
        ) : (
          <div className="schedCoverFallback">
            <CoverFallback label="No cover" />
          </div>
        )}
        <div className="schedEpBadge">
          EP <span>{item.episode}</span>
        </div>
        <div className="schedCountdownBadge">
          {countdownLabel(item.airingAt, nowMs)}
        </div>
      </div>

      <div className="schedCardBody">
        <div className="schedTitle">{clampTitle(item)}</div>

        <div className="schedMetaRow">
          <span className="schedMetaChip">{formatTimeLocalFromUnix(item.airingAt)}</span>
          {item.format && <span className="schedMetaChip">{displayFormat(item.format)}</span>}
          {item.isTracked && <span className="schedMetaChip isTracked">Tracked</span>}
          {item.isWatched && <span className="schedMetaChip isWatched">Watched</span>}
        </div>

        <div className="schedHint">
          {item.isTracked && item.episodeProgress != null
            ? `Progress: ${item.episodeProgress}`
            : "Open details"}
        </div>
      </div>
    </button>
  );
}
