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
import "./AnimeDetails.css";

type RelatedSeason = {
  aniListId: number;
  title: string;
  relationType?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
  coverImageUrl?: string | null;
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
  relatedSeasons?: RelatedSeason[];
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

  useEffect(() => setActiveId(routeId), [routeId]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const baseScore = data.averageScore ?? 70;
    const basePop = data.popularity ?? 100000;

    return Array.from({ length: 10 }).map((_, i) => ({
      t: `W${i + 1}`,
      score: Math.max(0, Math.min(100, baseScore + (i - 5) * 0.6)),
      pop: Math.max(0, basePop + (i - 5) * 1500),
    }));
  }, [data]);

  // v1 episodes: generate from episode count
  const episodes = useMemo(() => {
    const n = data?.episodes ?? 0;
    if (!n || n <= 0) return [];
    return Array.from({ length: n }).map((_, i) => ({
      num: i + 1,
      // later: arc/season/filler/user rating/community avg
      arc: null as string | null,
      isFiller: false,
    }));
  }, [data?.episodes]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/anime/${activeId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = (await res.json()) as AnimeDetailsDto;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(activeId) && activeId > 0) load();

    return () => {
      cancelled = true;
    };
  }, [activeId]);

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

  const seasons = (data.relatedSeasons ?? [])
    .slice()
    .sort((a, b) => (a.seasonYear ?? 9999) - (b.seasonYear ?? 9999));

  return (
    <div className="adPage">
      {/* Manga background layers (visual only) */}
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
              SEASONS
            </div>

            {seasons.length === 0 ? (
              <div className="adSeasonEmpty">No related seasons found yet.</div>
            ) : (
              <div className="adSeasonList">
                {seasons.map((s) => {
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
                          {s.season || s.seasonYear
                            ? `${s.season ?? ""} ${s.seasonYear ?? ""}`.trim()
                            : (s.relationType ?? "Season")}
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
        {/* Manga page layout: panels with gutters */}
        <div className="adGrid">
          <section className="adPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Overview
            </div>

            <div
              className="adDesc"
              dangerouslySetInnerHTML={{ __html: data.description ?? "" }}
            />
          </section>

          <section className="adPanel mangaPanel">
            <div className="adPanelTag" aria-hidden="true">
              Trends
            </div>

            <div className="adChartBlock">
              <div className="adChartLabel">Score (placeholder)</div>
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
              <div className="adChartLabel">Popularity (placeholder)</div>
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

            {/* Next: store real snapshots + per-episode ratings. */}
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
          </div>

          {!episodes.length ? (
            <div className="adNote">
              AniList didn’t return an episode count for this show yet — we’ll
              still support community episode lists later.
            </div>
          ) : (
            <div className="adEpisodeGrid">
              {episodes.map((ep) => (
                <div key={ep.num} className="adEpCard">
                  <div className="adEpNum">EP {ep.num}</div>
                  <div className="adEpBadges">
                    {ep.isFiller && <span className="adBadge">Filler</span>}
                    {ep.arc && <span className="adBadge">{ep.arc}</span>}
                  </div>
                  <button className="adRateBtn" disabled title="Next step">
                    Rate (coming next)
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
