import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
    apiGet,
    apiSend,
    bulkUpdateTracked,
    downloadTrackedExport,
    getTrackedHistory,
    getTrackedStats,
    type CountBucket,
    type TrackedShow,
    type TrackedShowHistory,
    type TrackedStats,
    type TrackingStatus,
} from "../api/client";
import AppNav from "../components/AppNav";
import {
    CoverFallback,
    EmptyState,
    SkeletonBlock,
    useConfirm,
    useToast,
} from "../components/Feedback";
import { StarIcon, TrashIcon } from "../components/Icons";
import { getErrorMessage } from "../utils/apiError";
import "./Dashboard.css";

type Props = { onLogout: () => void | Promise<void> };

type ScheduleItem = {
    aniListId: number;
    episode: number;
    airingAt: number;
    isTracked?: boolean;
    isWatched?: boolean;
    episodeProgress?: number | null;
    titleEnglish?: string | null;
    titleRomaji?: string | null;
    titleNative?: string | null;
    coverImageUrl?: string | null;
};

type SortKey =
    | "recentlyAdded"
    | "title"
    | "score"
    | "popularity"
    | "nextEpisode";
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
    return (
        item.titleEnglish ||
        item.titleRomaji ||
        item.titleNative ||
        `AniList #${item.aniListId}`
    );
}

function formatScheduleDate(item: ScheduleItem) {
    return new Date(item.airingAt * 1000).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
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
    const [watchNext, setWatchNext] = useState<ScheduleItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [trackingStats, setTrackingStats] = useState<TrackedStats | null>(
        null,
    );
    const [history, setHistory] = useState<TrackedShowHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [watchNextLoading, setWatchNextLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [formatFilter, setFormatFilter] = useState("All");
    const [genreFilter, setGenreFilter] = useState("All");
    const [seasonFilter, setSeasonFilter] = useState("All");
    const [listFilter, setListFilter] = useState("All");
    const [tagFilter, setTagFilter] = useState("All");
    const [yearFilter, setYearFilter] = useState("All");
    const [sortBy, setSortBy] = useState<SortKey>("recentlyAdded");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [bulkStatus, setBulkStatus] = useState<TrackingStatus>("Watching");

    useEffect(() => {
        load();
        loadWatchNext();
    }, []);

    async function load() {
        setLoading(true);
        setError(null);
        try {
            const [tracked, statsResult, historyResult] = await Promise.all([
                apiGet<TrackedShow[]>("/api/tracked"),
                getTrackedStats().catch(() => null),
                getTrackedHistory(60).catch(() => []),
            ]);
            setItems(tracked);
            setTrackingStats(statsResult);
            setHistory(historyResult);
            setSelectedIds(
                (current) =>
                    new Set(
                        [...current].filter((id) =>
                            tracked.some((item) => item.aniListId === id),
                        ),
                    ),
            );
        } catch (e: unknown) {
            setError(getErrorMessage(e, "Failed to load tracked shows"));
            setItems([]);
        } finally {
            setLoading(false);
        }
    }

    async function loadWatchNext() {
        setWatchNextLoading(true);
        try {
            setWatchNext(
                await apiGet<ScheduleItem[]>(
                    `/api/schedule/week?start=${encodeURIComponent(todayIso())}&days=14&trackedOnly=true&unwatchedOnly=true`,
                ),
            );
        } catch {
            setWatchNext([]);
        } finally {
            setWatchNextLoading(false);
        }
    }

    async function patchTracked(
        aniListId: number,
        patch: Partial<TrackedShow>,
    ) {
        setNotice(null);
        const previousItems = items;
        setItems((prev) =>
            prev.map((item) =>
                item.aniListId === aniListId
                    ? {
                          ...item,
                          ...patch,
                          updatedUtc: new Date().toISOString(),
                      }
                    : item,
            ),
        );

        try {
            const updated = await apiSend<TrackedShow>(
                `/api/tracked/${aniListId}`,
                "PATCH",
                patch,
            );
            setItems((prev) =>
                prev.map((item) =>
                    item.aniListId === aniListId ? updated : item,
                ),
            );
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
            const blob = await downloadTrackedExport(format);
            downloadBlob(blob, `animehub-tracked.${format}`);
            pushToast(
                `Exported tracked list as ${format.toUpperCase()}.`,
                "success",
            );
        } catch (e: unknown) {
            setError(getErrorMessage(e, "Export failed"));
        }
    }

    async function exportSelected(format: "json" | "csv") {
        const ids = [...selectedIds];
        if (ids.length === 0) return;

        setNotice(null);
        try {
            const blob = await downloadTrackedExport(format, ids);
            downloadBlob(blob, `animehub-selected.${format}`);
            pushToast(`Exported ${ids.length} selected shows.`, "success");
        } catch (e: unknown) {
            setError(getErrorMessage(e, "Selected export failed"));
        }
    }

    async function runBulk(patch: {
        trackingStatus?: TrackingStatus;
        isFavorite?: boolean;
        delete?: boolean;
    }) {
        const ids = [...selectedIds];
        if (ids.length === 0) return;

        if (patch.delete) {
            const ok = await confirm({
                title: "Delete selected?",
                message: `Remove ${ids.length} selected shows from your tracked list?`,
                confirmLabel: "Delete selected",
                danger: true,
            });
            if (!ok) return;
        }

        setNotice(null);
        setError(null);
        try {
            const result = await bulkUpdateTracked({
                aniListIds: ids,
                ...patch,
            });
            setNotice(
                result.deleted > 0
                    ? `Deleted ${result.deleted} selected shows.`
                    : `Updated ${result.updated} selected shows.`,
            );
            pushToast(
                result.deleted > 0
                    ? "Selected shows deleted."
                    : "Selected shows updated.",
                "success",
            );
            setSelectedIds(new Set());
            await load();
        } catch (e: unknown) {
            setError(getErrorMessage(e, "Bulk update failed"));
            pushToast("Bulk action failed.", "error");
        }
    }

    async function importTracked(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        setNotice(null);
        setError(null);

        try {
            const text = await file.text();
            const payload = parseImportPayload(file, text);

            const result = await apiSend<{
                created: number;
                updated: number;
                skipped?: number;
            }>("/api/tracked/import", "POST", payload);
            setNotice(
                `Imported ${result.created} new and updated ${result.updated} shows.` +
                    (result.skipped ? ` Skipped ${result.skipped} rows.` : ""),
            );
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
            lists: unique(items.map((x) => x.customListName)),
            tags: unique(items.flatMap((x) => x.userTags)),
            years: unique(items.map((x) => x.seasonYear?.toString())),
        };
    }, [items]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return items
            .filter((item) => !q || item.title.toLowerCase().includes(q))
            .filter(
                (item) =>
                    statusFilter === "All" ||
                    item.trackingStatus === statusFilter,
            )
            .filter(
                (item) =>
                    formatFilter === "All" || item.format === formatFilter,
            )
            .filter(
                (item) =>
                    genreFilter === "All" || item.genres.includes(genreFilter),
            )
            .filter(
                (item) =>
                    seasonFilter === "All" || item.season === seasonFilter,
            )
            .filter(
                (item) =>
                    listFilter === "All" || item.customListName === listFilter,
            )
            .filter(
                (item) =>
                    tagFilter === "All" || item.userTags.includes(tagFilter),
            )
            .filter(
                (item) =>
                    yearFilter === "All" ||
                    String(item.seasonYear) === yearFilter,
            )
            .slice()
            .sort((a, b) => {
                if (sortBy === "title") return a.title.localeCompare(b.title);
                if (sortBy === "score")
                    return (b.averageScore ?? -1) - (a.averageScore ?? -1);
                if (sortBy === "popularity")
                    return (b.popularity ?? -1) - (a.popularity ?? -1);
                if (sortBy === "nextEpisode")
                    return nextEpisodeSort(a) - nextEpisodeSort(b);
                return (
                    new Date(b.createdUtc).getTime() -
                    new Date(a.createdUtc).getTime()
                );
            });
    }, [
        formatFilter,
        genreFilter,
        items,
        listFilter,
        search,
        seasonFilter,
        sortBy,
        statusFilter,
        tagFilter,
        yearFilter,
    ]);

    const selectedItems = useMemo(
        () => items.filter((item) => selectedIds.has(item.aniListId)),
        [items, selectedIds],
    );
    const selectedFilteredCount = filtered.filter((item) =>
        selectedIds.has(item.aniListId),
    ).length;
    const allFilteredSelected =
        filtered.length > 0 && selectedFilteredCount === filtered.length;

    function toggleSelected(aniListId: number) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(aniListId)) next.delete(aniListId);
            else next.add(aniListId);
            return next;
        });
    }

    function toggleFilteredSelection() {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (allFilteredSelected) {
                for (const item of filtered) next.delete(item.aniListId);
            } else {
                for (const item of filtered) next.add(item.aniListId);
            }
            return next;
        });
    }

    const sections = useMemo(() => {
        const recentlyTracked = items
            .slice()
            .sort(
                (a, b) =>
                    new Date(b.createdUtc).getTime() -
                    new Date(a.createdUtc).getTime(),
            )
            .slice(0, 4);
        const continueWatching = items
            .filter(
                (x) =>
                    x.trackingStatus === "Watching" &&
                    (!x.episodes || x.episodeProgress < x.episodes),
            )
            .sort((a, b) => (a.nextEpisode ?? 99999) - (b.nextEpisode ?? 99999))
            .slice(0, 4);
        const favorites = items.filter((x) => x.isFavorite).slice(0, 4);

        return { recentlyTracked, continueWatching, favorites };
    }, [items]);

    const stats = useMemo(() => {
        const rated = items.filter((x) => x.personalRating != null);
        const scored = items.filter((x) => x.averageScore != null);
        const avgPersonal =
            rated.length === 0
                ? null
                : Math.round(
                      (rated.reduce(
                          (sum, x) => sum + (x.personalRating ?? 0),
                          0,
                      ) /
                          rated.length) *
                          10,
                  ) / 10;
        const avgAniList =
            scored.length === 0
                ? null
                : Math.round(
                      scored.reduce(
                          (sum, x) => sum + (x.averageScore ?? 0),
                          0,
                      ) / scored.length,
                  );
        const episodesWatched = items.reduce(
            (sum, x) => sum + x.episodeProgress,
            0,
        );

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
                            Dashboard{" "}
                            <span className="dashBang" aria-hidden="true">
                                !
                            </span>
                        </h1>
                        <div className="dashSub">
                            Your tracked anime, organized for watching.
                        </div>
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

                    <Select
                        label="Sort"
                        value={sortBy}
                        onChange={(v) => setSortBy(v as SortKey)}
                    >
                        <option value="recentlyAdded">Recently added</option>
                        <option value="title">Title</option>
                        <option value="score">AniList score</option>
                        <option value="popularity">Popularity</option>
                        <option value="nextEpisode">Next episode</option>
                    </Select>

                    <Select
                        label="Status"
                        value={statusFilter}
                        onChange={setStatusFilter}
                    >
                        <option value="All">All</option>
                        {trackingStatuses.map((status) => (
                            <option key={status} value={status}>
                                {statusLabels[status]}
                            </option>
                        ))}
                    </Select>

                    <Select
                        label="Format"
                        value={formatFilter}
                        onChange={setFormatFilter}
                    >
                        <option value="All">All</option>
                        {options.formats.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </Select>

                    <Select
                        label="Genre"
                        value={genreFilter}
                        onChange={setGenreFilter}
                    >
                        <option value="All">All</option>
                        {options.genres.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </Select>

                    <Select
                        label="Season"
                        value={seasonFilter}
                        onChange={setSeasonFilter}
                    >
                        <option value="All">All</option>
                        {options.seasons.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </Select>

                    <Select
                        label="List"
                        value={listFilter}
                        onChange={setListFilter}
                    >
                        <option value="All">All</option>
                        {options.lists.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </Select>

                    <Select
                        label="Tag"
                        value={tagFilter}
                        onChange={setTagFilter}
                    >
                        <option value="All">All</option>
                        {options.tags.map((value) => (
                            <option key={value} value={value}>
                                #{value}
                            </option>
                        ))}
                    </Select>

                    <Select
                        label="Year"
                        value={yearFilter}
                        onChange={setYearFilter}
                    >
                        <option value="All">All</option>
                        {options.years.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="dashActionRow">
                    <Segmented value={viewMode} onChange={setViewMode} />
                    <button
                        className="dashPillBtn"
                        onClick={() => exportTracked("json")}
                    >
                        Export JSON
                    </button>
                    <button
                        className="dashPillBtn"
                        onClick={() => exportTracked("csv")}
                    >
                        Export CSV
                    </button>
                    <button
                        className="dashPillBtn"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        Import
                    </button>
                    <button
                        className="dashPillBtn"
                        onClick={() => navigate("/discover")}
                    >
                        Discover picks
                    </button>
                    <button
                        className="dashPillBtn"
                        disabled
                        title="AniList sync is planned for a later release"
                    >
                        AniList sync later
                    </button>
                    <input
                        ref={fileInputRef}
                        className="dashHiddenInput"
                        type="file"
                        accept=".json,.csv,.xml,application/json,text/csv,application/vnd.ms-excel,text/xml,application/xml"
                        onChange={importTracked}
                    />
                </div>

                {items.length > 0 && (
                    <div className="dashBulkBar dashPanel">
                        <button
                            className="dashPillBtn"
                            onClick={toggleFilteredSelection}
                        >
                            {allFilteredSelected
                                ? "Clear filtered"
                                : "Select filtered"}
                        </button>
                        <span>{selectedItems.length} selected</span>
                        <Select
                            label="Bulk status"
                            value={bulkStatus}
                            onChange={(value) =>
                                setBulkStatus(value as TrackingStatus)
                            }
                        >
                            {trackingStatuses.map((status) => (
                                <option key={status} value={status}>
                                    {statusLabels[status]}
                                </option>
                            ))}
                        </Select>
                        <button
                            className="dashPillBtn"
                            disabled={selectedItems.length === 0}
                            onClick={() =>
                                runBulk({ trackingStatus: bulkStatus })
                            }
                        >
                            Apply status
                        </button>
                        <button
                            className="dashPillBtn"
                            disabled={selectedItems.length === 0}
                            onClick={() => runBulk({ isFavorite: true })}
                        >
                            Favorite
                        </button>
                        <button
                            className="dashPillBtn"
                            disabled={selectedItems.length === 0}
                            onClick={() => runBulk({ isFavorite: false })}
                        >
                            Unfavorite
                        </button>
                        <button
                            className="dashPillBtn"
                            disabled={selectedItems.length === 0}
                            onClick={() => exportSelected("json")}
                        >
                            Export selected JSON
                        </button>
                        <button
                            className="dashPillBtn"
                            disabled={selectedItems.length === 0}
                            onClick={() => exportSelected("csv")}
                        >
                            Export selected CSV
                        </button>
                        <button
                            className="dashDangerBtn"
                            disabled={selectedItems.length === 0}
                            onClick={() => runBulk({ delete: true })}
                        >
                            <TrashIcon size={16} /> Delete selected
                        </button>
                    </div>
                )}

                {notice && <div className="dashPanel dashNotice">{notice}</div>}
                {error && items.length > 0 && (
                    <div className="dashPanel dashError">{error}</div>
                )}

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
                            watchNext={watchNext}
                            watchNextLoading={watchNextLoading}
                            onOpen={(id) => navigate(`/anime/${id}`)}
                            onSchedule={() => navigate("/schedule")}
                            onSearch={() => navigate("/search")}
                        />

                        {viewMode === "stats" ? (
                            <StatsView
                                history={history}
                                items={items}
                                onOpen={(id) => navigate(`/anime/${id}`)}
                                serverStats={trackingStats}
                                stats={stats}
                            />
                        ) : (
                            <div
                                className={
                                    viewMode === "list"
                                        ? "dashList"
                                        : "dashGrid"
                                }
                            >
                                {filtered.map((item) => (
                                    <TrackedCard
                                        key={item.id}
                                        isSelected={selectedIds.has(
                                            item.aniListId,
                                        )}
                                        item={item}
                                        mode={viewMode}
                                        onOpen={() =>
                                            navigate(`/anime/${item.aniListId}`)
                                        }
                                        onPatch={(patch) =>
                                            patchTracked(item.aniListId, patch)
                                        }
                                        onSelect={() =>
                                            toggleSelected(item.aniListId)
                                        }
                                        onUntrack={() =>
                                            untrack(item.aniListId)
                                        }
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
                                        setListFilter("All");
                                        setTagFilter("All");
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

function Segmented({
    value,
    onChange,
}: {
    value: ViewMode;
    onChange: (value: ViewMode) => void;
}) {
    return (
        <div className="dashSegmented" aria-label="Dashboard view">
            {(["grid", "list", "stats"] as ViewMode[]).map((mode) => (
                <button
                    key={mode}
                    className={value === mode ? "isActive" : ""}
                    onClick={() => onChange(mode)}
                >
                    {mode === "grid"
                        ? "Grid"
                        : mode === "list"
                          ? "Compact"
                          : "Stats"}
                </button>
            ))}
        </div>
    );
}

function DashboardSections({
    sections,
    watchNext,
    watchNextLoading,
    onOpen,
    onSchedule,
    onSearch,
}: {
    sections: {
        recentlyTracked: TrackedShow[];
        continueWatching: TrackedShow[];
        favorites: TrackedShow[];
    };
    watchNext: ScheduleItem[];
    watchNextLoading: boolean;
    onOpen: (aniListId: number) => void;
    onSchedule: () => void;
    onSearch: () => void;
}) {
    return (
        <div className="dashSectionGrid">
            <MiniSection
                title="Continue watching"
                items={sections.continueWatching}
                onOpen={onOpen}
                onEmptyAction={onSearch}
            />
            <section className="dashMiniSection dashPanel">
                <div className="dashMiniTitle">Watch next</div>
                {watchNextLoading ? (
                    <SkeletonBlock rows={3} />
                ) : watchNext.length === 0 ? (
                    <EmptyState
                        actionLabel="Open schedule"
                        message="No unwatched tracked episodes are scheduled soon."
                        onAction={onSchedule}
                        title="Queue is clear"
                    />
                ) : (
                    watchNext.slice(0, 5).map((item) => (
                        <button
                            key={`${item.aniListId}-${item.episode}`}
                            className="dashMiniItem"
                            onClick={() => onOpen(item.aniListId)}
                        >
                            <span>{titleForSchedule(item)}</span>
                            <b>
                                EP {item.episode} · {formatScheduleDate(item)}
                            </b>
                        </button>
                    ))
                )}
            </section>
            <MiniSection
                title="Recently tracked"
                items={sections.recentlyTracked}
                onOpen={onOpen}
                onEmptyAction={onSearch}
            />
            <MiniSection
                title="Favorites"
                items={sections.favorites}
                onOpen={onOpen}
                onEmptyAction={onSearch}
            />
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
                    <button
                        key={item.id}
                        className="dashMiniItem"
                        onClick={() => onOpen(item.aniListId)}
                    >
                        <span>{item.title}</span>
                        <b>
                            {item.nextEpisode
                                ? `EP ${item.nextEpisode}`
                                : statusLabels[item.trackingStatus]}
                        </b>
                    </button>
                ))
            )}
        </section>
    );
}

function TrackedCard({
    isSelected,
    item,
    mode,
    onOpen,
    onPatch,
    onSelect,
    onUntrack,
}: {
    isSelected: boolean;
    item: TrackedShow;
    mode: ViewMode;
    onOpen: () => void;
    onPatch: (patch: Partial<TrackedShow>) => void;
    onSelect: () => void;
    onUntrack: () => void;
}) {
    const progressMax = item.episodes ?? 9999;

    return (
        <article
            className={mode === "list" ? "dashCard dashCardList" : "dashCard"}
        >
            <button
                className="dashOpenArea"
                onClick={onOpen}
                title="Open details"
            >
                <div
                    className="dashCover"
                    style={{
                        backgroundImage: item.coverImageUrl
                            ? `url(${item.coverImageUrl})`
                            : undefined,
                    }}
                >
                    {!item.coverImageUrl && <CoverFallback />}
                </div>
            </button>

            <div className="dashCardBody">
                <div className="dashCardTop">
                    <label className="dashSelectCheck">
                        <input
                            checked={isSelected}
                            onChange={onSelect}
                            type="checkbox"
                        />
                        <span>Select</span>
                    </label>
                    <button className="dashTitleButton" onClick={onOpen}>
                        {item.title}
                    </button>
                    <button
                        className={
                            "dashIconBtn" +
                            (item.isFavorite ? " isFavorite" : "")
                        }
                        onClick={() =>
                            onPatch({ isFavorite: !item.isFavorite })
                        }
                        title={item.isFavorite ? "Remove favorite" : "Favorite"}
                    >
                        <StarIcon size={18} />
                    </button>
                </div>

                <div className="dashMeta">
                    {item.format ?? "—"} • {item.status ?? "—"}
                    {typeof item.episodes === "number"
                        ? ` • ${item.episodes} eps`
                        : ""}
                </div>

                <div className="dashFieldGrid">
                    <label>
                        Status
                        <select
                            value={item.trackingStatus}
                            onChange={(e) =>
                                onPatch({
                                    trackingStatus: e.target
                                        .value as TrackingStatus,
                                })
                            }
                        >
                            {trackingStatuses.map((status) => (
                                <option key={status} value={status}>
                                    {statusLabels[status]}
                                </option>
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
                            onChange={(e) =>
                                onPatch({
                                    episodeProgress: Number(e.target.value),
                                })
                            }
                        />
                    </label>

                    <label>
                        Rating
                        <input
                            type="number"
                            min={0}
                            max={10}
                            value={item.personalRating ?? ""}
                            onChange={(e) =>
                                onPatch({
                                    personalRating:
                                        e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                })
                            }
                        />
                    </label>

                    <label>
                        Rewatches
                        <input
                            type="number"
                            min={0}
                            value={item.rewatchCount}
                            onChange={(e) =>
                                onPatch({
                                    rewatchCount: Number(e.target.value),
                                })
                            }
                        />
                    </label>

                    <label>
                        List
                        <input
                            defaultValue={item.customListName ?? ""}
                            maxLength={80}
                            onBlur={(e) =>
                                onPatch({
                                    customListName:
                                        e.currentTarget.value.trim() || null,
                                })
                            }
                            placeholder="Favorites, backlog"
                        />
                    </label>

                    <label>
                        Tags
                        <input
                            defaultValue={item.userTags.join(", ")}
                            maxLength={500}
                            onBlur={(e) =>
                                onPatch({
                                    userTags: parseTagInput(
                                        e.currentTarget.value,
                                    ),
                                })
                            }
                            placeholder="cozy, hype"
                        />
                    </label>

                    <label>
                        Started
                        <input
                            type="date"
                            value={item.startedOn ?? ""}
                            onChange={(e) =>
                                onPatch({ startedOn: e.target.value || null })
                            }
                        />
                    </label>

                    <label>
                        Finished
                        <input
                            type="date"
                            value={item.completedOn ?? ""}
                            onChange={(e) =>
                                onPatch({ completedOn: e.target.value || null })
                            }
                        />
                    </label>
                </div>

                <label className="dashTextField">
                    Notes
                    <textarea
                        key={`notes-${item.id}`}
                        defaultValue={item.notes ?? ""}
                        onBlur={(e) =>
                            onPatch({ notes: e.currentTarget.value })
                        }
                    />
                </label>

                <label className="dashTextField">
                    Review
                    <textarea
                        key={`review-${item.id}`}
                        defaultValue={item.review ?? ""}
                        onBlur={(e) =>
                            onPatch({ review: e.currentTarget.value })
                        }
                    />
                </label>

                <div className="dashRow">
                    <span className="dashSmall">
                        AniList: {item.averageScore ?? "—"}
                    </span>
                    <span className="dashSmall">
                        Pop: {item.popularity ?? "—"}
                    </span>
                    <span className="dashSmall">
                        Next: {item.nextEpisode ?? "—"}
                    </span>
                </div>

                <div className="dashCardActions">
                    <button className="dashPillBtn" onClick={onOpen}>
                        Details
                    </button>
                    <button className="dashDangerBtn" onClick={onUntrack}>
                        <TrashIcon size={16} /> Untrack
                    </button>
                </div>
            </div>
        </article>
    );
}

function StatsView({
    history,
    items,
    onOpen,
    serverStats,
    stats,
}: {
    history: TrackedShowHistory[];
    items: TrackedShow[];
    onOpen: (aniListId: number) => void;
    serverStats: TrackedStats | null;
    stats: {
        trackedCount: number;
        favorites: number;
        avgPersonal: number | null;
        avgAniList: number | null;
        episodesWatched: number;
    };
}) {
    const statusCounts =
        serverStats?.statusCounts ??
        trackingStatuses.map((status) => ({
            label: statusLabels[status],
            count: items.filter((item) => item.trackingStatus === status)
                .length,
        }));
    const ratingDistribution =
        serverStats?.ratingDistribution ?? buildRatingDistribution(items);
    const genreTrends = serverStats?.genreTrends ?? buildGenreTrends(items);
    const yearlyCompletions =
        serverStats?.yearlyCompletions ?? buildYearlyCompletions(items);
    const hoursWatched =
        serverStats?.hoursWatched ??
        Math.round((stats.episodesWatched * 24) / 6) / 10;

    return (
        <div className="dashStatsPanel dashPanel">
            <div className="dashStatsBig">
                <Stat
                    label="Tracked"
                    value={serverStats?.trackedCount ?? stats.trackedCount}
                />
                <Stat
                    label="Favorites"
                    value={serverStats?.favorites ?? stats.favorites}
                />
                <Stat
                    label="Episodes watched"
                    value={
                        serverStats?.episodesWatched ?? stats.episodesWatched
                    }
                />
                <Stat label="Time watched" value={`${hoursWatched}h`} />
                <Stat
                    label="My avg rating"
                    value={
                        serverStats?.averagePersonalRating ??
                        stats.avgPersonal ??
                        "—"
                    }
                />
                <Stat
                    label="AniList avg"
                    value={
                        serverStats?.averageAniListScore ??
                        stats.avgAniList ??
                        "—"
                    }
                />
            </div>

            <div className="dashStatsGrid">
                <BucketBars buckets={statusCounts} title="Status mix" />
                <BucketBars
                    buckets={ratingDistribution}
                    title="Rating distribution"
                />
                <BucketBars buckets={genreTrends} title="Genre trends" />
                <BucketBars
                    buckets={yearlyCompletions}
                    title="Yearly completions"
                    emptyLabel="No completion dates yet"
                />
            </div>

            <div className="dashTimeline">
                <div className="dashMiniTitle">Tracking timeline</div>
                {history.length === 0 ? (
                    <EmptyState
                        message="Episode completions and status changes will appear here."
                        title="No timeline yet"
                    />
                ) : (
                    history.slice(0, 18).map((event) => (
                        <button
                            className="dashTimelineItem"
                            key={event.id}
                            onClick={() => onOpen(event.aniListId)}
                            type="button"
                        >
                            <span>{eventLabel(event)}</span>
                            <b>{event.title}</b>
                            <small>
                                {new Date(
                                    event.createdUtc,
                                ).toLocaleDateString()}
                            </small>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

function BucketBars({
    buckets,
    emptyLabel = "No data yet",
    title,
}: {
    buckets: CountBucket[];
    emptyLabel?: string;
    title: string;
}) {
    const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

    return (
        <div className="dashBucketPanel">
            <div className="dashMiniTitle">{title}</div>
            {buckets.length === 0 ? (
                <div className="dashMiniEmpty">{emptyLabel}</div>
            ) : (
                buckets.map((bucket) => (
                    <div key={bucket.label} className="dashStatusBar">
                        <span>{bucket.label}</span>
                        <div>
                            <i
                                style={{
                                    width: `${(bucket.count / max) * 100}%`,
                                }}
                            />
                        </div>
                        <b>{bucket.count}</b>
                    </div>
                ))
            )}
        </div>
    );
}

function buildRatingDistribution(items: TrackedShow[]): CountBucket[] {
    return Array.from({ length: 11 }, (_, rating) => ({
        label: String(rating),
        count: items.filter((item) => item.personalRating === rating).length,
    })).filter((bucket) => bucket.count > 0);
}

function buildGenreTrends(items: TrackedShow[]): CountBucket[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        for (const genre of item.genres)
            counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([label, count]) => ({ label, count }));
}

function buildYearlyCompletions(items: TrackedShow[]): CountBucket[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        if (!item.completedOn) continue;
        const year = item.completedOn.slice(0, 4);
        counts.set(year, (counts.get(year) ?? 0) + 1);
    }

    return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, count]) => ({ label, count }));
}

function eventLabel(event: TrackedShowHistory) {
    if (event.eventType === "episode_completed")
        return `Completed EP ${event.episodeNumber ?? event.toValue}`;
    if (event.eventType === "episode_progress")
        return `Progress ${event.fromValue} to ${event.toValue}`;
    if (event.eventType === "status_changed")
        return `${event.fromValue} to ${event.toValue}`;
    if (event.eventType === "favorite_changed")
        return event.toValue === "True" ? "Favorited" : "Unfavorited";
    if (event.eventType === "deleted") return "Removed from tracking";
    if (event.eventType === "tracked") return "Started tracking";
    return event.eventType;
}

function nextEpisodeSort(item: TrackedShow) {
    if (!item.nextEpisode) return Number.MAX_SAFE_INTEGER;
    return item.nextEpisode;
}

function parseTagInput(value: string) {
    return value
        .split(",")
        .map((item) => item.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
        .slice(0, 20);
}

function parseImportPayload(file: File, text: string) {
    const fileName = file.name.toLowerCase();
    const trimmed = text.trimStart();

    if (fileName.endsWith(".csv")) return parseTrackedCsv(text);
    if (fileName.endsWith(".xml") || trimmed.startsWith("<"))
        return parseMalXml(text);
    return JSON.parse(text);
}

function parseMalXml(text: string) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) {
        throw new Error("Import XML could not be parsed.");
    }

    return Array.from(doc.getElementsByTagName("anime")).map((anime) => ({
        malId: Number(xmlText(anime, "series_animedb_id")),
        title: xmlText(anime, "series_title"),
        trackingStatus: normalizeImportStatus(xmlText(anime, "my_status")),
        episodeProgress: numberOrNull(xmlText(anime, "my_watched_episodes")),
        episodes: numberOrNull(xmlText(anime, "series_episodes")),
        personalRating: normalizeImportedRating(
            numberOrNull(xmlText(anime, "my_score")),
        ),
        rewatchCount: numberOrNull(xmlText(anime, "my_times_watched")),
        startedOn: xmlText(anime, "my_start_date") || null,
        completedOn: xmlText(anime, "my_finish_date") || null,
        format: xmlText(anime, "series_type") || null,
        status: xmlText(anime, "series_status") || null,
        notes: xmlText(anime, "my_comments") || null,
    }));
}

function xmlText(parent: Element, tagName: string) {
    return parent.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? "";
}

function parseTrackedCsv(text: string) {
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(headerLine).map(normalizeImportHeader);

    return lines.map((line) => {
        const cells = parseCsvLine(line);
        const row = Object.fromEntries(
            headers.map((header, i) => [header, cells[i] ?? ""]),
        );
        const rawStatus = pick(
            row,
            "trackingstatus",
            "status",
            "my_status",
            "list_status",
        );
        const aniListId = numberOrNull(
            pick(row, "anilistid", "ani_list_id", "mediaid"),
        );
        const malId = numberOrNull(pick(row, "malid", "series_animedb_id"));

        return {
            aniListId: aniListId ?? undefined,
            malId: malId ?? undefined,
            title: pick(row, "title", "series_title", "anime_title", "name"),
            trackingStatus: normalizeImportStatus(rawStatus),
            episodeProgress: numberOrNull(
                pick(
                    row,
                    "episodeprogress",
                    "progress",
                    "my_watched_episodes",
                    "watched_episodes",
                ),
            ),
            episodes: numberOrNull(pick(row, "episodes", "series_episodes")),
            personalRating: normalizeImportedRating(
                numberOrNull(pick(row, "personalrating", "score", "my_score")),
            ),
            isFavorite: booleanOrUndefined(pick(row, "isfavorite", "favorite")),
            rewatchCount: numberOrNull(
                pick(row, "rewatchcount", "my_times_watched"),
            ),
            startedOn:
                pick(row, "startedon", "started_at", "my_start_date") || null,
            completedOn:
                pick(row, "completedon", "completed_at", "my_finish_date") ||
                null,
            format: pick(row, "format", "series_type") || null,
            status: pick(row, "mediastatus") || null,
            season: pick(row, "season") || null,
            seasonYear: numberOrNull(pick(row, "seasonyear")),
            averageScore: numberOrNull(pick(row, "averagescore")),
            popularity: numberOrNull(pick(row, "popularity")),
            genres: splitImportList(pick(row, "genres")),
            customListName: pick(row, "customlistname", "listname") || null,
            userTags: splitImportList(pick(row, "usertags", "tags")),
            notes: pick(row, "notes", "my_comments") || null,
            review: pick(row, "review") || null,
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
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function normalizeImportHeader(value: string) {
    return value
        .trim()
        .replace(/^\uFEFF/, "")
        .replace(/[^a-zA-Z0-9_]/g, "")
        .toLowerCase();
}

function pick(row: Record<string, string>, ...keys: string[]) {
    for (const key of keys) {
        const value = row[key];
        if (value != null && value.trim() !== "") return value.trim();
    }
    return "";
}

function splitImportList(value: string) {
    return value
        ? value
              .split(/[|,;]/)
              .map((item) => item.trim())
              .filter(Boolean)
        : [];
}

function booleanOrUndefined(value: string) {
    if (!value) return undefined;
    return value.trim().toLowerCase() === "true";
}

function normalizeImportStatus(value: string): TrackingStatus {
    const normalized = value.trim().toUpperCase();
    if (normalized === "CURRENT" || normalized === "WATCHING")
        return "Watching";
    if (normalized === "COMPLETED") return "Completed";
    if (
        normalized === "PAUSED" ||
        normalized === "ON-HOLD" ||
        normalized === "ON_HOLD"
    )
        return "Paused";
    if (normalized === "DROPPED") return "Dropped";
    if (
        normalized === "PLANNING" ||
        normalized === "PLAN TO WATCH" ||
        normalized === "PLAN_TO_WATCH"
    )
        return "PlanToWatch";
    return "PlanToWatch";
}

function normalizeImportedRating(value: number | null) {
    if (value == null || Number.isNaN(value)) return null;
    return value > 10
        ? Math.min(10, Math.round(value / 10))
        : Math.min(10, Math.max(0, value));
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
