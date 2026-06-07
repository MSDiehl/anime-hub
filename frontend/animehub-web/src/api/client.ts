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
};

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
  trackingStatus?: string | null;
  isFavorite?: boolean;
};

export type MostTrackedShow = Omit<TrackedShow, "id"> & {
  trackedCount: number;
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
  canEdit: boolean;
  canDelete: boolean;
  canModerate: boolean;
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

export function getMostTracked(limit = 4, signal?: AbortSignal) {
  return apiGet<MostTrackedShow[]>(`/api/tracked/most?limit=${limit}`, signal);
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
  return (await res.json()) as T;
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
