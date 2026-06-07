import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { csrfFetch } from "../api/csrf";
import AppNav from "../components/AppNav";
import { CoverFallback, EmptyState, SkeletonBlock, useConfirm, useToast } from "../components/Feedback";
import { TrashIcon } from "../components/Icons";
import { getErrorMessage, readApiError } from "../utils/apiError";
import { Avatar } from "./Forums";
import "./Forums.css";

type Props = {
  onLogout: () => void | Promise<void>;
};

type Me = {
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isProfilePublic?: boolean;
};

type UserProfileDto = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  isProfilePublic: boolean;
  threadCount: number;
  commentCount: number;
  recentThreads: UserThread[];
  favorites: UserFavorite[];
};

type UserThread = {
  id: string;
  aniListId: number;
  episodeNumber?: number | null;
  title: string;
  category: string;
  containsSpoilers: boolean;
  isPinned: boolean;
  isLocked: boolean;
  createdUtc: string;
  lastActivityUtc?: string | null;
  commentCount: number;
  reactionCount: number;
};

type UserFavorite = {
  aniListId: number;
  title: string;
  coverImageUrl?: string | null;
  format?: string | null;
  averageScore?: number | null;
};

export default function UserProfile({ onLogout }: Props) {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { pushToast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isProfilePublic, setIsProfilePublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  const isMe = !!me?.id && !!profile?.id && me.id === profile.id;

  async function load() {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const [meRes, profileRes] = await Promise.all([
        csrfFetch("/api/auth/me", { credentials: "include" }),
        csrfFetch(`/api/users/${userId}`, { credentials: "include" }),
      ]);

      if (meRes.ok) setMe((await meRes.json()) as Me);
      if (!profileRes.ok) {
        throw new Error(await readApiError(profileRes, "Failed to load profile"));
      }

      const json = (await profileRes.json()) as UserProfileDto;
      setProfile(json);
      setDisplayName(json.displayName);
      setAvatarUrl(json.avatarUrl ?? "");
      setIsProfilePublic(json.isProfilePublic);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load profile"));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function saveProfile() {
    setSaving(true);
    setError(null);

    try {
      const res = await csrfFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName,
          avatarUrl,
          isProfilePublic,
        }),
      });

      if (!res.ok) throw new Error(await readApiError(res, "Failed to save profile"));
      await load();
      pushToast("Profile saved.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to save profile");
      setError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setSaving(true);
    setError(null);
    setAccountNotice(null);

    try {
      const res = await csrfFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) throw new Error(await readApiError(res, "Failed to change password"));
      setCurrentPassword("");
      setNewPassword("");
      setAccountNotice("Password changed.");
      pushToast("Password changed.", "success");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to change password");
      setError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    const confirmed = await confirm({
      title: "Delete account?",
      message: "This permanently deletes your account and cannot be undone.",
      confirmLabel: "Delete account",
      danger: true,
    });
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setAccountNotice(null);

    try {
      const res = await csrfFetch("/api/auth/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deletePassword }),
      });

      if (!res.ok) throw new Error(await readApiError(res, "Failed to delete account"));
      pushToast("Account deleted.", "success");
      await onLogout();
      navigate("/");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Failed to delete account");
      setError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="forumPage">
      <div className="forumBg" aria-hidden="true">
        <div className="forumSpeedLines" />
        <div className="forumHalftone" />
        <div className="forumInkWash" />
      </div>

      <AppNav onLogout={onLogout} />

      <main className="forumMain narrow">
        {loading ? (
          <div className="forumPanel forumState">
            <SkeletonBlock rows={5} />
          </div>
        ) : error && !profile ? (
          <div className="forumPanel forumState">
            <EmptyState
              actionLabel="Back to dashboard"
              message={error}
              onAction={() => navigate("/dashboard")}
              title="Could not load profile"
            />
          </div>
        ) : !profile ? (
          <div className="forumPanel forumState">
            <EmptyState
              actionLabel="Back to dashboard"
              message="The profile may be private or unavailable."
              onAction={() => navigate("/dashboard")}
              title="Profile not found"
            />
          </div>
        ) : (
          <>
            <section className="forumPanel forumProfileHero">
              <div className="forumPanelTag">Profile</div>
              <Avatar name={profile.displayName} url={profile.avatarUrl} />
              <div>
                <h1 className="forumH1">{profile.displayName}</h1>
                <div className="forumThreadMeta">
                  <span>{profile.threadCount} threads</span>
                  <span>{profile.commentCount} replies</span>
                  <span>{profile.favorites.length} favorites shown</span>
                </div>
              </div>
            </section>

            {isMe && (
              <section className="forumPanel forumProfileEdit">
                <div className="forumPanelTag">Edit</div>
                <label>
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={80}
                  />
                </label>
                <label>
                  Avatar URL
                  <input
                    value={avatarUrl}
                    onChange={(event) => setAvatarUrl(event.target.value)}
                    maxLength={1000}
                  />
                </label>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={isProfilePublic}
                      onChange={(event) => setIsProfilePublic(event.target.checked)}
                    />{" "}
                    Public profile
                  </span>
                </label>
                <button className="forumPrimaryBtn" onClick={saveProfile} disabled={saving}>
                  {saving ? "Saving" : "Save profile"}
                </button>

                <div className="forumPanelTag">Security</div>
                <label>
                  Current password
                  <input
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  New password
                  <input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
                <button
                  className="forumPrimaryBtn"
                  onClick={changePassword}
                  disabled={saving || !currentPassword || !newPassword}
                >
                  Change password
                </button>

                <div className="forumPanelTag">Delete</div>
                <label>
                  Password
                  <input
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                <button
                  className="forumTinyBtn danger"
                  onClick={deleteAccount}
                  disabled={saving || !deletePassword}
                >
                  <TrashIcon size={15} /> Delete account
                </button>
                {accountNotice && (
                  <EmptyState
                    message={accountNotice}
                    title="Account updated"
                  />
                )}
              </section>
            )}

            {error && <div className="forumError">{error}</div>}

            <section className="forumProfileGrid">
              <div className="forumPanel">
                <div className="forumPanelTag">Posts</div>
                <h2 className="forumPanelTitle">Recent threads</h2>
                <div className="forumProfileList">
                  {profile.recentThreads.length === 0 ? (
                    <EmptyState
                      actionLabel="Open forums"
                      message="Start a public conversation to make it show up here."
                      onAction={() => navigate("/forums")}
                      title="No threads yet"
                    />
                  ) : (
                    profile.recentThreads.map((thread) => (
                      <button
                        key={thread.id}
                        className="forumProfileThread"
                        onClick={() => navigate(`/forums/thread/${thread.id}`)}
                      >
                        <span>{thread.title}</span>
                        <small>
                          {thread.category} - {thread.commentCount} replies -{" "}
                          {formatDate(thread.lastActivityUtc ?? thread.createdUtc)}
                        </small>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="forumPanel">
                <div className="forumPanelTag">Favorites</div>
                <h2 className="forumPanelTitle">Tracked favorites</h2>
                <div className="forumFavoriteGrid">
                  {profile.favorites.length === 0 ? (
                    <EmptyState
                      actionLabel={isMe ? "Open dashboard" : "Browse search"}
                      message={
                        isMe
                          ? "Favorite tracked shows from your dashboard to pin them here."
                          : "This profile has no public favorites yet."
                      }
                      onAction={() => navigate(isMe ? "/dashboard" : "/search")}
                      title="No favorites yet"
                    />
                  ) : (
                    profile.favorites.map((favorite) => (
                      <button
                        key={favorite.aniListId}
                        className="forumFavoriteCard"
                        onClick={() => navigate(`/anime/${favorite.aniListId}`)}
                      >
                        <span
                          className="forumFavoriteCover"
                          style={{
                            backgroundImage: favorite.coverImageUrl
                              ? `url(${favorite.coverImageUrl})`
                              : undefined,
                          }}
                        >
                          {!favorite.coverImageUrl && <CoverFallback label="No cover" />}
                        </span>
                        <b>{favorite.title}</b>
                        <small>
                          {favorite.format ?? "Anime"} - {favorite.averageScore ?? "No score"}
                        </small>
                      </button>
                    ))
                  )}
                </div>
              </div>
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
