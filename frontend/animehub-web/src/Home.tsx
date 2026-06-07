import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ApiClientError,
  getMostTracked,
  getTracked,
  searchAnime,
  trackShow as trackShowApi,
  untrackShow as untrackShowApi,
  type AnimeSearchItem,
  type TrackedShow,
} from "./api/client";
import AppNav from "./components/AppNav";
import { CoverFallback, EmptyState, SkeletonBlock, useToast } from "./components/Feedback";
import { PlusIcon, SearchIcon, TrashIcon } from "./components/Icons";
import { getErrorMessage } from "./utils/apiError";
import "./Home.css";

type HomeProps = {
  onLogout: () => void | Promise<void>;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

export default function Home({ onLogout }: HomeProps) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [trackingIds, setTrackingIds] = useState<Set<number>>(new Set());

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);
  const debouncedQ = useDebouncedValue(q.trim(), 350);

  const trackedQuery = useQuery({
    queryKey: ["tracked"],
    queryFn: ({ signal }) => getTracked(signal),
  });

  const mostTrackedQuery = useQuery({
    queryKey: ["mostTracked", 4],
    queryFn: ({ signal }) => getMostTracked(4, signal),
  });

  const searchQuery = useQuery({
    queryKey: ["animeSearch", debouncedQ, searchPage],
    queryFn: ({ signal }) =>
      searchAnime({ q: debouncedQ, page: searchPage, perPage: 12 }, signal),
    enabled: hasSearched && debouncedQ.length >= 2,
  });

  const tracked = useMemo(() => trackedQuery.data ?? [], [trackedQuery.data]);
  const mostTracked = mostTrackedQuery.data ?? [];
  const mostTrackedLoading = mostTrackedQuery.isLoading;
  const mostTrackedError = mostTrackedQuery.error
    ? getErrorMessage(mostTrackedQuery.error, "Failed to load most tracked")
    : null;
  const loading = searchQuery.isFetching;
  const items = searchQuery.data?.items ?? [];
  const searchError = searchQuery.error
    ? getErrorMessage(searchQuery.error, "Search failed")
    : null;

  const trackedIds = useMemo(
    () => new Set(tracked.map((t) => t.aniListId)),
    [tracked],
  );

  useEffect(() => {
    setSearchPage(1);
  }, [debouncedQ]);

  async function runSearch() {
    const query = q.trim();
    if (query.length < 2) return;

    setError(null);
    setHasSearched(true);
    setSearchPage(1);
    await queryClient.invalidateQueries({ queryKey: ["animeSearch", query] });
  }

  function resetToHero() {
    setHasSearched(false);
    setError(null);
    setSearchPage(1);
  }

  function bestTitle(x: AnimeSearchItem) {
    return x.titleEnglish || x.titleRomaji || x.titleNative || "Untitled";
  }

  async function trackAnime(x: AnimeSearchItem) {
    const id = x.aniListId;
    if (trackedIds.has(id)) return;

    const previousTracked = queryClient.getQueryData<TrackedShow[]>(["tracked"]);
    const optimisticShow: TrackedShow = {
      id: `optimistic-${id}`,
      aniListId: id,
      title: bestTitle(x),
      coverImageUrl: x.coverImageUrl,
      format: x.format,
      status: x.status,
      episodes: x.episodes,
      season: x.season,
      seasonYear: x.seasonYear,
      averageScore: x.averageScore,
      popularity: x.popularity,
      trackingStatus: "PlanToWatch",
      isFavorite: false,
    };

    setTrackingIds((prev) => new Set(prev).add(id));
    queryClient.setQueryData<TrackedShow[]>(["tracked"], (current = []) => [
      ...current.filter((show) => show.aniListId !== id),
      optimisticShow,
    ]);

    try {
      await trackShowApi({
        aniListId: x.aniListId,
        title: bestTitle(x),
        coverImageUrl: x.coverImageUrl,
        format: x.format,
        status: x.status,
        episodes: x.episodes,
        season: x.season,
        seasonYear: x.seasonYear,
        averageScore: x.averageScore,
        popularity: x.popularity,
      });

      await queryClient.invalidateQueries({ queryKey: ["tracked"] });
      await queryClient.invalidateQueries({ queryKey: ["mostTracked"] });
      pushToast(`${bestTitle(x)} added to your tracked list.`, "success");
    } catch (e: unknown) {
      if (e instanceof ApiClientError && e.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ["tracked"] });
        return;
      }
      queryClient.setQueryData<TrackedShow[]>(["tracked"], previousTracked ?? []);
      setError(getErrorMessage(e, "Failed to track show"));
      pushToast("Could not track that show.", "error");
    } finally {
      setTrackingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function untrackAnime(aniListId: number) {
    if (!trackedIds.has(aniListId)) return;

    const previousTracked = queryClient.getQueryData<TrackedShow[]>(["tracked"]);
    const removed = previousTracked?.find((item) => item.aniListId === aniListId);
    setTrackingIds((prev) => new Set(prev).add(aniListId));
    setError(null);
    queryClient.setQueryData<TrackedShow[]>(["tracked"], (current = []) =>
      current.filter((item) => item.aniListId !== aniListId),
    );

    try {
      await untrackShowApi(aniListId);
      await queryClient.invalidateQueries({ queryKey: ["tracked"] });
      await queryClient.invalidateQueries({ queryKey: ["mostTracked"] });
      pushToast(`${removed?.title ?? "Show"} removed from tracking.`, "success");
    } catch (e: unknown) {
      if (e instanceof ApiClientError && e.status === 404) {
        await queryClient.invalidateQueries({ queryKey: ["tracked"] });
        return;
      }
      queryClient.setQueryData<TrackedShow[]>(["tracked"], previousTracked ?? []);
      setError(getErrorMessage(e, "Failed to untrack show"));
      pushToast("Could not remove that show.", "error");
    } finally {
      setTrackingIds((prev) => {
        const next = new Set(prev);
        next.delete(aniListId);
        return next;
      });
    }
  }

  return (
    <div className="homePage">
      {/* Manga background layers (visual only) */}
      <div className="homeBg" aria-hidden="true">
        <div className="homeSpeedLines" />
        <div className="homeHalftone" />
        <div className="homeInkWash" />
      </div>

      <AppNav active="search" onLogout={onLogout} />

      <section className={`homeHero ${hasSearched ? "compact" : "centered"}`}>
        <div className="homeHeroInner">
          <div className="homeHeroText">
            <h1 className="homeH1">Find your next anime</h1>
            <p className="homeSub">
              Search, track, and analyze anime — clean, fast, and
              community-driven.
            </p>
          </div>

          <div className="homeSearchRow">
            <div className="homeSearchBox">
              <span className="homeSearchIcon" aria-hidden="true">
                <SearchIcon />
              </span>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search anime (Naruto, Frieren, One Piece...)"
                className="homeInput"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSearch && !loading) runSearch();
                  if (e.key === "Escape") resetToHero();
                }}
              />

              <button
                onClick={runSearch}
                disabled={!canSearch || loading}
                className={`homeSearchBtn ${
                  loading || !canSearch ? "isDisabled" : ""
                }`}
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>

            {hasSearched && (
              <button
                onClick={resetToHero}
                className="homeClearBtn"
                title="Back to home"
              >
                Clear
              </button>
            )}
          </div>

          {(error || searchError) && (
            <div className="homeError">{error || searchError}</div>
          )}

          {!hasSearched && (
            <div className="homeMostTracked">
              <div className="homeSectionHead">
                <div className="homeSectionTitleWrap">
                  <h2 className="homeH2">Most tracked</h2>
                  <span className="homeSectionBadge" aria-hidden="true">
                    HOT!
                  </span>
                </div>
                <span className="homeMuted">Based on tracked shows.</span>
              </div>

              <div className="homeCardGrid">
                {mostTrackedLoading ? (
                  <div className="homeCard skeletonCard">
                    <SkeletonBlock rows={3} />
                  </div>
                ) : mostTrackedError ? (
                  <div className="homeError">{mostTrackedError}</div>
                ) : mostTracked.length === 0 ? (
                  <EmptyState
                    actionLabel="Search anime"
                    message="Track a show to start shaping the community list."
                    onAction={() => {
                      setHasSearched(true);
                      window.setTimeout(() => document.querySelector<HTMLInputElement>(".homeInput")?.focus(), 0);
                    }}
                    title="No tracked shows yet"
                  />
                ) : (
                  mostTracked.map((show) => (
                    <div key={show.aniListId} className="homeCard">
                      <div
                        className="homeCardCover"
                        style={{
                          backgroundImage: show.coverImageUrl
                            ? `url(${show.coverImageUrl})`
                            : undefined,
                        }}
                      >
                        {!show.coverImageUrl && <CoverFallback />}
                      </div>
                      <div className="homeCardBody">
                        <div className="homeCardTitle">{show.title}</div>
                        <div className="homeCardSub">
                          {show.trackedCount}{" "}
                          {show.trackedCount === 1 ? "tracker" : "trackers"}
                        </div>
                        <button
                          className="homeCardBtn"
                          onClick={() => navigate(`/anime/${show.aniListId}`)}
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="homeMain">
        {hasSearched && (
          <div className="homeResultsWrap">
            <div className="homeSectionHead">
              <div className="homeSectionTitleWrap">
                <h2 className="homeH2">Search results</h2>
                <span className="homeSectionBadge alt" aria-hidden="true">
                  POW!
                </span>
              </div>
              <span className="homeMuted">
                Showing top matches from AniList
              </span>
            </div>

            <div className="homeResultsGrid">
              {loading && items.length === 0 ? (
                Array.from({ length: 6 }, (_, index) => (
                  <div className="homeResultCard skeletonCard" key={index}>
                    <SkeletonBlock rows={4} />
                  </div>
                ))
              ) : items.map((x) => {
                const isTracked = trackedIds.has(x.aniListId);
                const isTracking = trackingIds.has(x.aniListId);

                return (
                  <div
                    key={x.aniListId}
                    className="homeResultCard"
                    onClick={() => navigate(`/anime/${x.aniListId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/anime/${x.aniListId}`);
                      }
                    }}
                  >
                    <div
                      className="homeResultCover"
                      style={{
                        backgroundImage: x.coverImageUrl
                          ? `url(${x.coverImageUrl})`
                        : undefined,
                      }}
                    >
                      {!x.coverImageUrl && <CoverFallback />}
                    </div>

                    <div className="homeResultBody">
                      <div className="homeResultTitle">{bestTitle(x)}</div>

                      <div className="homeResultMeta">
                        {x.format ?? "—"} • {x.status ?? "—"}
                        {typeof x.episodes === "number"
                          ? ` • ${x.episodes} eps`
                          : ""}
                      </div>

                      <div className="homeResultStats">
                        <span>Score: {x.averageScore ?? "—"}</span>
                        <span>Popularity: {x.popularity ?? "—"}</span>
                      </div>

                      <div className="homeResultActions">
                        {isTracked ? (
                          <button
                            className={[
                              "homeTrackBtn",
                              "isTracked",
                              isTracking ? "isBusy" : "",
                            ].join(" ")}
                            onClick={(e) => {
                              e.stopPropagation();
                              untrackAnime(x.aniListId);
                            }}
                            disabled={isTracking}
                            title="Remove from tracked shows"
                          >
                            {isTracking ? "Untracking…" : <><TrashIcon size={16} /> Untrack</>}
                          </button>
                        ) : (
                          <button
                            className={[
                              "homeTrackBtn",
                              isTracking ? "isBusy" : "",
                            ].join(" ")}
                            onClick={(e) => {
                              e.stopPropagation();
                              trackAnime(x);
                            }}
                            disabled={isTracking}
                            title="Track this show"
                          >
                            {isTracking ? "Tracking…" : <><PlusIcon size={16} /> Track</>}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {searchQuery.data && searchQuery.data.lastPage !== 0 && (
              <div className="homePager">
                <button
                  className="homeClearBtn"
                  onClick={() => setSearchPage((value) => Math.max(1, value - 1))}
                  disabled={searchPage <= 1 || loading}
                >
                  Previous
                </button>
                <span>
                  Page {searchQuery.data.page}
                  {searchQuery.data.lastPage ? ` of ${searchQuery.data.lastPage}` : ""}
                </span>
                <button
                  className="homeClearBtn"
                  onClick={() => setSearchPage((value) => value + 1)}
                  disabled={!searchQuery.data.hasNextPage || loading}
                >
                  Next
                </button>
              </div>
            )}

            {!loading && items.length === 0 && !error && !searchError && (
              <EmptyState
                actionLabel="Clear search"
                message="Try a different title, alternate spelling, or a shorter query."
                onAction={resetToHero}
                title="No results"
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
