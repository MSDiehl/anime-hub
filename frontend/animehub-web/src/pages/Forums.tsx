import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getForumThreads,
  getMostDiscussed,
  type ForumThreadSummary,
  type PagedResult,
} from "../api/client";
import { csrfFetch } from "../api/csrf";
import AppNav from "../components/AppNav";
import { EmptyState, SkeletonBlock, useConfirm, useTextPrompt, useToast } from "../components/Feedback";
import { SendIcon, TrashIcon } from "../components/Icons";
import { getErrorMessage, readApiError } from "../utils/apiError";
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
  const [pageInfo, setPageInfo] = useState<PagedResult<ThreadSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("active");
  const [category, setCategory] = useState("All");
  const [tag, setTag] = useState("");

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
    () => threads.some((thread) => thread.canModerate),
    [threads],
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

  useEffect(() => {
    loadThreads();
    loadHotThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, category, page]);

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
      const res = await csrfFetch(`/api/discussions/anime/${parsedAnimeId}${episodeQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          body,
          category: threadCategory,
          tags: tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          containsSpoilers,
        }),
      });

      if (!res.ok) throw new Error(await readApiError(res, "Failed to create thread"));

      const json = (await res.json()) as CreateResult;
      setAnimeId("");
      setEpisode("");
      setTitle("");
      setBody("");
      setTags("");
      setContainsSpoilers(false);
      setPreview(false);
      await loadHotThreads();
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
      const res = await csrfFetch(`/api/discussions/thread/${threadId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "upvote" }),
      });

      if (!res.ok) throw new Error(await readApiError(res, "Reaction failed"));
      const json = (await res.json()) as ReactionResult;
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
      const res = await csrfFetch(`/api/discussions/thread/${threadId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Report failed"));
      pushToast("Report sent.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Report failed");
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
      const res = await csrfFetch(`/api/discussions/thread/${threadId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiError(res, "Delete failed"));
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      setHotThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      pushToast("Thread deleted.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Delete failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function moderateThread(threadId: string, patch: { isPinned?: boolean; isLocked?: boolean }) {
    try {
      const res = await csrfFetch(`/api/discussions/thread/${threadId}/moderation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Moderation failed"));
      await loadThreads();
      await loadHotThreads();
      pushToast("Thread updated.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Moderation failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  function updateThread(threadId: string, patch: Partial<ThreadSummary>) {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId ? { ...thread, ...patch } : thread,
      ),
    );
    setHotThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId ? { ...thread, ...patch } : thread,
      ),
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

        {error && <div className="forumError">{error}</div>}

        <section className="forumThreadList">
          {loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <div className="forumPanel" key={index}>
                <SkeletonBlock rows={4} />
              </div>
            ))
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
  onDelete: () => void;
  onPin: () => void;
  onLock: () => void;
}) {
  return (
    <article className="forumThreadCard">
      <button className="forumThreadMain" onClick={onOpen}>
        <div className="forumThreadBadges">
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

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
