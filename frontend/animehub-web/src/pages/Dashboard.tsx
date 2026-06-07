import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiDownload,
  apiGet,
  apiSend,
  type TrackedShow,
  type TrackingStatus,
} from "../api/client";
import AppNav from "../components/AppNav";
import { CoverFallback, EmptyState, SkeletonBlock, useConfirm, useToast } from "../components/Feedback";
import { StarIcon, TrashIcon } from "../components/Icons";
import { getErrorMessage } from "../utils/apiError";
import "./Dashboard.css";

type Props = { onLogout: () => void | Promise<void> };

type ScheduleItem = {
  aniListId: number;
  episode: number;
  airingAt: number;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleNative?: string | null;
  coverImageUrl?: string | null;
};

type SortKey = "recentlyAdded" | "title" | "score" | "popularity" | "nextEpisode";
type ViewMode = "grid" | "list" | "stats";

const trackingStatuses: TrackingStatus[] = [
  "Watching",
  "Completed",
  "Paused",
  "Dropped",
  "PlanToWatch",
];

const statusLabels: Record<TrackingStatus, string> = {
  Watching: "Watching",
  Completed: "Completed",
  Paused: "Paused",
  Dropped: "Dropped",
  PlanToWatch: "Plan to Watch",
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function titleForSchedule(item: ScheduleItem) {
  return item.titleEnglish || item.titleRomaji || item.titleNative || `AniList #${item.aniListId}`;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort();
}

export default function Dashboard({ onLogout }: Props) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { confirm } = useConfirm();
  const { pushToast } = useToast();

  const [items, setItems] = useState<TrackedShow[]>([]);
  const [airingToday, setAiringToday] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [airingLoading, setAiringLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [formatFilter, setFormatFilter] = useState("All");
  const [genreFilter, setGenreFilter] = useState("All");
  const [seasonFilter, setSeasonFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("recentlyAdded");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    load();
    loadAiringToday();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiGet<TrackedShow[]>("/api/tracked"));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load tracked shows"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAiringToday() {
    setAiringLoading(true);
    try {
      setAiringToday(await apiGet<ScheduleItem[]>(
        `/api/schedule/week?start=${encodeURIComponent(todayIso())}&days=1&trackedOnly=true`,
      ));
    } catch {
      setAiringToday([]);
    } finally {
      setAiringLoading(false);
    }
  }

  async function patchTracked(aniListId: number, patch: Partial<TrackedShow>) {
    setNotice(null);
    const previousItems = items;
    setItems((prev) =>
      prev.map((item) =>
        item.aniListId === aniListId
          ? { ...item, ...patch, updatedUtc: new Date().toISOString() }
          : item,
      ),
    );

    try {
      const updated = await apiSend<TrackedShow>(`/api/tracked/${aniListId}`, "PATCH", patch);
      setItems((prev) => prev.map((item) => (item.aniListId === aniListId ? updated : item)));
    } catch (e: unknown) {
      setItems(previousItems);
      setError(getErrorMessage(e, "Failed to update show"));
      pushToast("Could not save that tracking change.", "error");
    }
  }

  async function untrack(aniListId: number) {
    const item = items.find((show) => show.aniListId === aniListId);
    const ok = await confirm({
      title: "Untrack show?",
      message: `Remove ${item?.title ?? "this show"} from your tracked list?`,
      confirmLabel: "Untrack",
      danger: true,
    });
    if (!ok) return;

    setNotice(null);
    const previousItems = items;
    setItems((prev) => prev.filter((show) => show.aniListId !== aniListId));

    try {
      await apiSend<void>(`/api/tracked/${aniListId}`, "DELETE");
      setNotice("Show removed from your tracked list.");
      pushToast(`${item?.title ?? "Show"} removed.`, "success");
    } catch (e: unknown) {
      setItems(previousItems);
      setError(getErrorMessage(e, "Failed to untrack show"));
      pushToast("Could not untrack that show.", "error");
    }
  }

  async function exportTracked(format: "json" | "csv") {
    setNotice(null);
    try {
      const blob = await apiDownload(`/api/tracked/export?format=${format}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `animehub-tracked.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast(`Exported tracked list as ${format.toUpperCase()}.`, "success");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Export failed"));
    }
  }

  async function importTracked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setNotice(null);
    setError(null);

    try {
      const text = await file.text();
      const payload = file.name.toLowerCase().endsWith(".csv")
        ? parseTrackedCsv(text)
        : JSON.parse(text);

      const result = await apiSend<{ created: number; updated: number }>(
        "/api/tracked/import",
        "POST",
        payload,
      );
      setNotice(`Imported ${result.created} new and updated ${result.updated} shows.`);
      pushToast("Import complete.", "success");
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Import failed"));
    } finally {
      event.target.value = "";
    }
  }

  const options = useMemo(() => {
    return {
      formats: unique(items.map((x) => x.format)),
      genres: unique(items.flatMap((x) => x.genres)),
      seasons: unique(items.map((x) => x.season)),
      years: unique(items.map((x) => x.seasonYear?.toString())),
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items
      .filter((item) => !q || item.title.toLowerCase().includes(q))
      .filter((item) => statusFilter === "All" || item.trackingStatus === statusFilter)
      .filter((item) => formatFilter === "All" || item.format === formatFilter)
      .filter((item) => genreFilter === "All" || item.genres.includes(genreFilter))
      .filter((item) => seasonFilter === "All" || item.season === seasonFilter)
      .filter((item) => yearFilter === "All" || String(item.seasonYear) === yearFilter)
      .slice()
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "score") return (b.averageScore ?? -1) - (a.averageScore ?? -1);
        if (sortBy === "popularity") return (b.popularity ?? -1) - (a.popularity ?? -1);
        if (sortBy === "nextEpisode") return nextEpisodeSort(a) - nextEpisodeSort(b);
        return new Date(b.createdUtc).getTime() - new Date(a.createdUtc).getTime();
      });
  }, [formatFilter, genreFilter, items, search, seasonFilter, sortBy, statusFilter, yearFilter]);

  const sections = useMemo(() => {
    const recentlyTracked = items
      .slice()
      .sort((a, b) => new Date(b.createdUtc).getTime() - new Date(a.createdUtc).getTime())
      .slice(0, 4);
    const continueWatching = items
      .filter((x) => x.trackingStatus === "Watching" && (!x.episodes || x.episodeProgress < x.episodes))
      .sort((a, b) => (a.nextEpisode ?? 99999) - (b.nextEpisode ?? 99999))
      .slice(0, 4);
    const favorites = items.filter((x) => x.isFavorite).slice(0, 4);

    return { recentlyTracked, continueWatching, favorites };
  }, [items]);

  const stats = useMemo(() => {
    const avgPersonal =
      items.length === 0
        ? null
        : Math.round(
            (items.reduce((sum, x) => sum + (x.personalRating ?? 0), 0) / items.length) * 10,
          ) / 10;
    const avgAniList =
      items.length === 0
        ? null
        : Math.round(items.reduce((sum, x) => sum + (x.averageScore ?? 0), 0) / items.length);
    const episodesWatched = items.reduce((sum, x) => sum + x.episodeProgress, 0);

    return {
      trackedCount: items.length,
      favorites: items.filter((x) => x.isFavorite).length,
      avgPersonal,
      avgAniList,
      episodesWatched,
    };
  }, [items]);

  return (
    <div className="dashPage">
      <div className="dashBg" aria-hidden="true">
        <div className="dashSpeedLines" />
        <div className="dashHalftone" />
        <div className="dashInkWash" />
      </div>

      <AppNav active="dashboard" onLogout={onLogout} />

      <main className="dashMain">
        <div className="dashHeaderRow">
          <div className="dashTitleBlock">
            <h1 className="dashH1">
              Dashboard <span className="dashBang" aria-hidden="true">!</span>
            </h1>
            <div className="dashSub">Your tracked anime, organized for watching.</div>
          </div>

          <div className="dashStatsRow" aria-label="Stats">
            <Stat label="Tracked" value={stats.trackedCount} />
            <Stat label="Favorites" value={stats.favorites} />
            <Stat label="Episodes" value={stats.episodesWatched} />
            <Stat label="My avg" value={stats.avgPersonal ?? "—"} />
          </div>
        </div>

        <div className="dashToolbar dashPanel">
          <input
            className="dashSearchInput"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tracked list"
          />

          <Select label="Sort" value={sortBy} onChange={(v) => setSortBy(v as SortKey)}>
            <option value="recentlyAdded">Recently added</option>
            <option value="title">Title</option>
            <option value="score">AniList score</option>
            <option value="popularity">Popularity</option>
            <option value="nextEpisode">Next episode</option>
          </Select>

          <Select label="Status" value={statusFilter} onChange={setStatusFilter}>
            <option value="All">All</option>
            {trackingStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </Select>

          <Select label="Format" value={formatFilter} onChange={setFormatFilter}>
            <option value="All">All</option>
            {options.formats.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>

          <Select label="Genre" value={genreFilter} onChange={setGenreFilter}>
            <option value="All">All</option>
            {options.genres.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>

          <Select label="Season" value={seasonFilter} onChange={setSeasonFilter}>
            <option value="All">All</option>
            {options.seasons.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>

          <Select label="Year" value={yearFilter} onChange={setYearFilter}>
            <option value="All">All</option>
            {options.years.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>
        </div>

        <div className="dashActionRow">
          <Segmented value={viewMode} onChange={setViewMode} />
          <button className="dashPillBtn" onClick={() => exportTracked("json")}>Export JSON</button>
          <button className="dashPillBtn" onClick={() => exportTracked("csv")}>Export CSV</button>
          <button className="dashPillBtn" onClick={() => fileInputRef.current?.click()}>Import</button>
          <button className="dashPillBtn" disabled title="AniList sync is planned for a later release">
            AniList sync later
          </button>
          <input
            ref={fileInputRef}
            className="dashHiddenInput"
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={importTracked}
          />
        </div>

        {notice && <div className="dashPanel dashNotice">{notice}</div>}
        {error && items.length > 0 && <div className="dashPanel dashError">{error}</div>}

        {loading ? (
          <div className="dashPanel dashSkeletonPanel">
            <SkeletonBlock rows={4} />
          </div>
        ) : error && items.length === 0 ? (
          <div className="dashPanel dashEmptyPanel">
            <EmptyState
              actionLabel="Retry"
              message={error}
              onAction={load}
              title="Could not load tracked shows"
            />
          </div>
        ) : items.length === 0 ? (
          <div className="dashPanel dashEmptyPanel">
            <EmptyState
              actionLabel="Go to Search"
              message="Track your first anime to unlock lists, stats, favorites, and airing reminders."
              onAction={() => navigate("/search")}
              title="No tracked shows yet"
            />
          </div>
        ) : (
          <>
            <DashboardSections
              sections={sections}
              airingToday={airingToday}
              airingLoading={airingLoading}
              onOpen={(id) => navigate(`/anime/${id}`)}
              onSchedule={() => navigate("/schedule")}
              onSearch={() => navigate("/search")}
            />

            {viewMode === "stats" ? (
              <StatsView items={items} stats={stats} />
            ) : (
              <div className={viewMode === "list" ? "dashList" : "dashGrid"}>
                {filtered.map((item) => (
                  <TrackedCard
                    key={item.id}
                    item={item}
                    mode={viewMode}
                    onOpen={() => navigate(`/anime/${item.aniListId}`)}
                    onPatch={(patch) => patchTracked(item.aniListId, patch)}
                    onUntrack={() => untrack(item.aniListId)}
                  />
                ))}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="dashPanel">
                <EmptyState
                  actionLabel="Reset filters"
                  message="Clear the current filters to see your full tracked list again."
                  onAction={() => {
                    setSearch("");
                    setStatusFilter("All");
                    setFormatFilter("All");
                    setGenreFilter("All");
                    setSeasonFilter("All");
                    setYearFilter("All");
                  }}
                  title="No shows match those filters"
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="dashStatCard">
      <div className="dashStatLabel">{label}</div>
      <div className="dashStatValue">{value}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="dashControl">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

function Segmented({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="dashSegmented" aria-label="Dashboard view">
      {(["grid", "list", "stats"] as ViewMode[]).map((mode) => (
        <button key={mode} className={value === mode ? "isActive" : ""} onClick={() => onChange(mode)}>
          {mode === "grid" ? "Grid" : mode === "list" ? "Compact" : "Stats"}
        </button>
      ))}
    </div>
  );
}

function DashboardSections({
  sections,
  airingToday,
  airingLoading,
  onOpen,
  onSchedule,
  onSearch,
}: {
  sections: {
    recentlyTracked: TrackedShow[];
    continueWatching: TrackedShow[];
    favorites: TrackedShow[];
  };
  airingToday: ScheduleItem[];
  airingLoading: boolean;
  onOpen: (aniListId: number) => void;
  onSchedule: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="dashSectionGrid">
      <MiniSection title="Continue watching" items={sections.continueWatching} onOpen={onOpen} onEmptyAction={onSearch} />
      <section className="dashMiniSection dashPanel">
        <div className="dashMiniTitle">Airing today</div>
        {airingLoading ? (
          <SkeletonBlock rows={3} />
        ) : airingToday.length === 0 ? (
          <EmptyState
            actionLabel="Open schedule"
            message="Use the schedule page to browse upcoming releases."
            onAction={onSchedule}
            title="No tracked episodes today"
          />
        ) : (
          airingToday.slice(0, 4).map((item) => (
            <button key={`${item.aniListId}-${item.episode}`} className="dashMiniItem" onClick={() => onOpen(item.aniListId)}>
              <span>{titleForSchedule(item)}</span>
              <b>EP {item.episode}</b>
            </button>
          ))
        )}
      </section>
      <MiniSection title="Recently tracked" items={sections.recentlyTracked} onOpen={onOpen} onEmptyAction={onSearch} />
      <MiniSection title="Favorites" items={sections.favorites} onOpen={onOpen} onEmptyAction={onSearch} />
    </div>
  );
}

function MiniSection({
  title,
  items,
  onOpen,
  onEmptyAction,
}: {
  title: string;
  items: TrackedShow[];
  onOpen: (aniListId: number) => void;
  onEmptyAction: () => void;
}) {
  return (
    <section className="dashMiniSection dashPanel">
      <div className="dashMiniTitle">{title}</div>
      {items.length === 0 ? (
        <EmptyState
          actionLabel="Open search"
          message="This section fills in as you track and update shows."
          onAction={onEmptyAction}
          title="Nothing here yet"
        />
      ) : (
        items.map((item) => (
          <button key={item.id} className="dashMiniItem" onClick={() => onOpen(item.aniListId)}>
            <span>{item.title}</span>
            <b>{item.nextEpisode ? `EP ${item.nextEpisode}` : statusLabels[item.trackingStatus]}</b>
          </button>
        ))
      )}
    </section>
  );
}

function TrackedCard({
  item,
  mode,
  onOpen,
  onPatch,
  onUntrack,
}: {
  item: TrackedShow;
  mode: ViewMode;
  onOpen: () => void;
  onPatch: (patch: Partial<TrackedShow>) => void;
  onUntrack: () => void;
}) {
  const progressMax = item.episodes ?? 9999;

  return (
    <article className={mode === "list" ? "dashCard dashCardList" : "dashCard"}>
      <button className="dashOpenArea" onClick={onOpen} title="Open details">
        <div
          className="dashCover"
          style={{ backgroundImage: item.coverImageUrl ? `url(${item.coverImageUrl})` : undefined }}
        >
          {!item.coverImageUrl && <CoverFallback />}
        </div>
      </button>

      <div className="dashCardBody">
        <div className="dashCardTop">
          <button className="dashTitleButton" onClick={onOpen}>{item.title}</button>
          <button
            className={"dashIconBtn" + (item.isFavorite ? " isFavorite" : "")}
            onClick={() => onPatch({ isFavorite: !item.isFavorite })}
            title={item.isFavorite ? "Remove favorite" : "Favorite"}
          >
            <StarIcon size={18} />
          </button>
        </div>

        <div className="dashMeta">
          {item.format ?? "—"} • {item.status ?? "—"}
          {typeof item.episodes === "number" ? ` • ${item.episodes} eps` : ""}
        </div>

        <div className="dashFieldGrid">
          <label>
            Status
            <select
              value={item.trackingStatus}
              onChange={(e) => onPatch({ trackingStatus: e.target.value as TrackingStatus })}
            >
              {trackingStatuses.map((status) => (
                <option key={status} value={status}>{statusLabels[status]}</option>
              ))}
            </select>
          </label>

          <label>
            Progress
            <input
              type="number"
              min={0}
              max={progressMax}
              value={item.episodeProgress}
              onChange={(e) => onPatch({ episodeProgress: Number(e.target.value) })}
            />
          </label>

          <label>
            Rating
            <input
              type="number"
              min={0}
              max={10}
              value={item.personalRating ?? ""}
              onChange={(e) => onPatch({ personalRating: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>

          <label>
            Rewatches
            <input
              type="number"
              min={0}
              value={item.rewatchCount}
              onChange={(e) => onPatch({ rewatchCount: Number(e.target.value) })}
            />
          </label>

          <label>
            Started
            <input
              type="date"
              value={item.startedOn ?? ""}
              onChange={(e) => onPatch({ startedOn: e.target.value || null })}
            />
          </label>

          <label>
            Finished
            <input
              type="date"
              value={item.completedOn ?? ""}
              onChange={(e) => onPatch({ completedOn: e.target.value || null })}
            />
          </label>
        </div>

        <label className="dashTextField">
          Notes
          <textarea
            key={`notes-${item.id}`}
            defaultValue={item.notes ?? ""}
            onBlur={(e) => onPatch({ notes: e.currentTarget.value })}
          />
        </label>

        <label className="dashTextField">
          Review
          <textarea
            key={`review-${item.id}`}
            defaultValue={item.review ?? ""}
            onBlur={(e) => onPatch({ review: e.currentTarget.value })}
          />
        </label>

        <div className="dashRow">
          <span className="dashSmall">AniList: {item.averageScore ?? "—"}</span>
          <span className="dashSmall">Pop: {item.popularity ?? "—"}</span>
          <span className="dashSmall">Next: {item.nextEpisode ?? "—"}</span>
        </div>

        <div className="dashCardActions">
          <button className="dashPillBtn" onClick={onOpen}>Details</button>
          <button className="dashDangerBtn" onClick={onUntrack}>
            <TrashIcon size={16} /> Untrack
          </button>
        </div>
      </div>
    </article>
  );
}

function StatsView({
  items,
  stats,
}: {
  items: TrackedShow[];
  stats: {
    trackedCount: number;
    favorites: number;
    avgPersonal: number | null;
    avgAniList: number | null;
    episodesWatched: number;
  };
}) {
  const counts = trackingStatuses.map((status) => ({
    status,
    count: items.filter((item) => item.trackingStatus === status).length,
  }));

  return (
    <div className="dashStatsPanel dashPanel">
      <div className="dashStatsBig">
        <Stat label="Tracked" value={stats.trackedCount} />
        <Stat label="Favorites" value={stats.favorites} />
        <Stat label="Episodes watched" value={stats.episodesWatched} />
        <Stat label="My avg rating" value={stats.avgPersonal ?? "—"} />
        <Stat label="AniList avg" value={stats.avgAniList ?? "—"} />
      </div>
      <div className="dashStatusBars">
        {counts.map(({ status, count }) => (
          <div key={status} className="dashStatusBar">
            <span>{statusLabels[status]}</span>
            <div>
              <i style={{ width: `${items.length ? (count / items.length) * 100 : 0}%` }} />
            </div>
            <b>{count}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function nextEpisodeSort(item: TrackedShow) {
  if (!item.nextEpisode) return Number.MAX_SAFE_INTEGER;
  return item.nextEpisode;
}

function parseTrackedCsv(text: string) {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);

  return lines.map((line) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""]));

    return {
      aniListId: Number(row.aniListId),
      title: row.title,
      trackingStatus: row.trackingStatus,
      episodeProgress: numberOrNull(row.episodeProgress),
      episodes: numberOrNull(row.episodes),
      personalRating: numberOrNull(row.personalRating),
      isFavorite: row.isFavorite?.toLowerCase() === "true",
      rewatchCount: numberOrNull(row.rewatchCount),
      startedOn: row.startedOn || null,
      completedOn: row.completedOn || null,
      format: row.format || null,
      status: row.status || null,
      season: row.season || null,
      seasonYear: numberOrNull(row.seasonYear),
      averageScore: numberOrNull(row.averageScore),
      popularity: numberOrNull(row.popularity),
      genres: row.genres ? row.genres.split("|").filter(Boolean) : [],
      notes: row.notes || null,
      review: row.review || null,
    };
  });
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function numberOrNull(value: string) {
  return value === "" || value == null ? null : Number(value);
}
