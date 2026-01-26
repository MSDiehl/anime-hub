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

  async function loadThreads() {
    setThreadsLoading(true);
    setThreadsErr(null);
    try {
      const epQ = discEpisode ? `?episode=${discEpisode}` : "";
      const res = await fetch(`/api/discussions/anime/${activeId}${epQ}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as ThreadSummary[];
      setThreads(json);
    } catch (e: any) {
      setThreadsErr(e?.message ?? "Failed to load discussions");
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
        const t = await res.text().catch(() => "");
        throw new Error(t || `${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as ThreadDetail;
      setThread(json);
    } catch (e: any) {
      setThreadErr(e?.message ?? "Failed to load thread");
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
        const t = await res.text().catch(() => "");
        throw new Error(t || `${res.status} ${res.statusText}`);
      }

      setNewTitle("");
      setNewBody("");
      await loadThreads();
    } catch (e: any) {
      setThreadsErr(e?.message ?? "Failed to create thread");
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
        const t = await res.text().catch(() => "");
        throw new Error(t || `${res.status} ${res.statusText}`);
      }

      setReplyBody("");
      await loadThread(selectedThreadId);
      await loadThreads();
    } catch (e: any) {
      setThreadErr(e?.message ?? "Failed to post reply");
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
              {episodes.map((ep) => (
                <div key={ep.num} className="adEpCard">
                  <div className="adEpNum">EP {ep.num}</div>
                  <div className="adEpBadges">
                    {ep.isFiller && <span className="adBadge">Filler</span>}
                    {ep.arc && <span className="adBadge">{ep.arc}</span>}
                  </div>

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
              ))}
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
                        <div className="adThreadItemTitle">{t.title}</div>
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
                    <div className="adThreadTitle">{thread.title}</div>
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

                  <div className="adThreadBody">{thread.body}</div>

                  <div className="adRepliesHeader">
                    Replies{" "}
                    <span className="adRepliesCount">
                      {thread.comments.length}
                    </span>
                  </div>

                  <div className="adRepliesList">
                    {thread.comments.length === 0 ? (
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
