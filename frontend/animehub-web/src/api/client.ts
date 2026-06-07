import { csrfFetch } from "./csrf";
import { readApiError } from "../utils/apiError";

export type PagedResult<T> = {
  page: number;
  perPage: number;
  total?: number | null;
  lastPage?: number | null;
  hasNextPage: boolean;
  items: T[];
};

type MaybePagedResult<T> = Partial<PagedResult<T>> & {
  items?: T[];
};

export type AnimeSearchItem = {
  aniListId: number;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  coverImageUrl?: string | null;
  genres: string[];
};

export type TrackingStatus =
  | "Watching"
  | "Completed"
  | "Paused"
  | "Dropped"
  | "PlanToWatch";

export type TrackedShow = {
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

export type CountBucket = {
  label: string;
  count: number;
};

export type TrackedStats = {
  trackedCount: number;
  favorites: number;
  episodesWatched: number;
  minutesWatched: number;
  hoursWatched: number;
  averagePersonalRating?: number | null;
  averageAniListScore?: number | null;
  ratingDistribution: CountBucket[];
  genreTrends: CountBucket[];
  yearlyCompletions: CountBucket[];
  statusCounts: CountBucket[];
};

export type TrackedShowHistory = {
  id: string;
  aniListId: number;
  title: string;
  eventType: string;
  fromValue?: string | null;
  toValue?: string | null;
  episodeNumber?: number | null;
  createdUtc: string;
};

export type BulkTrackedShowsResult = {
  updated: number;
  deleted: number;
  items: TrackedShow[];
};

export type MostTrackedShow = {
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
  trackedCount: number;
};

export type AnimeRecommendationItem = {
  aniListId: number;
  title: string;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  coverImageUrl?: string | null;
  bannerImageUrl?: string | null;
  genres: string[];
  recommendationReason?: string | null;
};

export type ForumThreadSummary = {
  id: string;
  aniListId: number;
  episodeNumber?: number | null;
  title: string;
  category: string;
  tags: string[];
  containsSpoilers: boolean;
  isPinned: boolean;
  isLocked: boolean;
  isDeleted: boolean;
  createdUtc: string;
  lastActivityUtc?: string | null;
  authorUserId: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  commentCount: number;
  reactionCount: number;
  userReaction?: string | null;
  reportCount: number;
  isSubscribed: boolean;
  hasUnread: boolean;
  unreadCount: number;
  canEdit: boolean;
  canDelete: boolean;
  canModerate: boolean;
};

export type ForumReplyActivity = {
  id: string;
  threadId: string;
  threadTitle: string;
  aniListId: number;
  episodeNumber?: number | null;
  body: string;
  createdUtc: string;
  reactionCount: number;
};

export type ModeratorReport = {
  id: string;
  reporterUserId: string;
  reporterDisplayName: string;
  threadId: string;
  commentId?: string | null;
  targetType: "thread" | "comment";
  threadTitle: string;
  excerpt: string;
  targetDeleted: boolean;
  reason: string;
  status: "Open" | "Resolved" | "Dismissed";
  resolution?: string | null;
  createdUtc: string;
  resolvedUtc?: string | null;
  openTargetReportCount: number;
};

export type SubscriptionResult = {
  isSubscribed: boolean;
  notificationsEnabled: boolean;
};

export type AnimeSearchParams = {
  q: string;
  page?: number;
  perPage?: number;
};

export type ForumSearchParams = {
  q?: string;
  category?: string;
  tag?: string;
  sort?: string;
  page?: number;
  perPage?: number;
};

export async function apiGet<T>(path: string, signal?: AbortSignal) {
  return apiFetch<T>(path, { method: "GET", signal });
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
) {
  return apiFetch<T>(
    path,
    {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    },
  );
}

export async function apiDownload(path: string, signal?: AbortSignal) {
  const res = await csrfFetch(path, {
    credentials: "include",
    signal,
  });

  if (!res.ok) {
    const message = await readApiError(res);
    const retryAfter = res.headers.get("retry-after");
    throw new ApiClientError(message, res.status, retryAfter);
  }

  return res.blob();
}

export function searchAnime({ q, page = 1, perPage = 12 }: AnimeSearchParams, signal?: AbortSignal) {
  const params = new URLSearchParams({
    q,
    page: String(page),
    perPage: String(perPage),
  });

  return apiGet<PagedResult<AnimeSearchItem> | AnimeSearchItem[]>(
    `/api/anime/search?${params}`,
    signal,
  ).then((data) => toPagedResult(data, page, perPage));
}

export function getTracked(signal?: AbortSignal) {
  return apiGet<TrackedShow[]>("/api/tracked", signal);
}

export function getTrackedStats(signal?: AbortSignal) {
  return apiGet<TrackedStats>("/api/tracked/stats", signal);
}

export function getTrackedHistory(limit = 50, signal?: AbortSignal) {
  return apiGet<TrackedShowHistory[]>(`/api/tracked/history?limit=${limit}`, signal);
}

export function bulkUpdateTracked(
  body: {
    aniListIds: number[];
    trackingStatus?: TrackingStatus;
    isFavorite?: boolean;
    delete?: boolean;
  },
  signal?: AbortSignal,
) {
  return apiSend<BulkTrackedShowsResult>("/api/tracked/bulk", "POST", body, signal);
}

export function downloadTrackedExport(format: "json" | "csv", aniListIds?: number[], signal?: AbortSignal) {
  const params = new URLSearchParams({ format });
  for (const id of aniListIds ?? []) params.append("ids", String(id));
  return apiDownload(`/api/tracked/export?${params}`, signal);
}

export function getMostTracked(limit = 4, signal?: AbortSignal) {
  return apiGet<MostTrackedShow[]>(`/api/tracked/most?limit=${limit}`, signal);
}

export function getRecommendations(limit = 12, signal?: AbortSignal) {
  return apiGet<PagedResult<AnimeRecommendationItem>>(
    `/api/anime/recommendations?limit=${limit}`,
    signal,
  );
}

export function getDiscovery(mode: string, page = 1, perPage = 18, signal?: AbortSignal) {
  const params = new URLSearchParams({
    mode,
    page: String(page),
    perPage: String(perPage),
  });

  return apiGet<PagedResult<AnimeRecommendationItem>>(`/api/anime/discover?${params}`, signal);
}

export function trackShow(body: Partial<TrackedShow> & { aniListId: number; title: string }) {
  return apiSend<TrackedShow>("/api/tracked", "POST", body);
}

export function untrackShow(aniListId: number) {
  return apiSend<void>(`/api/tracked/${aniListId}`, "DELETE");
}

export function getForumThreads(params: ForumSearchParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set("sort", params.sort ?? "active");
  query.set("page", String(params.page ?? 1));
  query.set("perPage", String(params.perPage ?? 25));
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.category && params.category !== "All") query.set("category", params.category);
  if (params.tag?.trim()) query.set("tag", params.tag.trim().replace(/^#/, ""));

  return apiGet<PagedResult<ForumThreadSummary> | ForumThreadSummary[]>(
    `/api/discussions/forums?${query}`,
    signal,
  ).then((data) => toPagedResult(data, params.page ?? 1, params.perPage ?? 25));
}

export function getMostDiscussed(signal?: AbortSignal) {
  return apiGet<PagedResult<ForumThreadSummary> | ForumThreadSummary[]>(
    "/api/discussions/most-discussed?days=7&page=1&perPage=6",
    signal,
  ).then((data) => toPagedResult(data, 1, 6));
}

export function getMyForumThreads(page = 1, perPage = 10, signal?: AbortSignal) {
  return apiGet<PagedResult<ForumThreadSummary> | ForumThreadSummary[]>(
    `/api/discussions/me/threads?page=${page}&perPage=${perPage}`,
    signal,
  ).then((data) => toPagedResult(data, page, perPage));
}

export function getUnreadForumThreads(page = 1, perPage = 10, signal?: AbortSignal) {
  return apiGet<PagedResult<ForumThreadSummary> | ForumThreadSummary[]>(
    `/api/discussions/me/unread?page=${page}&perPage=${perPage}`,
    signal,
  ).then((data) => toPagedResult(data, page, perPage));
}

export function getMyForumReplies(page = 1, perPage = 10, signal?: AbortSignal) {
  return apiGet<PagedResult<ForumReplyActivity> | ForumReplyActivity[]>(
    `/api/discussions/me/replies?page=${page}&perPage=${perPage}`,
    signal,
  ).then((data) => toPagedResult(data, page, perPage));
}

export function getModeratorReports(status = "Open", page = 1, perPage = 20, signal?: AbortSignal) {
  const params = new URLSearchParams({
    status,
    page: String(page),
    perPage: String(perPage),
  });

  return apiGet<PagedResult<ModeratorReport> | ModeratorReport[]>(
    `/api/discussions/mod/reports?${params}`,
    signal,
  ).then((data) => toPagedResult(data, page, perPage));
}

export function moderateReport(
  reportId: string,
  body: {
    status?: "Open" | "Resolved" | "Dismissed";
    resolution?: string;
    deleteTarget?: boolean;
    lockThread?: boolean;
  },
  signal?: AbortSignal,
) {
  return apiSend<void>(`/api/discussions/mod/reports/${reportId}`, "PATCH", body, signal);
}

export function setThreadSubscription(threadId: string, subscribed: boolean, signal?: AbortSignal) {
  return apiSend<SubscriptionResult>(
    `/api/discussions/thread/${threadId}/subscription`,
    "POST",
    { subscribed, notificationsEnabled: subscribed },
    signal,
  );
}

export function toPagedResult<T>(
  data: MaybePagedResult<T> | T[],
  page: number,
  perPage: number,
): PagedResult<T> {
  if (Array.isArray(data)) {
    return {
      page,
      perPage,
      total: data.length,
      lastPage: 1,
      hasNextPage: false,
      items: data,
    };
  }

  return {
    page: data.page ?? page,
    perPage: data.perPage ?? perPage,
    total: data.total,
    lastPage: data.lastPage,
    hasNextPage: data.hasNextPage ?? false,
    items: Array.isArray(data.items) ? data.items : [],
  };
}

async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const res = await csrfFetch(path, {
    credentials: "include",
    ...init,
  });

  if (!res.ok) {
    const message = await readApiError(res);
    const retryAfter = res.headers.get("retry-after");
    throw new ApiClientError(message, res.status, retryAfter);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly retryAfter: string | null;

  constructor(message: string, status: number, retryAfter: string | null) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
