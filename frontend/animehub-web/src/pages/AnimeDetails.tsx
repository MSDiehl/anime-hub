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
import { getErrorMessage, readApiError } from "../utils/apiError";
import { sanitizeAniListHtml } from "../utils/sanitizeAniListHtml";
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

type ThreadSummary = {
  id: string;
  aniListId: number;
  episodeNumber?: number | null;
  title: string;
  createdUtc: string;
  authorDisplayName: string;
  commentCount: number;
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
        const res = await fetch(`/api/anime/${activeId}`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(
            await readApiError(res, "Failed to load anime details"),
          );
        }
        const json = (await res.json()) as AnimeDetailsDto;
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
        const res = await fetch(`/api/tracked/${activeId}`, {
          credentials: "include",
        });

        if (res.status === 404) {
          if (!cancelled) setTrackedShow(null);
          return;
        }

        if (!res.ok) {
          throw new Error(
            await readApiError(res, "Failed to load tracking details"),
          );
        }

        const json = (await res.json()) as TrackedShow;
        if (!cancelled) setTrackedShow(json);
      } catch (e: unknown) {
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

  async function trackCurrent(overrides: Partial<TrackedShow> = {}) {
    const payload = trackingPayload(overrides);
    if (!payload) return;

    setTrackingSaving(true);
    setTrackingError(null);

    try {
      const res = await fetch("/api/tracked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        const existing = await fetch(`/api/tracked/${activeId}`, {
          credentials: "include",
        });
        if (existing.ok) setTrackedShow((await existing.json()) as TrackedShow);
        return;
      }

      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to track show"));
      }

      setTrackedShow((await res.json()) as TrackedShow);
    } catch (e: unknown) {
      setTrackingError(getErrorMessage(e, "Failed to track show"));
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

    try {
      const res = await fetch(`/api/tracked/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to update show"));
      }

      setTrackedShow((await res.json()) as TrackedShow);
    } catch (e: unknown) {
      setTrackingError(getErrorMessage(e, "Failed to update show"));
    } finally {
      setTrackingSaving(false);
    }
  }

  async function untrackCurrent() {
    if (!trackedShow) return;

    setTrackingSaving(true);
    setTrackingError(null);

    try {
      const res = await fetch(`/api/tracked/${activeId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok && res.status !== 404) {
        throw new Error(await readApiError(res, "Failed to untrack show"));
      }

      setTrackedShow(null);
    } catch (e: unknown) {
      setTrackingError(getErrorMessage(e, "Failed to untrack show"));
    } finally {
      setTrackingSaving(false);
    }
  }

  async function loadThreads() {
    setThreadsLoading(true);
    setThreadsErr(null);
    try {
      const epQ = discEpisode ? `?episode=${discEpisode}` : "";
      const res = await fetch(`/api/discussions/anime/${activeId}${epQ}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to load discussions"));
      }
      const json = (await res.json()) as ThreadSummary[];
      setThreads(json);
    } catch (e: unknown) {
      setThreadsErr(getErrorMessage(e, "Failed to load discussions"));
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }

  async function loadThread(threadId: string) {
    setThreadLoading(true);
    setThreadErr(null);
    setThread(null);
    try {
      const res = await fetch(`/api/discussions/thread/${threadId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to load thread"));
      }
      const json = (await res.json()) as ThreadDetail;
      setThread(json);
    } catch (e: unknown) {
      setThreadErr(getErrorMessage(e, "Failed to load thread"));
    } finally {
      setThreadLoading(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  useEffect(() => {
    setThreadSpoilersRevealed(false);
  }, [selectedThreadId, spoilerSafe]);

  async function createThread() {
    if (!newTitle.trim() || !newBody.trim()) return;

    setPostingThread(true);
    setThreadsErr(null);
    try {
      const epQ = discEpisode ? `?episode=${discEpisode}` : "";
      const res = await fetch(`/api/discussions/anime/${activeId}${epQ}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newTitle, body: newBody }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to create thread"));
      }

      setNewTitle("");
      setNewBody("");
      await loadThreads();
    } catch (e: unknown) {
      setThreadsErr(getErrorMessage(e, "Failed to create thread"));
    } finally {
      setPostingThread(false);
    }
  }

  async function postReply() {
    if (!selectedThreadId || !replyBody.trim()) return;

    setPostingReply(true);
    setThreadErr(null);
    try {
      const res = await fetch(
        `/api/discussions/thread/${selectedThreadId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ body: replyBody }),
        },
      );

      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to post reply"));
      }

      setReplyBody("");
      await loadThread(selectedThreadId);
      await loadThreads();
    } catch (e: unknown) {
      setThreadErr(getErrorMessage(e, "Failed to post reply"));
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
        <div className="adLoadingWrap">
          <div className="adLoadingCard mangaPanel">Loading…</div>
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
        <div className="adLoadingWrap">
          <div className="adLoadingCard mangaPanel">
            <div className="adStateTitle">Couldn’t load anime details</div>
            <div className="adStateText">{detailsError}</div>
            <button
              className="adPillBtn adStateAction"
              onClick={() => setDetailsReloadKey((value) => value + 1)}
            >
              Retry
            </button>
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
        <div className="adLoadingWrap">
          <div className="adLoadingCard mangaPanel">Not found.</div>
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

      <header className="adTopBar">
        <div className="adBrand" onClick={() => nav("/")}>
          AnimeHub
        </div>
        <div className="adTopBarRight">
          <button className="adPillBtn" onClick={() => nav("/")}>
            Back
          </button>
          <button className="adPillBtn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="adHero">
        <div
          className="adBanner"
          style={{
            backgroundImage: data.bannerImageUrl
              ? `url(${data.bannerImageUrl})`
              : undefined,
          }}
        />
        <div className="adHeroOverlay" />
        <div className="adHeroInner">
          <div
            className="adCover"
            style={{
              backgroundImage: data.coverImageUrl
                ? `url(${data.coverImageUrl})`
                : undefined,
            }}
          />

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

          <div className="adSeasonPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              RELATIONS
            </div>

            {relations.length === 0 ? (
              <div className="adSeasonEmpty">No related anime found yet.</div>
            ) : (
              <div className="adSeasonList">
                {relations.map((s) => {
                  const active = s.aniListId === data.aniListId;
                  return (
                    <button
                      key={s.aniListId}
                      onClick={() => setActiveId(s.aniListId)}
                      className={[
                        "adSeasonItem",
                        active ? "isActive" : "",
                      ].join(" ")}
                      title={s.title}
                    >
                      <div
                        className="adSeasonThumb"
                        style={{
                          backgroundImage: s.coverImageUrl
                            ? `url(${s.coverImageUrl})`
                            : undefined,
                        }}
                      />
                      <div className="adSeasonText">
                        <div className="adSeasonName">{s.title}</div>
                        <div className="adSeasonMeta">
                          {[
                            humanizeEnum(s.relationType),
                            s.format,
                            s.season || s.seasonYear
                              ? `${s.season ?? ""} ${s.seasonYear ?? ""}`.trim()
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
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
                  ? "Loading tracking state..."
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
                  {trackingSaving ? "Saving..." : "Untrack"}
                </button>
              ) : (
                <button
                  className="adPillBtn adPrimaryBtn"
                  onClick={() => trackCurrent()}
                  disabled={trackingSaving || trackingLoading}
                >
                  {trackingSaving ? "Saving..." : "Track"}
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
                {trackedShow?.isFavorite ? "Favorited" : "Favorite"}
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
          <section className="adPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Overview
            </div>

            <div
              className="adDesc"
              dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
            />
          </section>

          <section className="adPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Trends
            </div>

            <div className="adChartBlock">
              <div className="adChartLabel">Score by related anime</div>
              <div className="adChartWrap">
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

            <div className="adChartBlock">
              <div className="adChartLabel">Popularity by related anime</div>
              <div className="adChartWrap">
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
          </section>
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
              <div className="adSeasonEmpty">No trailer listed.</div>
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
                <div className="adSeasonEmpty">No characters listed.</div>
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
                    />
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
                <div className="adSeasonEmpty">No staff listed.</div>
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
                    />
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
            <div className="adNote">
              AniList didn’t return an episode count for this show yet — we’ll
              still support community episode lists later.
            </div>
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

                {threadsErr && (
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
                  {postingThread ? "Posting…" : "Post thread"}
                </button>
              </div>

              <div className="adThreadList">
                <div className="adThreadListHeader">
                  Threads
                  <span className="adThreadListMeta">
                    {threadsLoading ? "Loading…" : `${threads.length}`}
                  </span>
                </div>

                {!threadsLoading && threads.length === 0 ? (
                  <div className="adThreadEmpty">
                    No threads yet. Be the first to start one.
                  </div>
                ) : (
                  threads.map((t) => {
                    const active = selectedThreadId === t.id;
                    return (
                      <button
                        key={t.id}
                        className={"adThreadItem" + (active ? " isActive" : "")}
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
                  Pick a thread to read and reply.
                </div>
              ) : threadLoading ? (
                <div className="adThreadPlaceholder">Loading thread…</div>
              ) : threadErr ? (
                <div className="adThreadPlaceholder">
                  <b>WHAM!</b> {threadErr}
                </div>
              ) : !thread ? (
                <div className="adThreadPlaceholder">Thread not found.</div>
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
                        Replies hidden until the thread is revealed.
                      </div>
                    ) : thread.comments.length === 0 ? (
                      <div className="adThreadEmpty">
                        No replies yet. Drop one.
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
                      {postingReply ? "Posting…" : "Reply"}
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
