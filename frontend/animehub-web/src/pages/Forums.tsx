import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiGet,
  apiSend,
  getModeratorReports,
  getForumThreads,
  getMostDiscussed,
  getMyForumReplies,
  getMyForumThreads,
  getUnreadForumThreads,
  moderateReport,
  setThreadSubscription,
  type ForumReplyActivity,
  type ForumThreadSummary,
  type ModeratorReport,
  type PagedResult,
} from "../api/client";
import AppNav from "../components/AppNav";
import { EmptyState, SkeletonBlock, useConfirm, useTextPrompt, useToast } from "../components/Feedback";
import { SendIcon, TrashIcon } from "../components/Icons";
import { getErrorMessage } from "../utils/apiError";
import { renderMarkdown } from "../utils/markdown";
import "./Forums.css";

type Props = {
  onLogout: () => void | Promise<void>;
};

type ThreadSummary = ForumThreadSummary;

type CreateResult = {
  id: string;
};

type ReactionResult = {
  count: number;
  userReaction?: string | null;
};

type MeDto = {
  canModerate?: boolean;
  roles?: string[];
};

const categories = [
  "General",
  "Episode",
  "Theory",
  "Review",
  "News",
  "Help",
  "Off Topic",
];

export default function Forums({ onLogout }: Props) {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { requestText } = useTextPrompt();
  const { pushToast } = useToast();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [hotThreads, setHotThreads] = useState<ThreadSummary[]>([]);
  const [unreadThreads, setUnreadThreads] = useState<ThreadSummary[]>([]);
  const [myThreads, setMyThreads] = useState<ThreadSummary[]>([]);
  const [myReplies, setMyReplies] = useState<ForumReplyActivity[]>([]);
  const [reportQueue, setReportQueue] = useState<ModeratorReport[]>([]);
  const [pageInfo, setPageInfo] = useState<PagedResult<ThreadSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [modLoading, setModLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("active");
  const [category, setCategory] = useState("All");
  const [tag, setTag] = useState("");
  const [reportStatus, setReportStatus] = useState("Open");
  const [canModerateUser, setCanModerateUser] = useState(false);

  const [animeId, setAnimeId] = useState("");
  const [episode, setEpisode] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [threadCategory, setThreadCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [preview, setPreview] = useState(false);
  const [creating, setCreating] = useState(false);

  const canModerate = useMemo(
    () => canModerateUser || threads.some((thread) => thread.canModerate),
    [canModerateUser, threads],
  );

  async function loadThreads() {
    setLoading(true);
    setError(null);

    try {
      const result = await getForumThreads({
        q: search,
        sort,
        category,
        tag,
        page,
        perPage: 20,
      });
      setThreads(result.items);
      setPageInfo(result);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load forums"));
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadHotThreads() {
    try {
      const result = await getMostDiscussed();
      setHotThreads(result.items);
    } catch {
      setHotThreads([]);
    }
  }

  async function loadCommunityData(showLoading = true) {
    if (showLoading) setActivityLoading(true);
    setActivityError(null);

    try {
      const [me, unread, mine, replies] = await Promise.all([
        apiGet<MeDto>("/api/auth/me"),
        getUnreadForumThreads(1, 6),
        getMyForumThreads(1, 5),
        getMyForumReplies(1, 5),
      ]);
      const moderator = Boolean(
        me.canModerate ||
          me.roles?.some((role) => ["Owner", "Admin", "Moderator"].includes(role)),
      );
      setCanModerateUser(moderator);
      setUnreadThreads(unread.items);
      setMyThreads(mine.items);
      setMyReplies(replies.items);

      if (moderator) {
        setModLoading(true);
        try {
          const reports = await getModeratorReports(reportStatus, 1, 12);
          setReportQueue(reports.items);
        } finally {
          setModLoading(false);
        }
      } else {
        setReportQueue([]);
      }
    } catch (e: unknown) {
      setActivityError(getErrorMessage(e, "Failed to load community activity"));
      setUnreadThreads([]);
      setMyThreads([]);
      setMyReplies([]);
      setReportQueue([]);
    } finally {
      if (showLoading) setActivityLoading(false);
    }
  }

  async function loadReportQueue() {
    if (!canModerate) return;

    setModLoading(true);
    try {
      const reports = await getModeratorReports(reportStatus, 1, 12);
      setReportQueue(reports.items);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to load reports");
      setActivityError(message);
      pushToast(message, "error");
      setReportQueue([]);
    } finally {
      setModLoading(false);
    }
  }

  useEffect(() => {
    loadThreads();
    loadHotThreads();
    loadCommunityData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, category, page]);

  useEffect(() => {
    loadReportQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportStatus]);

  function runForumSearch() {
    if (page === 1) {
      loadThreads();
    } else {
      setPage(1);
    }
  }

  async function createThread() {
    const parsedAnimeId = Number(animeId);
    const parsedEpisode = episode.trim() ? Number(episode) : null;

    if (!Number.isInteger(parsedAnimeId) || parsedAnimeId <= 0) {
      setError("AniList ID is required.");
      return;
    }

    if (parsedEpisode !== null && (!Number.isInteger(parsedEpisode) || parsedEpisode <= 0)) {
      setError("Episode must be a positive number.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const episodeQuery = parsedEpisode ? `?episode=${parsedEpisode}` : "";
      const json = await apiSend<CreateResult>(
        `/api/discussions/anime/${parsedAnimeId}${episodeQuery}`,
        "POST",
        {
          title,
          body,
          category: threadCategory,
          tags: tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          containsSpoilers,
        },
      );
      setAnimeId("");
      setEpisode("");
      setTitle("");
      setBody("");
      setTags("");
      setContainsSpoilers(false);
      setPreview(false);
      await loadHotThreads();
      await loadCommunityData(false);
      pushToast("Thread posted.", "success");
      navigate(`/forums/thread/${json.id}`);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to create thread");
      setError(message);
      pushToast(message, "error");
    } finally {
      setCreating(false);
    }
  }

  async function toggleReaction(threadId: string) {
    try {
      const json = await apiSend<ReactionResult>(
        `/api/discussions/thread/${threadId}/reactions`,
        "POST",
        { type: "upvote" },
      );
      updateThread(threadId, {
        reactionCount: json.count,
        userReaction: json.userReaction ?? null,
      });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Reaction failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function reportThread(threadId: string) {
    const reason = await requestText({
      title: "Report thread",
      message: "Tell moderators what needs attention.",
      placeholder: "Reason",
      confirmLabel: "Send report",
      required: true,
    });
    if (reason === null) return;

    try {
      await apiSend<void>(`/api/discussions/thread/${threadId}/reports`, "POST", { reason });
      pushToast("Report sent.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Report failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function toggleSubscription(thread: ThreadSummary) {
    try {
      const result = await setThreadSubscription(thread.id, !thread.isSubscribed);
      updateThread(thread.id, {
        isSubscribed: result.isSubscribed,
        hasUnread: result.isSubscribed ? thread.hasUnread : false,
        unreadCount: result.isSubscribed ? thread.unreadCount : 0,
      });
      if (!result.isSubscribed) {
        setUnreadThreads((prev) => prev.filter((item) => item.id !== thread.id));
      }
      pushToast(result.isSubscribed ? "Thread watched." : "Thread unwatched.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Could not update watch state");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function deleteThread(threadId: string) {
    const confirmed = await confirm({
      title: "Delete thread?",
      message: "This removes the thread and its replies from the forum.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await apiSend<void>(`/api/discussions/thread/${threadId}`, "DELETE");
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      setHotThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      setUnreadThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      setMyThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      pushToast("Thread deleted.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Delete failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function moderateThread(threadId: string, patch: { isPinned?: boolean; isLocked?: boolean }) {
    try {
      await apiSend<ThreadSummary>(
        `/api/discussions/thread/${threadId}/moderation`,
        "PATCH",
        patch,
      );
      await loadThreads();
      await loadHotThreads();
      await loadCommunityData(false);
      pushToast("Thread updated.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Moderation failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function handleReportAction(
    report: ModeratorReport,
    patch: {
      status?: "Open" | "Resolved" | "Dismissed";
      resolution?: string;
      deleteTarget?: boolean;
      lockThread?: boolean;
    },
  ) {
    if (patch.deleteTarget) {
      const confirmed = await confirm({
        title: "Remove reported content?",
        message: "This hides the reported thread or reply and closes the report.",
        confirmLabel: "Remove",
        danger: true,
      });
      if (!confirmed) return;
    }

    try {
      await moderateReport(report.id, patch);
      await loadReportQueue();
      await loadThreads();
      await loadHotThreads();
      await loadCommunityData(false);
      pushToast("Report updated.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Report action failed");
      setActivityError(message);
      pushToast(message, "error");
    }
  }

  function updateThread(threadId: string, patch: Partial<ThreadSummary>) {
    const applyPatch = (items: ThreadSummary[]) =>
      items.map((thread) =>
        thread.id === threadId ? { ...thread, ...patch } : thread,
      );

    setThreads((prev) =>
      applyPatch(prev),
    );
    setHotThreads((prev) =>
      applyPatch(prev),
    );
    setMyThreads((prev) => applyPatch(prev));
    setUnreadThreads((prev) =>
      patch.isSubscribed === false || patch.hasUnread === false
        ? prev.filter((thread) => thread.id !== threadId)
        : applyPatch(prev),
    );
  }

  return (
    <div className="forumPage">
      <div className="forumBg" aria-hidden="true">
        <div className="forumSpeedLines" />
        <div className="forumHalftone" />
        <div className="forumInkWash" />
      </div>

      <AppNav active="forums" onLogout={onLogout} />

      <main className="forumMain">
        <div className="forumHeaderRow">
          <div>
            <h1 className="forumH1">Forums</h1>
            <div className="forumSub">Anime and episode threads from the community.</div>
          </div>
          <div className="forumHeaderActions">
            <button className="forumPillBtn" onClick={loadThreads} disabled={loading}>
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        <section className="forumHeroGrid">
          <div className="forumPanel forumCreatePanel">
            <div className="forumPanelTag">Start</div>
            <div className="forumFormGrid">
              <label>
                AniList ID
                <input
                  value={animeId}
                  onChange={(event) => setAnimeId(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label>
                Episode
                <input
                  value={episode}
                  onChange={(event) => setEpisode(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label>
                Category
                <select
                  value={threadCategory}
                  onChange={(event) => setThreadCategory(event.target.value)}
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tags
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="manga, finale"
                />
              </label>
            </div>

            <input
              className="forumTitleInput"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Thread title"
              maxLength={200}
            />

            <div className="forumComposerTabs">
              <button
                className={!preview ? "isActive" : ""}
                type="button"
                onClick={() => setPreview(false)}
              >
                Write
              </button>
              <button
                className={preview ? "isActive" : ""}
                type="button"
                onClick={() => setPreview(true)}
              >
                Preview
              </button>
              <label className="forumCheck">
                <input
                  type="checkbox"
                  checked={containsSpoilers}
                  onChange={(event) => setContainsSpoilers(event.target.checked)}
                />
                Spoilers
              </label>
            </div>

            {preview ? (
              <div
                className="forumMarkdownPreview"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
              />
            ) : (
              <textarea
                className="forumBodyInput"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write your post"
                maxLength={5000}
              />
            )}

            <button
              className="forumPrimaryBtn"
              onClick={createThread}
              disabled={creating || !title.trim() || !body.trim()}
            >
              {creating ? "Posting" : <><SendIcon size={16} /> Post thread</>}
            </button>
          </div>

          <div className="forumPanel forumHotPanel">
            <div className="forumPanelTag">This week</div>
            <h2 className="forumPanelTitle">Most discussed</h2>
            <div className="forumHotList">
              {hotThreads.length === 0 ? (
                <EmptyState
                  actionLabel="Refresh"
                  message="The community list will fill in as new threads get replies."
                  onAction={loadHotThreads}
                  title="No active threads yet"
                />
              ) : (
                hotThreads.map((thread) => (
                  <button
                    key={thread.id}
                    className="forumHotItem"
                    onClick={() => navigate(`/forums/thread/${thread.id}`)}
                  >
                    <span>{thread.title}</span>
                    <b>{thread.commentCount}</b>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        {activityError && <div className="forumError">{activityError}</div>}

        <section className="forumCommunityGrid">
          <div className="forumPanel forumActivityPanel">
            <div className="forumPanelTag">Watching</div>
            <h2 className="forumPanelTitle">Unread activity</h2>
            {activityLoading ? (
              <SkeletonBlock rows={3} />
            ) : (
              <MiniThreadList
                emptyMessage="Watched threads with new replies will appear here."
                onOpen={(thread) => navigate(`/forums/thread/${thread.id}`)}
                threads={unreadThreads}
              />
            )}
          </div>

          <div className="forumPanel forumActivityPanel">
            <div className="forumPanelTag">Mine</div>
            <h2 className="forumPanelTitle">My threads</h2>
            {activityLoading ? (
              <SkeletonBlock rows={3} />
            ) : (
              <MiniThreadList
                emptyMessage="Threads you start will appear here."
                onOpen={(thread) => navigate(`/forums/thread/${thread.id}`)}
                threads={myThreads}
              />
            )}
          </div>

          <div className="forumPanel forumActivityPanel">
            <div className="forumPanelTag">Replies</div>
            <h2 className="forumPanelTitle">My replies</h2>
            {activityLoading ? (
              <SkeletonBlock rows={3} />
            ) : (
              <MiniReplyList
                emptyMessage="Replies you post will appear here."
                onOpen={(reply) => navigate(`/forums/thread/${reply.threadId}`)}
                replies={myReplies}
              />
            )}
          </div>
        </section>

        {canModerate && (
          <section className="forumPanel forumQueuePanel">
            <div className="forumPanelTag">Moderate</div>
            <div className="forumQueueHead">
              <div>
                <h2 className="forumPanelTitle">Report queue</h2>
                <div className="forumThreadMeta">
                  <span>{reportQueue.length} visible</span>
                  {modLoading && <span>Refreshing</span>}
                </div>
              </div>
              <select
                value={reportStatus}
                onChange={(event) => setReportStatus(event.target.value)}
              >
                <option value="Open">Open</option>
                <option value="Resolved">Resolved</option>
                <option value="Dismissed">Dismissed</option>
                <option value="All">All</option>
              </select>
            </div>
            <ReportQueueList
              loading={modLoading}
              onDelete={(report) =>
                handleReportAction(report, {
                  status: "Resolved",
                  resolution: "Removed reported content.",
                  deleteTarget: true,
                })
              }
              onDismiss={(report) =>
                handleReportAction(report, {
                  status: "Dismissed",
                  resolution: "Dismissed by moderator.",
                })
              }
              onLock={(report) =>
                handleReportAction(report, {
                  status: "Resolved",
                  resolution: "Locked thread for review.",
                  lockThread: true,
                })
              }
              onOpen={(report) => navigate(`/forums/thread/${report.threadId}`)}
              onResolve={(report) =>
                handleReportAction(report, {
                  status: "Resolved",
                  resolution: "Handled by moderator.",
                })
              }
              reports={reportQueue}
            />
          </section>
        )}

        <section className="forumToolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runForumSearch();
            }}
            placeholder="Search discussions"
          />
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="active">Active</option>
            <option value="newest">Newest</option>
            <option value="mostReplies">Most replies</option>
            <option value="top">Top</option>
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="All">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runForumSearch();
            }}
            placeholder="Tag"
          />
          <button className="forumPrimaryBtn" onClick={runForumSearch} disabled={loading}>
            Search
          </button>
        </section>

        {error && threads.length > 0 && <div className="forumError">{error}</div>}

        <section className="forumThreadList">
          {loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <div className="forumPanel" key={index}>
                <SkeletonBlock rows={4} />
              </div>
            ))
          ) : error && threads.length === 0 ? (
            <EmptyState
              actionLabel="Retry"
              message={error}
              onAction={loadThreads}
              title="Could not load discussions"
            />
          ) : threads.length === 0 ? (
            <EmptyState
              actionLabel="Start a thread"
              message="Try a broader search or open the composer above to get the conversation moving."
              onAction={() => document.querySelector<HTMLInputElement>(".forumTitleInput")?.focus()}
              title="No matching threads"
            />
          ) : (
            threads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                canModerate={canModerate}
                onOpen={() => navigate(`/forums/thread/${thread.id}`)}
                onAnime={() => navigate(`/anime/${thread.aniListId}`)}
                onAuthor={() => navigate(`/users/${thread.authorUserId}`)}
                onReact={() => toggleReaction(thread.id)}
                onReport={() => reportThread(thread.id)}
                onSubscribe={() => toggleSubscription(thread)}
                onDelete={() => deleteThread(thread.id)}
                onPin={() => moderateThread(thread.id, { isPinned: !thread.isPinned })}
                onLock={() => moderateThread(thread.id, { isLocked: !thread.isLocked })}
              />
            ))
          )}
        </section>

        {pageInfo && pageInfo.lastPage !== 0 && (
          <div className="forumPager">
            <button
              className="forumTinyBtn"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={pageInfo.page <= 1}
            >
              Previous
            </button>
            <span>
              Page {pageInfo.page}
              {pageInfo.lastPage ? ` of ${pageInfo.lastPage}` : ""}
            </span>
            <button
              className="forumTinyBtn"
              onClick={() => setPage((value) => value + 1)}
              disabled={!pageInfo.hasNextPage}
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function ThreadCard({
  thread,
  canModerate,
  onOpen,
  onAnime,
  onAuthor,
  onReact,
  onReport,
  onSubscribe,
  onDelete,
  onPin,
  onLock,
}: {
  thread: ThreadSummary;
  canModerate: boolean;
  onOpen: () => void;
  onAnime: () => void;
  onAuthor: () => void;
  onReact: () => void;
  onReport: () => void;
  onSubscribe: () => void;
  onDelete: () => void;
  onPin: () => void;
  onLock: () => void;
}) {
  return (
    <article className="forumThreadCard">
      <button className="forumThreadMain" onClick={onOpen}>
        <div className="forumThreadBadges">
          {thread.hasUnread && <span>{thread.unreadCount} new</span>}
          {thread.isPinned && <span>Pinned</span>}
          {thread.isLocked && <span>Locked</span>}
          {thread.containsSpoilers && <span>Spoilers</span>}
          <span>{thread.category}</span>
        </div>
        <h2>{thread.title}</h2>
        <div className="forumThreadMeta">
          <span>{thread.commentCount} replies</span>
          <span>{thread.reactionCount} reactions</span>
          <span>Active {formatDate(thread.lastActivityUtc ?? thread.createdUtc)}</span>
        </div>
        <div className="forumTagRow">
          {thread.tags.map((item) => (
            <span key={item}>#{item}</span>
          ))}
        </div>
      </button>

      <div className="forumThreadSide">
        <button className="forumAuthor" onClick={onAuthor}>
          <Avatar name={thread.authorDisplayName} url={thread.authorAvatarUrl} />
          <span>{thread.authorDisplayName}</span>
        </button>
        <button className="forumTinyBtn" onClick={onAnime}>
          Anime {thread.aniListId}
        </button>
        <button
          className={"forumTinyBtn" + (thread.userReaction ? " isActive" : "")}
          onClick={onReact}
        >
          Upvote {thread.reactionCount}
        </button>
        <button className="forumTinyBtn" onClick={onReport}>
          Report
        </button>
        <button
          className={"forumTinyBtn" + (thread.isSubscribed ? " isActive" : "")}
          onClick={onSubscribe}
        >
          {thread.isSubscribed ? "Watching" : "Watch"}
        </button>
        {thread.canDelete && (
          <button className="forumTinyBtn danger" onClick={onDelete}>
            <TrashIcon size={15} /> Delete
          </button>
        )}
        {canModerate && (
          <div className="forumModRow">
            <button className="forumTinyBtn" onClick={onPin}>
              {thread.isPinned ? "Unpin" : "Pin"}
            </button>
            <button className="forumTinyBtn" onClick={onLock}>
              {thread.isLocked ? "Unlock" : "Lock"}
            </button>
            {thread.reportCount > 0 && <span>{thread.reportCount} reports</span>}
          </div>
        )}
      </div>
    </article>
  );
}

function MiniThreadList({
  threads,
  emptyMessage,
  onOpen,
}: {
  threads: ThreadSummary[];
  emptyMessage: string;
  onOpen: (thread: ThreadSummary) => void;
}) {
  if (threads.length === 0) {
    return <div className="forumMiniEmpty">{emptyMessage}</div>;
  }

  return (
    <div className="forumMiniList">
      {threads.map((thread) => (
        <button key={thread.id} className="forumMiniItem" onClick={() => onOpen(thread)}>
          <span>{thread.title}</span>
          <small>
            {thread.hasUnread ? `${thread.unreadCount} new - ` : ""}
            {thread.commentCount} replies
          </small>
        </button>
      ))}
    </div>
  );
}

function MiniReplyList({
  replies,
  emptyMessage,
  onOpen,
}: {
  replies: ForumReplyActivity[];
  emptyMessage: string;
  onOpen: (reply: ForumReplyActivity) => void;
}) {
  if (replies.length === 0) {
    return <div className="forumMiniEmpty">{emptyMessage}</div>;
  }

  return (
    <div className="forumMiniList">
      {replies.map((reply) => (
        <button key={reply.id} className="forumMiniItem" onClick={() => onOpen(reply)}>
          <span>{reply.threadTitle}</span>
          <small>{shortText(reply.body, 72)}</small>
        </button>
      ))}
    </div>
  );
}

function ReportQueueList({
  reports,
  loading,
  onOpen,
  onResolve,
  onDismiss,
  onDelete,
  onLock,
}: {
  reports: ModeratorReport[];
  loading: boolean;
  onOpen: (report: ModeratorReport) => void;
  onResolve: (report: ModeratorReport) => void;
  onDismiss: (report: ModeratorReport) => void;
  onDelete: (report: ModeratorReport) => void;
  onLock: (report: ModeratorReport) => void;
}) {
  if (loading && reports.length === 0) {
    return <SkeletonBlock rows={4} />;
  }

  if (reports.length === 0) {
    return <div className="forumMiniEmpty">No reports match this view.</div>;
  }

  return (
    <div className="forumReportList">
      {reports.map((report) => (
        <article key={report.id} className="forumReportItem">
          <button className="forumReportMain" onClick={() => onOpen(report)}>
            <div className="forumThreadBadges">
              <span>{report.status}</span>
              <span>{report.targetType}</span>
              {report.openTargetReportCount > 1 && (
                <span>{report.openTargetReportCount} open reports</span>
              )}
              {report.targetDeleted && <span>Hidden</span>}
            </div>
            <h3>{report.threadTitle}</h3>
            <p>{report.excerpt || report.reason}</p>
            <small>
              Reported by {report.reporterDisplayName} - {formatDate(report.createdUtc)}
            </small>
          </button>
          <div className="forumReportActions">
            {report.status === "Open" ? (
              <>
                <button className="forumTinyBtn" onClick={() => onResolve(report)}>
                  Resolve
                </button>
                <button className="forumTinyBtn" onClick={() => onDismiss(report)}>
                  Dismiss
                </button>
                <button className="forumTinyBtn" onClick={() => onLock(report)}>
                  Lock
                </button>
                <button className="forumTinyBtn danger" onClick={() => onDelete(report)}>
                  Hide
                </button>
              </>
            ) : (
              <small>{report.resolution ?? "Closed"}</small>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function Avatar({ name, url }: { name: string; url?: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return url ? (
    <span
      className="forumAvatar"
      style={{ backgroundImage: `url(${url})` }}
      aria-hidden="true"
    />
  ) : (
    <span className="forumAvatar" aria-hidden="true">
      {initial}
    </span>
  );
}

function shortText(value: string, maxLength: number) {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3).trim()}...`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
