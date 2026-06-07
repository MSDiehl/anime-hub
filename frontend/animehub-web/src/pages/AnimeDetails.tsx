import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiClientError, apiGet, apiSend, toPagedResult } from "../api/client";
import AppNav from "../components/AppNav";
import { CoverFallback, EmptyState, SkeletonBlock, useConfirm, useToast } from "../components/Feedback";
import { PlusIcon, SendIcon, StarIcon, TrashIcon } from "../components/Icons";
import { getErrorMessage } from "../utils/apiError";
import { sanitizeAniListHtml } from "../utils/sanitizeAniListHtml";
import AnimeOverviewPanel from "./anime-details/AnimeOverviewPanel";
import AnimeRelationsPanel from "./anime-details/AnimeRelationsPanel";
import AnimeTrendsPanel from "./anime-details/AnimeTrendsPanel";
import "./AnimeDetails.css";

type RelatedSeason = {
  aniListId: number;
  title: string;
  relationType?: string | null;
  format?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
  averageScore?: number | null;
  popularity?: number | null;
  coverImageUrl?: string | null;
};

type NextAiringEpisode = {
  episode: number;
  airingAt: number;
  timeUntilAiring?: number | null;
};

type Trailer = {
  id: string;
  site?: string | null;
  thumbnailUrl?: string | null;
  url?: string | null;
  embedUrl?: string | null;
};

type Studio = {
  aniListId: number;
  name: string;
  siteUrl?: string | null;
};

type ExternalLink = {
  aniListId: number;
  site: string;
  url: string;
  type?: string | null;
  color?: string | null;
  iconUrl?: string | null;
};

type Character = {
  aniListId: number;
  name: string;
  imageUrl?: string | null;
  role?: string | null;
  voiceActorName?: string | null;
  voiceActorImageUrl?: string | null;
};

type StaffMember = {
  aniListId: number;
  name: string;
  imageUrl?: string | null;
  role?: string | null;
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
  source?: string | null;
  siteUrl?: string | null;
  nextAiringEpisode?: NextAiringEpisode | null;
  trailer?: Trailer | null;
  studios?: Studio[];
  externalLinks?: ExternalLink[];
  characters?: Character[];
  staff?: StaffMember[];
  relatedSeasons?: RelatedSeason[];
};

type TrackingStatus =
  | "Watching"
  | "Completed"
  | "Paused"
  | "Dropped"
  | "PlanToWatch";

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
  genres: string[];
  trackingStatus: TrackingStatus;
  episodeProgress: number;
  nextEpisode?: number | null;
  personalRating?: number | null;
  isFavorite: boolean;
  notes?: string | null;
  review?: string | null;
  customListName?: string | null;
  userTags: string[];
  rewatchCount: number;
  startedOn?: string | null;
  completedOn?: string | null;
  createdUtc: string;
  updatedUtc?: string | null;
};

const trackingStatuses: TrackingStatus[] = [
  "Watching",
  "Completed",
  "Paused",
  "Dropped",
  "PlanToWatch",
];

const trackingStatusLabels: Record<TrackingStatus, string> = {
  Watching: "Watching",
  Completed: "Completed",
  Paused: "Paused",
  Dropped: "Dropped",
  PlanToWatch: "Plan to Watch",
};

function humanizeEnum(value?: string | null) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAiringTime(value?: number | null) {
  if (!value) return "—";
  return new Date(value * 1000).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortTitle(value: string) {
  return value.length > 16 ? `${value.slice(0, 15)}...` : value;
}

function parseTagInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

type ThreadSummary = {
  id: string;
  aniListId: number;
  episodeNumber?: number | null;
  title: string;
  createdUtc: string;
  authorDisplayName: string;
  commentCount: number;
};

type ThreadPage = {
  items: ThreadSummary[];
};

type CommentDto = {
  id: string;
  threadId: string;
  body: string;
  createdUtc: string;
  authorDisplayName: string;
};

type ThreadDetail = {
  id: string;
  aniListId: number;
  episodeNumber?: number | null;
  title: string;
  body: string;
  createdUtc: string;
  authorDisplayName: string;
  comments: CommentDto[];
};

type Props = { onLogout: () => void | Promise<void> };

export default function AnimeDetails({ onLogout }: Props) {
  const nav = useNavigate();
  const { aniListId } = useParams();
  const { confirm } = useConfirm();
  const { pushToast } = useToast();
  const routeId = Number(aniListId);

  // allows “switch season without page reload”
  const [activeId, setActiveId] = useState(routeId);

  const [data, setData] = useState<AnimeDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsReloadKey, setDetailsReloadKey] = useState(0);
  const [trackedShow, setTrackedShow] = useState<TrackedShow | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // discussion state
  const [discEpisode, setDiscEpisode] = useState<number | null>(null); // null = general
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsErr, setThreadsErr] = useState<string | null>(null);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadErr, setThreadErr] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [postingThread, setPostingThread] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [spoilerSafe, setSpoilerSafe] = useState(true);
  const [threadSpoilersRevealed, setThreadSpoilersRevealed] = useState(false);

  useEffect(() => setActiveId(routeId), [routeId]);

  // reset discussion when anime switches
  useEffect(() => {
    setDiscEpisode(null);
    setSelectedThreadId(null);
    setThread(null);
    setThreads([]);
    setThreadsErr(null);
    setThreadErr(null);
  }, [activeId]);

  const chartData = useMemo(() => {
    if (!data) return [];

    return [
      {
        t: shortTitle(data.title),
        score: data.averageScore ?? null,
        pop: data.popularity ?? null,
      },
      ...(data.relatedSeasons ?? []).map((item) => ({
        t: shortTitle(item.title),
        score: item.averageScore ?? null,
        pop: item.popularity ?? null,
      })),
    ].filter((item) => item.score !== null || item.pop !== null);
  }, [data]);

  const sanitizedDescription = useMemo(
    () => sanitizeAniListHtml(data?.description),
    [data?.description],
  );

  // v1 episodes: generate from episode count
  const episodes = useMemo(() => {
    const n = data?.episodes ?? 0;
    if (!n || n <= 0) return [];
    return Array.from({ length: n }).map((_, i) => ({
      num: i + 1,
      arc: null as string | null,
      isFiller: false,
    }));
  }, [data?.episodes]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setDetailsError(null);
      setData(null);

      try {
        const json = await apiGet<AnimeDetailsDto>(`/api/anime/${activeId}`);
        if (!cancelled) setData(json);
      } catch (e: unknown) {
        if (!cancelled) {
          setDetailsError(getErrorMessage(e, "Failed to load anime details"));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(activeId) && activeId > 0) {
      load();
    } else {
      setLoading(false);
      setData(null);
      setDetailsError("Invalid anime id.");
    }

    return () => {
      cancelled = true;
    };
  }, [activeId, detailsReloadKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrackedShow() {
      setTrackingLoading(true);
      setTrackingError(null);
      setTrackedShow(null);

      try {
        const json = await apiGet<TrackedShow>(`/api/tracked/${activeId}`);
        if (!cancelled) setTrackedShow(json);
      } catch (e: unknown) {
        if (e instanceof ApiClientError && e.status === 404) {
          if (!cancelled) setTrackedShow(null);
          return;
        }

        if (!cancelled) {
          setTrackingError(
            getErrorMessage(e, "Failed to load tracking details"),
          );
          setTrackedShow(null);
        }
      } finally {
        if (!cancelled) setTrackingLoading(false);
      }
    }

    if (Number.isFinite(activeId) && activeId > 0) {
      loadTrackedShow();
    } else {
      setTrackedShow(null);
      setTrackingLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  function dateOrNull(value: string) {
    return value ? value : null;
  }

  function numberOrNull(value: string) {
    return value === "" ? null : Number(value);
  }

  function trackingPayload(overrides: Partial<TrackedShow> = {}) {
    if (!data) return null;

    return {
      aniListId: data.aniListId,
      title: data.title,
      coverImageUrl: data.coverImageUrl,
      format: data.format,
      status: data.status,
      episodes: data.episodes,
      season: data.season,
      seasonYear: data.seasonYear,
      averageScore: data.averageScore,
      popularity: data.popularity,
      genres: data.genres ?? [],
      trackingStatus: "PlanToWatch",
      ...overrides,
    };
  }

  function optimisticTrackedShow(overrides: Partial<TrackedShow> = {}) {
    const payload = trackingPayload(overrides);
    if (!payload) return null;

    return {
      id: `optimistic-${activeId}`,
      aniListId: payload.aniListId,
      title: payload.title,
      coverImageUrl: payload.coverImageUrl,
      format: payload.format,
      status: payload.status,
      episodes: payload.episodes,
      season: payload.season,
      seasonYear: payload.seasonYear,
      averageScore: payload.averageScore,
      popularity: payload.popularity,
      genres: payload.genres ?? [],
      episodeProgress: overrides.episodeProgress ?? 0,
      nextEpisode: null,
      personalRating: null,
      isFavorite: overrides.isFavorite ?? false,
      notes: null,
      review: null,
      customListName: null,
      userTags: [],
      rewatchCount: 0,
      startedOn: null,
      completedOn: null,
      createdUtc: new Date().toISOString(),
      updatedUtc: null,
      ...overrides,
      trackingStatus: (overrides.trackingStatus ?? payload.trackingStatus) as TrackingStatus,
    } as TrackedShow;
  }

  async function trackCurrent(overrides: Partial<TrackedShow> = {}) {
    const payload = trackingPayload(overrides);
    if (!payload) return;

    const previousTrackedShow = trackedShow;
    const optimistic = optimisticTrackedShow(overrides);
    setTrackingSaving(true);
    setTrackingError(null);
    if (optimistic) setTrackedShow(optimistic);

    try {
      setTrackedShow(await apiSend<TrackedShow>("/api/tracked", "POST", payload));
      pushToast("Show tracked.", "success");
    } catch (e: unknown) {
      if (e instanceof ApiClientError && e.status === 409) {
        try {
          setTrackedShow(await apiGet<TrackedShow>(`/api/tracked/${activeId}`));
        } catch {
          setTrackedShow(previousTrackedShow);
        }
        pushToast("Show is already tracked.", "info");
        return;
      }

      const message = getErrorMessage(e, "Failed to track show");
      setTrackedShow(previousTrackedShow);
      setTrackingError(message);
      pushToast(message, "error");
    } finally {
      setTrackingSaving(false);
    }
  }

  async function patchTrackedShow(patch: Partial<TrackedShow>) {
    if (!trackedShow) {
      await trackCurrent(patch);
      return;
    }

    setTrackingSaving(true);
    setTrackingError(null);
    const previousTrackedShow = trackedShow;
    setTrackedShow({ ...trackedShow, ...patch });

    try {
      setTrackedShow(await apiSend<TrackedShow>(`/api/tracked/${activeId}`, "PATCH", patch));
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to update show");
      setTrackedShow(previousTrackedShow);
      setTrackingError(message);
      pushToast(message, "error");
    } finally {
      setTrackingSaving(false);
    }
  }

  async function untrackCurrent() {
    if (!trackedShow) return;
    const confirmed = await confirm({
      title: "Untrack show?",
      message: "This removes the show from your tracked list.",
      confirmLabel: "Untrack",
      danger: true,
    });
    if (!confirmed) return;

    const previousTrackedShow = trackedShow;
    setTrackingSaving(true);
    setTrackingError(null);
    setTrackedShow(null);

    try {
      await apiSend<void>(`/api/tracked/${activeId}`, "DELETE");

      setTrackedShow(null);
      pushToast("Show untracked.", "success");
    } catch (e: unknown) {
      if (e instanceof ApiClientError && e.status === 404) {
        setTrackedShow(null);
        pushToast("Show untracked.", "success");
        return;
      }

      const message = getErrorMessage(e, "Failed to untrack show");
      setTrackedShow(previousTrackedShow);
      setTrackingError(message);
      pushToast(message, "error");
    } finally {
      setTrackingSaving(false);
    }
  }

  async function loadThreads() {
    setThreadsLoading(true);
    setThreadsErr(null);
    try {
      const epQ = discEpisode ? `?episode=${discEpisode}` : "";
      const json = await apiGet<ThreadPage | ThreadSummary[]>(`/api/discussions/anime/${activeId}${epQ}`);
      setThreads(toPagedResult(json, 1, 25).items);
    } catch (e: unknown) {
      setThreadsErr(getErrorMessage(e, "Failed to load discussions"));
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }

  async function loadThread(threadId: string, showLoading = true) {
    if (showLoading) setThreadLoading(true);
    setThreadErr(null);
    if (showLoading) setThread(null);
    try {
      setThread(await apiGet<ThreadDetail>(`/api/discussions/thread/${threadId}`));
    } catch (e: unknown) {
      setThreadErr(getErrorMessage(e, "Failed to load thread"));
    } finally {
      if (showLoading) setThreadLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(activeId) || activeId <= 0) return;
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, discEpisode]);

  useEffect(() => {
    if (!selectedThreadId) return;
    loadThread(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    setThreadSpoilersRevealed(false);
  }, [selectedThreadId, spoilerSafe]);

  async function createThread() {
    if (!newTitle.trim() || !newBody.trim()) return;

    const title = newTitle.trim();
    const body = newBody.trim();
    const previousThreads = threads;
    const optimisticThread: ThreadSummary = {
      id: `optimistic-${Date.now()}`,
      aniListId: activeId,
      episodeNumber: discEpisode,
      title,
      createdUtc: new Date().toISOString(),
      authorDisplayName: "You",
      commentCount: 0,
    };

    setPostingThread(true);
    setThreadsErr(null);
    setNewTitle("");
    setNewBody("");
    setThreads([optimisticThread, ...threads]);

    try {
      const epQ = discEpisode ? `?episode=${discEpisode}` : "";
      await apiSend<{ id: string }>(
        `/api/discussions/anime/${activeId}${epQ}`,
        "POST",
        { title, body },
      );

      await loadThreads();
      pushToast("Thread posted.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to create thread");
      setThreads(previousThreads);
      setNewTitle(title);
      setNewBody(body);
      setThreadsErr(message);
      pushToast(message, "error");
    } finally {
      setPostingThread(false);
    }
  }

  async function postReply() {
    if (!selectedThreadId || !thread || !replyBody.trim()) return;

    const body = replyBody.trim();
    const previousThread = thread;
    const optimisticComment: CommentDto = {
      id: `optimistic-${Date.now()}`,
      threadId: selectedThreadId,
      body,
      createdUtc: new Date().toISOString(),
      authorDisplayName: "You",
    };

    setPostingReply(true);
    setThreadErr(null);
    setReplyBody("");
    setThread({
      ...thread,
      comments: [...thread.comments, optimisticComment],
    });

    try {
      await apiSend<{ id: string }>(
        `/api/discussions/thread/${selectedThreadId}/comments`,
        "POST",
        { body },
      );

      await loadThread(selectedThreadId, false);
      await loadThreads();
      pushToast("Reply posted.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to post reply");
      setThread(previousThread);
      setReplyBody(body);
      setThreadErr(message);
      pushToast(message, "error");
    } finally {
      setPostingReply(false);
    }
  }

  if (loading)
    return (
      <div className="adPage">
        <div className="adBg" aria-hidden="true">
          <div className="adSpeedLines" />
          <div className="adHalftone" />
          <div className="adInkWash" />
        </div>
        <AppNav onLogout={onLogout} />
        <div className="adLoadingWrap">
          <div className="adLoadingCard mangaPanel">
            <SkeletonBlock rows={6} />
          </div>
        </div>
      </div>
    );

  if (detailsError)
    return (
      <div className="adPage">
        <div className="adBg" aria-hidden="true">
          <div className="adSpeedLines" />
          <div className="adHalftone" />
          <div className="adInkWash" />
        </div>
        <AppNav onLogout={onLogout} />
        <div className="adLoadingWrap">
          <div className="adLoadingCard mangaPanel">
            <EmptyState
              actionLabel="Retry"
              message={detailsError}
              onAction={() => setDetailsReloadKey((value) => value + 1)}
              title="Could not load anime details"
            />
          </div>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="adPage">
        <div className="adBg" aria-hidden="true">
          <div className="adSpeedLines" />
          <div className="adHalftone" />
          <div className="adInkWash" />
        </div>
        <AppNav onLogout={onLogout} />
        <div className="adLoadingWrap">
          <div className="adLoadingCard mangaPanel">
            <EmptyState
              actionLabel="Back to search"
              message="This anime could not be found."
              onAction={() => nav("/search")}
              title="Not found"
            />
          </div>
        </div>
      </div>
    );

  const relations = (data.relatedSeasons ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.seasonYear ?? 9999) - (b.seasonYear ?? 9999) ||
        (a.season ?? "").localeCompare(b.season ?? "") ||
        a.title.localeCompare(b.title),
    );
  const isTracked = trackedShow !== null;
  const currentProgress = trackedShow?.episodeProgress ?? 0;
  const maxEpisodes = data.episodes && data.episodes > 0 ? data.episodes : undefined;
  const nextAiring = data.nextAiringEpisode;

  return (
    <div className="adPage">
      <div className="adBg" aria-hidden="true">
        <div className="adSpeedLines" />
        <div className="adHalftone" />
        <div className="adInkWash" />
      </div>

      <AppNav onLogout={onLogout} />

      <div className="adHero">
        <div
          className="adBanner"
          style={{
            backgroundImage: data.bannerImageUrl
              ? `url(${data.bannerImageUrl})`
              : undefined,
          }}
        >
          {!data.bannerImageUrl && <CoverFallback label="No banner" />}
        </div>
        <div className="adHeroOverlay" />
        <div className="adHeroInner">
          <div
            className="adCover"
            style={{
              backgroundImage: data.coverImageUrl
                ? `url(${data.coverImageUrl})`
                : undefined,
            }}
          >
            {!data.coverImageUrl && <CoverFallback label="No cover" />}
          </div>

          <div className="adHeroText mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              TITLE CARD
            </div>

            <h1 className="adH1">{data.title}</h1>

            <div className="adMetaRow">
              <span className="adChip">{data.format ?? "—"}</span>
              <span className="adChip">{data.status ?? "—"}</span>
              {typeof data.episodes === "number" && (
                <span className="adChip">{data.episodes} eps</span>
              )}
              {(data.season || data.seasonYear) && (
                <span className="adChip">
                  {data.season ?? ""} {data.seasonYear ?? ""}
                </span>
              )}
              {data.source && (
                <span className="adChip">{humanizeEnum(data.source)}</span>
              )}
            </div>

            <div className="adStatRow">
              <div className="adStat">
                <div className="adStatLabel">Score</div>
                <div className="adStatValue">{data.averageScore ?? "—"}</div>
              </div>
              <div className="adStat">
                <div className="adStatLabel">Popularity</div>
                <div className="adStatValue">{data.popularity ?? "—"}</div>
              </div>
              <div className="adStat adWideStat">
                <div className="adStatLabel">Next Airing</div>
                <div className="adStatValue">
                  {nextAiring
                    ? `EP ${nextAiring.episode} ${formatAiringTime(nextAiring.airingAt)}`
                    : "—"}
                </div>
              </div>
            </div>

            {data.genres?.length ? (
              <div className="adGenreRow">
                {data.genres.slice(0, 8).map((g) => (
                  <span key={g} className="adGenre">
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <AnimeRelationsPanel
            activeAniListId={data.aniListId}
            relations={relations}
            onSelect={setActiveId}
          />
        </div>
      </div>

      <main className="adMain">
        <section className="adPanel adTrackingPanel mangaPanel">
          <div className="adPanelTag" aria-hidden="true">
            My List
          </div>

          <div className="adTrackingTop">
            <div>
              <h2 className="adH2 adH2NoMargin">
                {isTracked
                  ? trackingStatusLabels[trackedShow.trackingStatus]
                  : "Not tracked"}
              </h2>
              <div className="adTrackingMeta">
                {trackingLoading
                  ? <SkeletonBlock rows={1} />
                  : isTracked
                    ? `Episode ${currentProgress}${maxEpisodes ? ` / ${maxEpisodes}` : ""}`
                    : "Add it to your list to save progress, rating, notes, and dates."}
              </div>
            </div>

            <div className="adTrackingActions">
              {isTracked ? (
                <button
                  className="adPillBtn adDangerBtn"
                  onClick={untrackCurrent}
                  disabled={trackingSaving}
                >
                  {trackingSaving ? "Saving" : <><TrashIcon size={16} /> Untrack</>}
                </button>
              ) : (
                <button
                  className="adPillBtn adPrimaryBtn"
                  onClick={() => trackCurrent()}
                  disabled={trackingSaving || trackingLoading}
                >
                  {trackingSaving ? "Saving" : <><PlusIcon size={16} /> Track</>}
                </button>
              )}

              <button
                className={[
                  "adPillBtn",
                  trackedShow?.isFavorite ? "adFavoriteBtn isActive" : "adFavoriteBtn",
                ].join(" ")}
                onClick={() =>
                  patchTrackedShow({ isFavorite: !(trackedShow?.isFavorite ?? false) })
                }
                disabled={trackingSaving || trackingLoading}
              >
                <StarIcon size={16} /> {trackedShow?.isFavorite ? "Favorited" : "Favorite"}
              </button>
            </div>
          </div>

          {trackingError && (
            <div className="adInlineError adTrackingError">
              <b>WHAM!</b> {trackingError}
            </div>
          )}

          <div className="adTrackingGrid">
            <label className="adTrackingField">
              Status
              <select
                value={trackedShow?.trackingStatus ?? "PlanToWatch"}
                onChange={(e) =>
                  patchTrackedShow({
                    trackingStatus: e.target.value as TrackingStatus,
                  })
                }
                disabled={!isTracked || trackingSaving}
              >
                {trackingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {trackingStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="adTrackingField">
              Episodes
              <input
                type="number"
                min={0}
                max={maxEpisodes}
                value={currentProgress}
                onChange={(e) =>
                  patchTrackedShow({
                    episodeProgress: Math.max(0, Number(e.target.value || 0)),
                  })
                }
                disabled={!isTracked || trackingSaving}
              />
            </label>

            <label className="adTrackingField">
              Rating
              <select
                value={trackedShow?.personalRating ?? ""}
                onChange={(e) =>
                  patchTrackedShow({
                    personalRating: numberOrNull(e.target.value),
                  })
                }
                disabled={!isTracked || trackingSaving}
              >
                <option value="">No rating</option>
                {Array.from({ length: 11 }, (_, value) => (
                  <option key={value} value={value}>
                    {value}/10
                  </option>
                ))}
              </select>
            </label>

            <label className="adTrackingField">
              Rewatches
              <input
                type="number"
                min={0}
                value={trackedShow?.rewatchCount ?? 0}
                onChange={(e) =>
                  patchTrackedShow({
                    rewatchCount: Math.max(0, Number(e.target.value || 0)),
                  })
                }
                disabled={!isTracked || trackingSaving}
              />
            </label>

            <label className="adTrackingField">
              List
              <input
                key={`list-${trackedShow?.id ?? activeId}`}
                defaultValue={trackedShow?.customListName ?? ""}
                maxLength={80}
                onBlur={(e) =>
                  patchTrackedShow({ customListName: e.currentTarget.value.trim() || null })
                }
                disabled={!isTracked || trackingSaving}
                placeholder="Weekend queue"
              />
            </label>

            <label className="adTrackingField">
              Tags
              <input
                key={`tags-${trackedShow?.id ?? activeId}`}
                defaultValue={trackedShow?.userTags.join(", ") ?? ""}
                maxLength={500}
                onBlur={(e) =>
                  patchTrackedShow({ userTags: parseTagInput(e.currentTarget.value) })
                }
                disabled={!isTracked || trackingSaving}
                placeholder="cozy, rewatch"
              />
            </label>

            <label className="adTrackingField">
              Started
              <input
                type="date"
                value={trackedShow?.startedOn ?? ""}
                onChange={(e) =>
                  patchTrackedShow({ startedOn: dateOrNull(e.target.value) })
                }
                disabled={!isTracked || trackingSaving}
              />
            </label>

            <label className="adTrackingField">
              Finished
              <input
                type="date"
                value={trackedShow?.completedOn ?? ""}
                onChange={(e) =>
                  patchTrackedShow({ completedOn: dateOrNull(e.target.value) })
                }
                disabled={!isTracked || trackingSaving}
              />
            </label>
          </div>

          <div className="adTrackingTextGrid">
            <label className="adTrackingField">
              Notes
              <textarea
                key={`notes-${trackedShow?.id ?? activeId}`}
                defaultValue={trackedShow?.notes ?? ""}
                onBlur={(e) => patchTrackedShow({ notes: e.currentTarget.value })}
                disabled={!isTracked || trackingSaving}
              />
            </label>

            <label className="adTrackingField">
              Review
              <textarea
                key={`review-${trackedShow?.id ?? activeId}`}
                defaultValue={trackedShow?.review ?? ""}
                onBlur={(e) => patchTrackedShow({ review: e.currentTarget.value })}
                disabled={!isTracked || trackingSaving}
              />
            </label>
          </div>
        </section>

        <div className="adGrid">
          <AnimeOverviewPanel sanitizedDescription={sanitizedDescription} />

          <AnimeTrendsPanel data={chartData} />
        </div>

        <div className="adInfoGrid">
          <section className="adPanel adInfoPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Info
            </div>

            <div className="adFactGrid">
              <div className="adFact">
                <span>Source</span>
                <b>{humanizeEnum(data.source)}</b>
              </div>
              <div className="adFact">
                <span>Studios</span>
                <b>
                  {data.studios?.length
                    ? data.studios.map((studio) => studio.name).join(", ")
                    : "—"}
                </b>
              </div>
              <div className="adFact">
                <span>Next airing</span>
                <b>
                  {nextAiring
                    ? `Episode ${nextAiring.episode} • ${formatAiringTime(nextAiring.airingAt)}`
                    : "—"}
                </b>
              </div>
            </div>

            <div className="adExternalLinks">
              {data.siteUrl && (
                <a href={data.siteUrl} target="_blank" rel="noreferrer">
                  AniList
                </a>
              )}
              {data.externalLinks?.slice(0, 8).map((link) => (
                <a
                  key={`${link.aniListId}-${link.site}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  style={link.color ? { borderColor: link.color } : undefined}
                >
                  {link.site}
                </a>
              ))}
            </div>
          </section>

          <section className="adPanel adTrailerPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Trailer
            </div>

            {data.trailer?.embedUrl ? (
              <iframe
                className="adTrailerFrame"
                src={data.trailer.embedUrl}
                title={`${data.title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : data.trailer?.url ? (
              <a
                className="adTrailerLink"
                href={data.trailer.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  backgroundImage: data.trailer.thumbnailUrl
                    ? `url(${data.trailer.thumbnailUrl})`
                    : undefined,
                }}
              >
                Watch trailer
              </a>
            ) : (
              <EmptyState
                message="No trailer is listed for this title yet."
                title="No trailer"
              />
            )}
          </section>
        </div>

        <div className="adPeopleGrid">
          <section className="adPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Characters
            </div>

            <div className="adPeopleList">
              {(data.characters ?? []).length === 0 ? (
                <EmptyState
                  message="Character data is not available for this title yet."
                  title="No characters listed"
                />
              ) : (
                data.characters?.map((character) => (
                  <div key={character.aniListId} className="adPersonCard">
                    <div
                      className="adPersonImage"
                      style={{
                        backgroundImage: character.imageUrl
                          ? `url(${character.imageUrl})`
                          : undefined,
                      }}
                    >
                      {!character.imageUrl && <CoverFallback label="No image" />}
                    </div>
                    <div className="adPersonText">
                      <b>{character.name}</b>
                      <span>{humanizeEnum(character.role)}</span>
                      {character.voiceActorName && (
                        <small>VA: {character.voiceActorName}</small>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="adPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Staff
            </div>

            <div className="adPeopleList">
              {(data.staff ?? []).length === 0 ? (
                <EmptyState
                  message="Staff data is not available for this title yet."
                  title="No staff listed"
                />
              ) : (
                data.staff?.map((member) => (
                  <div key={`${member.aniListId}-${member.role}`} className="adPersonCard">
                    <div
                      className="adPersonImage"
                      style={{
                        backgroundImage: member.imageUrl
                          ? `url(${member.imageUrl})`
                          : undefined,
                      }}
                    >
                      {!member.imageUrl && <CoverFallback label="No image" />}
                    </div>
                    <div className="adPersonText">
                      <b>{member.name}</b>
                      <span>{member.role ?? "Staff"}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="adPanel adEpisodesPanel mangaPanel">
          <div className="adPanelTag" aria-hidden="true">
            Episodes
          </div>

          <div className="adEpisodesHeader">
            <div className="adEpisodesMeta">
              {episodes.length
                ? `${episodes.length} episodes`
                : "No episode count"}
            </div>

            {episodes.length > 0 && (
              <button
                className="adPillBtn"
                onClick={() => {
                  setDiscEpisode(null);
                  const el = document.getElementById("discussion-panel");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Jump to Discussion
              </button>
            )}
          </div>

          {!episodes.length ? (
            <EmptyState
              actionLabel="Open discussion"
              message="AniList did not return an episode count, but general discussion is still available."
              onAction={() => {
                setDiscEpisode(null);
                document.getElementById("discussion-panel")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              title="No episode count"
            />
          ) : (
            <div className="adEpisodeGrid">
              {episodes.map((ep) => {
                const watched = currentProgress >= ep.num;

                return (
                  <div key={ep.num} className="adEpCard">
                    <div className="adEpNum">EP {ep.num}</div>
                    <div className="adEpBadges">
                      {watched && <span className="adBadge">Watched</span>}
                      {ep.isFiller && <span className="adBadge">Filler</span>}
                      {ep.arc && <span className="adBadge">{ep.arc}</span>}
                    </div>

                    <div className="adEpActions">
                      <label className="adEpisodeCheck" title="Save episode progress">
                        <input
                          type="checkbox"
                          checked={watched}
                          disabled={trackingSaving}
                          onChange={(e) =>
                            patchTrackedShow({
                              episodeProgress: e.currentTarget.checked
                                ? ep.num
                                : Math.max(0, ep.num - 1),
                              trackingStatus: "Watching",
                            })
                          }
                        />
                        <span>{watched ? "Watched" : "Watched"}</span>
                      </label>

                      <button
                        className="adDiscussBtn"
                        onClick={() => {
                          setDiscEpisode(ep.num);
                          setSelectedThreadId(null);
                          setThread(null);
                          const el = document.getElementById("discussion-panel");
                          el?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }}
                        title="Open episode discussion"
                      >
                        Discuss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* -----------------------------
            DISCUSSION PANEL
        ------------------------------ */}
        <section
          id="discussion-panel"
          className="adPanel adDiscussionPanel mangaPanel"
        >
          <div className="adPanelTag" aria-hidden="true">
            Discussion
          </div>

          <div className="adDiscussionTop">
            <div className="adDiscussionTitle">
              {discEpisode
                ? `Episode ${discEpisode} threads`
                : "General threads"}
            </div>

            <div className="adDiscussionControls">
              <button
                className={"adScopeBtn" + (!discEpisode ? " isActive" : "")}
                onClick={() => {
                  setDiscEpisode(null);
                  setSelectedThreadId(null);
                  setThread(null);
                }}
              >
                General
              </button>

              <div className="adScopeSep" aria-hidden="true" />

              <label className="adScopeLabel">
                Episode
                <select
                  className="adScopeSelect"
                  value={discEpisode ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDiscEpisode(v === 0 ? null : v);
                    setSelectedThreadId(null);
                    setThread(null);
                  }}
                  disabled={!episodes.length}
                  title={
                    !episodes.length
                      ? "No episodes available"
                      : "Pick an episode"
                  }
                >
                  <option value={0}>—</option>
                  {episodes.slice(0, 200).map((ep) => (
                    <option key={ep.num} value={ep.num}>
                      {ep.num}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className={"adScopeBtn" + (spoilerSafe ? " isActive" : "")}
                onClick={() => setSpoilerSafe((value) => !value)}
              >
                Spoiler-safe
              </button>

              <button
                className="adPillBtn"
                onClick={loadThreads}
                disabled={threadsLoading}
              >
                {threadsLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="adDiscussionGrid">
            {/* Left: thread list + create */}
            <div className="adDiscussionLeft">
              <div className="adCreateThread">
                <div className="adCreateHeader">Start a thread</div>

                <input
                  className="adCreateTitle"
                  placeholder="Title (e.g. “That ending tho…”)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={200}
                />

                <textarea
                  className="adCreateBody"
                  placeholder="Write your post…"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  maxLength={5000}
                />

                {threadsErr && threads.length > 0 && (
                  <div className="adInlineError">
                    <b>WHAM!</b> {threadsErr}
                  </div>
                )}

                <button
                  className="adCreateBtn"
                  onClick={createThread}
                  disabled={
                    postingThread || !newTitle.trim() || !newBody.trim()
                  }
                >
                  {postingThread ? "Posting" : <><SendIcon size={16} /> Post thread</>}
                </button>
              </div>

              <div className="adThreadList">
                <div className="adThreadListHeader">
                  Threads
                  <div className="adThreadListMeta">
                    {threadsLoading ? <SkeletonBlock rows={1} /> : `${threads.length}`}
                  </div>
                </div>

                {threadsLoading ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <div className="adThreadItem adThreadSkeleton" key={index}>
                      <SkeletonBlock rows={2} />
                    </div>
                  ))
                ) : threadsErr && threads.length === 0 ? (
                  <div className="adThreadEmpty">
                    <EmptyState
                      actionLabel="Retry"
                      message={threadsErr}
                      onAction={loadThreads}
                      title="Could not load threads"
                    />
                  </div>
                ) : threads.length === 0 ? (
                  <div className="adThreadEmpty">
                    <EmptyState
                      actionLabel="Start a thread"
                      message="Be the first person to open a conversation for this scope."
                      onAction={() => document.querySelector<HTMLInputElement>(".adCreateTitle")?.focus()}
                      title="No threads yet"
                    />
                  </div>
                ) : (
                  threads.map((t) => {
                    const active = selectedThreadId === t.id;
                    const pending = t.id.startsWith("optimistic-");
                    return (
                      <button
                        key={t.id}
                        className={[
                          "adThreadItem",
                          active ? "isActive" : "",
                          pending ? "isPending" : "",
                        ].join(" ")}
                        disabled={pending}
                        onClick={() => setSelectedThreadId(t.id)}
                        title={t.title}
                      >
                        <div className="adThreadItemTitle">
                          {spoilerSafe && t.episodeNumber
                            ? `Episode ${t.episodeNumber} thread`
                            : t.title}
                        </div>
                        <div className="adThreadItemMeta">
                          <span className="adThreadAuthor">
                            {t.authorDisplayName}
                          </span>
                          <span className="adThreadDot">•</span>
                          <span>{new Date(t.createdUtc).toLocaleString()}</span>
                          <span className="adThreadDot">•</span>
                          <span>{t.commentCount} replies</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: thread view */}
            <div className="adDiscussionRight">
              {!selectedThreadId ? (
                <div className="adThreadPlaceholder">
                  <EmptyState
                    message="Select a thread from the list to read and reply."
                    title="Pick a thread"
                  />
                </div>
              ) : threadLoading ? (
                <div className="adThreadPlaceholder">
                  <SkeletonBlock rows={5} />
                </div>
              ) : threadErr ? (
                <div className="adThreadPlaceholder">
                  <EmptyState
                    actionLabel="Retry"
                    message={threadErr}
                    onAction={() => selectedThreadId && loadThread(selectedThreadId)}
                    title="Could not load thread"
                  />
                </div>
              ) : !thread ? (
                <div className="adThreadPlaceholder">
                  <EmptyState
                    message="This thread may have been deleted."
                    title="Thread not found"
                  />
                </div>
              ) : (
                <div className="adThreadView">
                  <div className="adThreadHeader">
                    <div className="adThreadTitle">
                      {spoilerSafe && thread.episodeNumber && !threadSpoilersRevealed
                        ? `Episode ${thread.episodeNumber} thread`
                        : thread.title}
                    </div>
                    <div className="adThreadSub">
                      <span className="adThreadAuthor">
                        {thread.authorDisplayName}
                      </span>
                      <span className="adThreadDot">•</span>
                      <span>
                        {new Date(thread.createdUtc).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {spoilerSafe && thread.episodeNumber && !threadSpoilersRevealed ? (
                    <div className="adSpoilerGate">
                      <div>Episode spoilers hidden.</div>
                      <button
                        className="adRevealBtn"
                        onClick={() => setThreadSpoilersRevealed(true)}
                      >
                        Reveal thread
                      </button>
                    </div>
                  ) : (
                    <div className="adThreadBody">{thread.body}</div>
                  )}

                  <div className="adRepliesHeader">
                    Replies{" "}
                    <span className="adRepliesCount">
                      {thread.comments.length}
                    </span>
                  </div>

                  <div className="adRepliesList">
                    {spoilerSafe && thread.episodeNumber && !threadSpoilersRevealed ? (
                      <div className="adThreadEmpty">
                        <EmptyState
                          actionLabel="Reveal thread"
                          message="Replies are hidden until you reveal this episode thread."
                          onAction={() => setThreadSpoilersRevealed(true)}
                          title="Replies hidden"
                        />
                      </div>
                    ) : thread.comments.length === 0 ? (
                      <div className="adThreadEmpty">
                        <EmptyState
                          actionLabel="Write a reply"
                          message="Add the first reply to this thread."
                          onAction={() => document.querySelector<HTMLTextAreaElement>(".adReplyInput")?.focus()}
                          title="No replies yet"
                        />
                      </div>
                    ) : (
                      thread.comments.map((c) => (
                        <div key={c.id} className="adReply">
                          <div className="adReplyMeta">
                            <b>{c.authorDisplayName}</b>
                            <span className="adThreadDot">•</span>
                            <span>
                              {new Date(c.createdUtc).toLocaleString()}
                            </span>
                          </div>
                          <div className="adReplyBody">{c.body}</div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="adReplyBox">
                    <textarea
                      className="adReplyInput"
                      placeholder="Write a reply…"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      maxLength={3000}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                          postReply();
                      }}
                    />

                    <button
                      className="adReplyBtn"
                      onClick={postReply}
                      disabled={postingReply || !replyBody.trim()}
                    >
                      {postingReply ? "Posting" : <><SendIcon size={16} /> Reply</>}
                    </button>

                    <div className="adReplyHint">
                      Tip: <span className="adKbd">Ctrl</span> +{" "}
                      <span className="adKbd">Enter</span> to send
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
