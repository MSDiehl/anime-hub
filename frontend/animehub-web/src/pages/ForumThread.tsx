import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend, setThreadSubscription } from "../api/client";
import AppNav from "../components/AppNav";
import { EmptyState, SkeletonBlock, useConfirm, useTextPrompt, useToast } from "../components/Feedback";
import { SendIcon, TrashIcon } from "../components/Icons";
import { getErrorMessage } from "../utils/apiError";
import { renderMarkdown } from "../utils/markdown";
import { Avatar } from "./Forums";
import "./Forums.css";

type Props = {
  onLogout: () => void | Promise<void>;
};

type CommentDto = {
  id: string;
  threadId: string;
  body: string;
  createdUtc: string;
  updatedUtc?: string | null;
  isDeleted: boolean;
  authorUserId: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  reactionCount: number;
  userReaction?: string | null;
  reportCount: number;
  canEdit: boolean;
  canDelete: boolean;
};

type ThreadDetail = {
  id: string;
  aniListId: number;
  episodeNumber?: number | null;
  title: string;
  body: string;
  category: string;
  tags: string[];
  containsSpoilers: boolean;
  isPinned: boolean;
  isLocked: boolean;
  isDeleted: boolean;
  createdUtc: string;
  updatedUtc?: string | null;
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
  comments: CommentDto[];
};

type ReactionResult = {
  count: number;
  userReaction?: string | null;
};

export default function ForumThread({ onLogout }: Props) {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { requestText } = useTextPrompt();
  const { pushToast } = useToast();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyPreview, setReplyPreview] = useState(false);
  const [posting, setPosting] = useState(false);
  const [spoilersRevealed, setSpoilersRevealed] = useState(false);
  const [editingThread, setEditingThread] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("General");
  const [editTags, setEditTags] = useState("");
  const [editSpoilers, setEditSpoilers] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");

  async function loadThread(showLoading = true) {
    if (!threadId) return;

    if (showLoading) setLoading(true);
    setError(null);
    try {
      setThread(await apiGet<ThreadDetail>(`/api/discussions/thread/${threadId}`));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load thread"));
      setThread(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  function beginThreadEdit() {
    if (!thread) return;
    setEditTitle(thread.title);
    setEditBody(thread.body);
    setEditCategory(thread.category);
    setEditTags(thread.tags.join(", "));
    setEditSpoilers(thread.containsSpoilers);
    setEditingThread(true);
  }

  async function saveThread() {
    if (!thread) return;

    setError(null);
    try {
      await apiSend<ThreadDetail>(
        `/api/discussions/thread/${thread.id}`,
        "PATCH",
        {
          title: editTitle,
          body: editBody,
          category: editCategory,
          tags: editTags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          containsSpoilers: editSpoilers,
        },
      );
      setEditingThread(false);
      await loadThread();
      pushToast("Thread saved.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to save thread");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function deleteThread() {
    if (!thread) return;
    const confirmed = await confirm({
      title: "Delete thread?",
      message: "This removes the thread and its replies from the forum.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;

    setError(null);
    try {
      await apiSend<void>(`/api/discussions/thread/${thread.id}`, "DELETE");
      pushToast("Thread deleted.", "success");
      navigate("/forums");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Delete failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function moderateThread(patch: { isPinned?: boolean; isLocked?: boolean }) {
    if (!thread) return;

    setError(null);
    try {
      await apiSend<ThreadDetail>(`/api/discussions/thread/${thread.id}/moderation`, "PATCH", patch);
      await loadThread();
      pushToast("Thread updated.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Moderation failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function reportThread() {
    if (!thread) return;
    const reason = await requestText({
      title: "Report thread",
      message: "Tell moderators what needs attention.",
      placeholder: "Reason",
      confirmLabel: "Send report",
      required: true,
    });
    if (reason === null) return;

    setError(null);
    try {
      await apiSend<void>(`/api/discussions/thread/${thread.id}/reports`, "POST", { reason });
      pushToast("Report sent.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Report failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function toggleSubscription() {
    if (!thread) return;

    try {
      const result = await setThreadSubscription(thread.id, !thread.isSubscribed);
      setThread({
        ...thread,
        isSubscribed: result.isSubscribed,
        hasUnread: false,
        unreadCount: 0,
      });
      pushToast(result.isSubscribed ? "Thread watched." : "Thread unwatched.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Could not update watch state");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function toggleThreadReaction() {
    if (!thread) return;

    try {
      const json = await apiSend<ReactionResult>(
        `/api/discussions/thread/${thread.id}/reactions`,
        "POST",
        { type: "upvote" },
      );
      setThread({
        ...thread,
        reactionCount: json.count,
        userReaction: json.userReaction ?? null,
      });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Reaction failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function postReply() {
    if (!thread || !reply.trim()) return;

    const body = reply.trim();
    const previousThread = thread;
    const optimisticComment: CommentDto = {
      id: `optimistic-${Date.now()}`,
      threadId: thread.id,
      body,
      createdUtc: new Date().toISOString(),
      isDeleted: false,
      authorUserId: "me",
      authorDisplayName: "You",
      reactionCount: 0,
      userReaction: null,
      reportCount: 0,
      canEdit: false,
      canDelete: false,
    };

    setPosting(true);
    setError(null);
    setReply("");
    setReplyPreview(false);
    setThread({
      ...thread,
      commentCount: thread.commentCount + 1,
      comments: [...thread.comments, optimisticComment],
    });

    try {
      await apiSend<{ id: string }>(`/api/discussions/thread/${thread.id}/comments`, "POST", { body });
      await loadThread(false);
      pushToast("Reply posted.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to post reply");
      setThread(previousThread);
      setReply(body);
      setError(message);
      pushToast(message, "error");
    } finally {
      setPosting(false);
    }
  }

  async function toggleCommentReaction(commentId: string) {
    if (!thread) return;

    try {
      const json = await apiSend<ReactionResult>(
        `/api/discussions/comments/${commentId}/reactions`,
        "POST",
        { type: "upvote" },
      );
      setThread({
        ...thread,
        comments: thread.comments.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                reactionCount: json.count,
                userReaction: json.userReaction ?? null,
              }
            : comment,
          ),
      });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Reaction failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function reportComment(commentId: string) {
    const reason = await requestText({
      title: "Report reply",
      message: "Tell moderators what needs attention.",
      placeholder: "Reason",
      confirmLabel: "Send report",
      required: true,
    });
    if (reason === null) return;

    try {
      await apiSend<void>(`/api/discussions/comments/${commentId}/reports`, "POST", { reason });
      pushToast("Report sent.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Report failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  function beginCommentEdit(comment: CommentDto) {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
  }

  async function saveComment(commentId: string) {
    setError(null);
    try {
      await apiSend<{ id: string }>(
        `/api/discussions/comments/${commentId}`,
        "PATCH",
        { body: editingCommentBody },
      );
      setEditingCommentId(null);
      setEditingCommentBody("");
      await loadThread();
      pushToast("Reply saved.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to save reply");
      setError(message);
      pushToast(message, "error");
    }
  }

  async function deleteComment(commentId: string) {
    const confirmed = await confirm({
      title: "Delete reply?",
      message: "This removes the reply from the thread.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await apiSend<void>(`/api/discussions/comments/${commentId}`, "DELETE");
      await loadThread();
      pushToast("Reply deleted.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Delete failed");
      setError(message);
      pushToast(message, "error");
    }
  }

  return (
    <div className="forumPage">
      <div className="forumBg" aria-hidden="true">
        <div className="forumSpeedLines" />
        <div className="forumHalftone" />
        <div className="forumInkWash" />
      </div>

      <AppNav active="forums" onLogout={onLogout} />

      <main className="forumMain narrow">
        {loading ? (
          <div className="forumPanel forumState">
            <SkeletonBlock rows={5} />
          </div>
        ) : error && !thread ? (
          <div className="forumPanel forumState">
            <EmptyState
              actionLabel="Back to forums"
              message={error}
              onAction={() => navigate("/forums")}
              title="Could not load thread"
            />
          </div>
        ) : !thread ? (
          <div className="forumPanel forumState">
            <EmptyState
              actionLabel="Back to forums"
              message="The thread may have been deleted or moved."
              onAction={() => navigate("/forums")}
              title="Thread not found"
            />
          </div>
        ) : (
          <>
            <section className="forumPanel forumThreadDetail">
              <div className="forumPanelTag">Thread</div>
              <div className="forumThreadDetailHead">
                <button
                  className="forumAuthor"
                  onClick={() => navigate(`/users/${thread.authorUserId}`)}
                >
                  <Avatar name={thread.authorDisplayName} url={thread.authorAvatarUrl} />
                  <span>{thread.authorDisplayName}</span>
                </button>
                <button
                  className="forumTinyBtn"
                  onClick={() => navigate(`/anime/${thread.aniListId}`)}
                >
                  Anime {thread.aniListId}
                </button>
              </div>

              {editingThread ? (
                <div className="forumEditBox">
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    maxLength={200}
                  />
                  <div className="forumFormGrid">
                    <label>
                      Category
                      <input
                        value={editCategory}
                        onChange={(event) => setEditCategory(event.target.value)}
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Tags
                      <input
                        value={editTags}
                        onChange={(event) => setEditTags(event.target.value)}
                      />
                    </label>
                    <label className="forumCheck">
                      <input
                        type="checkbox"
                        checked={editSpoilers}
                        onChange={(event) => setEditSpoilers(event.target.checked)}
                      />
                      Spoilers
                    </label>
                  </div>
                  <textarea
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    maxLength={5000}
                  />
                  <div className="forumActionRow">
                    <button className="forumPrimaryBtn" onClick={saveThread}>
                      Save
                    </button>
                    <button className="forumTinyBtn" onClick={() => setEditingThread(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="forumThreadBadges">
                    {thread.isPinned && <span>Pinned</span>}
                    {thread.isLocked && <span>Locked</span>}
                    {thread.containsSpoilers && <span>Spoilers</span>}
                    {thread.episodeNumber && <span>Episode {thread.episodeNumber}</span>}
                    <span>{thread.category}</span>
                  </div>
                  <h1 className="forumThreadTitle">{thread.title}</h1>
                  <div className="forumThreadMeta">
                    <span>{formatDate(thread.createdUtc)}</span>
                    <span>{thread.commentCount} replies</span>
                    <span>{thread.reactionCount} reactions</span>
                  </div>
                  <div className="forumTagRow">
                    {thread.tags.map((item) => (
                      <span key={item}>#{item}</span>
                    ))}
                  </div>

                  {thread.containsSpoilers && !spoilersRevealed ? (
                    <div className="forumSpoilerGate">
                      <b>Spoiler thread</b>
                      <button
                        className="forumPrimaryBtn"
                        onClick={() => setSpoilersRevealed(true)}
                      >
                        Reveal
                      </button>
                    </div>
                  ) : (
                    <div
                      className="forumMarkdown"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(thread.body) }}
                    />
                  )}

                  <div className="forumActionRow">
                    <button
                      className={"forumTinyBtn" + (thread.userReaction ? " isActive" : "")}
                      onClick={toggleThreadReaction}
                    >
                      Upvote {thread.reactionCount}
                    </button>
                    <button className="forumTinyBtn" onClick={reportThread}>
                      Report
                    </button>
                    <button
                      className={"forumTinyBtn" + (thread.isSubscribed ? " isActive" : "")}
                      onClick={toggleSubscription}
                    >
                      {thread.isSubscribed ? "Watching" : "Watch"}
                    </button>
                    {thread.canEdit && (
                      <button className="forumTinyBtn" onClick={beginThreadEdit}>
                        Edit
                      </button>
                    )}
                    {thread.canDelete && (
                      <button className="forumTinyBtn danger" onClick={deleteThread}>
                        <TrashIcon size={15} /> Delete
                      </button>
                    )}
                    {thread.canModerate && (
                      <>
                        <button
                          className="forumTinyBtn"
                          onClick={() => moderateThread({ isPinned: !thread.isPinned })}
                        >
                          {thread.isPinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          className="forumTinyBtn"
                          onClick={() => moderateThread({ isLocked: !thread.isLocked })}
                        >
                          {thread.isLocked ? "Unlock" : "Lock"}
                        </button>
                        {thread.reportCount > 0 && <span>{thread.reportCount} reports</span>}
                      </>
                    )}
                  </div>
                </>
              )}
            </section>

            {error && <div className="forumError">{error}</div>}

            <section className="forumPanel forumReplyPanel">
              <div className="forumPanelTag">Reply</div>
              {thread.isLocked && !thread.canModerate ? (
                <EmptyState
                  message="Moderators have closed new replies for this conversation."
                  title="This thread is locked"
                />
              ) : (
                <>
                  <div className="forumComposerTabs">
                    <button
                      className={!replyPreview ? "isActive" : ""}
                      onClick={() => setReplyPreview(false)}
                      type="button"
                    >
                      Write
                    </button>
                    <button
                      className={replyPreview ? "isActive" : ""}
                      onClick={() => setReplyPreview(true)}
                      type="button"
                    >
                      Preview
                    </button>
                  </div>
                  {replyPreview ? (
                    <div
                      className="forumMarkdownPreview"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(reply) }}
                    />
                  ) : (
                    <textarea
                      className="forumBodyInput"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      maxLength={3000}
                    />
                  )}
                  <button
                    className="forumPrimaryBtn"
                    onClick={postReply}
                    disabled={posting || !reply.trim()}
                  >
                    {posting ? "Posting" : <><SendIcon size={16} /> Post reply</>}
                  </button>
                </>
              )}
            </section>

            <section className="forumComments">
              {thread.comments.length === 0 ? (
                <div className="forumPanel forumState">
                  <EmptyState
                    actionLabel="Write a reply"
                    message="Be the first person to add to this thread."
                    onAction={() => document.querySelector<HTMLTextAreaElement>(".forumBodyInput")?.focus()}
                    title="No replies yet"
                  />
                </div>
              ) : (
                thread.comments.map((comment) => (
                  <article key={comment.id} className="forumPanel forumComment">
                    <div className="forumCommentHead">
                      <button
                        className="forumAuthor"
                        onClick={() => navigate(`/users/${comment.authorUserId}`)}
                      >
                        <Avatar name={comment.authorDisplayName} url={comment.authorAvatarUrl} />
                        <span>{comment.authorDisplayName}</span>
                      </button>
                      <span>{formatDate(comment.createdUtc)}</span>
                    </div>

                    {comment.isDeleted ? (
                      <div className="forumDeleted">Deleted reply.</div>
                    ) : editingCommentId === comment.id ? (
                      <div className="forumEditBox">
                        <textarea
                          value={editingCommentBody}
                          onChange={(event) => setEditingCommentBody(event.target.value)}
                          maxLength={3000}
                        />
                        <div className="forumActionRow">
                          <button
                            className="forumPrimaryBtn"
                            onClick={() => saveComment(comment.id)}
                          >
                            Save
                          </button>
                          <button
                            className="forumTinyBtn"
                            onClick={() => setEditingCommentId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="forumMarkdown"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }}
                      />
                    )}

                    {!comment.isDeleted && (
                      <div className="forumActionRow">
                        <button
                          className={"forumTinyBtn" + (comment.userReaction ? " isActive" : "")}
                          onClick={() => toggleCommentReaction(comment.id)}
                        >
                          Upvote {comment.reactionCount}
                        </button>
                        <button className="forumTinyBtn" onClick={() => reportComment(comment.id)}>
                          Report
                        </button>
                        {comment.canEdit && (
                          <button
                            className="forumTinyBtn"
                            onClick={() => beginCommentEdit(comment)}
                          >
                            Edit
                          </button>
                        )}
                        {comment.canDelete && (
                          <button
                            className="forumTinyBtn danger"
                            onClick={() => deleteComment(comment.id)}
                          >
                            <TrashIcon size={15} /> Delete
                          </button>
                        )}
                        {thread.canModerate && comment.reportCount > 0 && (
                          <span>{comment.reportCount} reports</span>
                        )}
                      </div>
                    )}
                  </article>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
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
