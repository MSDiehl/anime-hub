import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDiscovery,
  getRecommendations,
  type AnimeRecommendationItem,
  type PagedResult,
} from "../api/client";
import AppNav from "../components/AppNav";
import { CoverFallback, EmptyState, SkeletonBlock } from "../components/Feedback";
import { getErrorMessage } from "../utils/apiError";
import "./Discovery.css";

type Props = {
  onLogout: () => void | Promise<void>;
};

type DiscoveryMode = "current" | "next" | "top-airing" | "hidden-gems";

const modes: Array<{ key: DiscoveryMode; label: string; note: string }> = [
  { key: "current", label: "Current season", note: "Airing and trending now" },
  { key: "next", label: "Next season", note: "Upcoming shows to plan around" },
  { key: "top-airing", label: "Top airing", note: "High-momentum releases" },
  { key: "hidden-gems", label: "Hidden gems", note: "Strong scores with less obvious pull" },
];

export default function Discovery({ onLogout }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<DiscoveryMode>("current");
  const [recommendations, setRecommendations] = useState<AnimeRecommendationItem[]>([]);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [discovery, setDiscovery] = useState<PagedResult<AnimeRecommendationItem> | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);

  const activeMode = useMemo(
    () => modes.find((item) => item.key === mode) ?? modes[0],
    [mode],
  );

  async function loadRecommendations() {
    setRecommendationsLoading(true);
    setRecommendationError(null);
    try {
      const result = await getRecommendations(12);
      setRecommendations(result.items);
    } catch (e: unknown) {
      setRecommendationError(getErrorMessage(e, "Failed to load recommendations"));
      setRecommendations([]);
    } finally {
      setRecommendationsLoading(false);
    }
  }

  async function loadDiscovery(selectedMode = mode) {
    setDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      setDiscovery(await getDiscovery(selectedMode, 1, 18));
    } catch (e: unknown) {
      setDiscoveryError(getErrorMessage(e, "Failed to load discovery"));
      setDiscovery(null);
    } finally {
      setDiscoveryLoading(false);
    }
  }

  useEffect(() => {
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDiscovery(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="discoverPage">
      <div className="discoverBg" aria-hidden="true">
        <div className="discoverSpeedLines" />
        <div className="discoverHalftone" />
      </div>

      <AppNav active="discover" onLogout={onLogout} />

      <main className="discoverMain">
        <header className="discoverHeader">
          <div>
            <h1>Discover</h1>
            <p>Recommendations, seasonal picks, airing standouts, and quieter gems.</p>
          </div>
          <button className="discoverRefresh" onClick={() => {
            loadRecommendations();
            loadDiscovery(mode);
          }}>
            Refresh
          </button>
        </header>

        <section className="discoverPanel">
          <div className="discoverSectionHead">
            <div>
              <span className="discoverKicker">For you</span>
              <h2>Personalized recommendations</h2>
            </div>
            <span>Built from your tracked genres, ratings, favorites, and completed shows.</span>
          </div>

          {recommendationsLoading ? (
            <CardSkeletons />
          ) : recommendationError ? (
            <EmptyState
              actionLabel="Retry"
              message={recommendationError}
              onAction={loadRecommendations}
              title="Could not load recommendations"
            />
          ) : recommendations.length === 0 ? (
            <EmptyState
              actionLabel="Track anime"
              message="Track and rate a few shows so AnimeHub can learn your taste."
              onAction={() => navigate("/search")}
              title="No recommendations yet"
            />
          ) : (
            <div className="discoverRail">
              {recommendations.map((item) => (
                <DiscoveryCard
                  key={item.aniListId}
                  item={item}
                  onOpen={() => navigate(`/anime/${item.aniListId}`)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="discoverPanel">
          <div className="discoverTabs" aria-label="Discovery mode">
            {modes.map((item) => (
              <button
                className={mode === item.key ? "isActive" : ""}
                key={item.key}
                onClick={() => setMode(item.key)}
                type="button"
              >
                <b>{item.label}</b>
                <span>{item.note}</span>
              </button>
            ))}
          </div>

          <div className="discoverSectionHead">
            <div>
              <span className="discoverKicker">Browse</span>
              <h2>{activeMode.label}</h2>
            </div>
            <span>{activeMode.note}</span>
          </div>

          {discoveryLoading ? (
            <CardSkeletons />
          ) : discoveryError ? (
            <EmptyState
              actionLabel="Retry"
              message={discoveryError}
              onAction={() => loadDiscovery(mode)}
              title="Could not load discovery"
            />
          ) : !discovery || discovery.items.length === 0 ? (
            <EmptyState
              actionLabel="Try current season"
              message="AniList did not return anything for this shelf."
              onAction={() => setMode("current")}
              title="Nothing here yet"
            />
          ) : (
            <div className="discoverGrid">
              {discovery.items.map((item) => (
                <DiscoveryCard
                  key={item.aniListId}
                  item={item}
                  onOpen={() => navigate(`/anime/${item.aniListId}`)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function CardSkeletons() {
  return (
    <div className="discoverGrid">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="discoverCard" key={index}>
          <SkeletonBlock rows={4} />
        </div>
      ))}
    </div>
  );
}

function DiscoveryCard({
  item,
  onOpen,
}: {
  item: AnimeRecommendationItem;
  onOpen: () => void;
}) {
  return (
    <article className="discoverCard">
      <button
        className="discoverCover"
        onClick={onOpen}
        style={{
          backgroundImage: item.coverImageUrl ? `url(${item.coverImageUrl})` : undefined,
        }}
        type="button"
      >
        {!item.coverImageUrl && <CoverFallback label="No cover" />}
      </button>
      <div className="discoverCardBody">
        <button className="discoverTitle" onClick={onOpen} type="button">
          {item.title}
        </button>
        <div className="discoverMeta">
          {item.format ?? "Anime"} · {item.season ?? "Season"} {item.seasonYear ?? ""}
        </div>
        <div className="discoverStats">
          <span>Score {item.averageScore ?? "-"}</span>
          <span>Pop {item.popularity ?? "-"}</span>
        </div>
        {item.recommendationReason && (
          <p className="discoverReason">{item.recommendationReason}</p>
        )}
        <div className="discoverGenres">
          {item.genres.slice(0, 3).map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
      </div>
    </article>
  );
}
