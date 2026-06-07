import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../api/client";
import AppNav from "../components/AppNav";
import { CoverFallback, EmptyState, SkeletonBlock, useConfirm, useToast } from "../components/Feedback";
import { TrashIcon } from "../components/Icons";
import { getErrorMessage } from "../utils/apiError";
import { Avatar } from "./Forums";
import "./Dashboard.css";
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
  stats: UserProfileStats;
  shelves: UserShelf[];
  recentActivity: UserActivity[];
  recentThreads: UserThread[];
  favorites: UserFavorite[];
};

type UserProfileStats = {
  trackedCount: number;
  watchingCount: number;
  completedCount: number;
  planToWatchCount: number;
  favoriteCount: number;
  episodesWatched: number;
  averageRating?: number | null;
  topGenres: string[];
};

type UserShelf = {
  name: string;
  kind: string;
  items: UserFavorite[];
};

type UserActivity = {
  type: string;
  title: string;
  occurredUtc: string;
  aniListId?: number | null;
  threadId?: string | null;
  coverImageUrl?: string | null;
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
  personalRating?: number | null;
  trackingStatus: string;
  customListName?: string | null;
  userTags: string[];
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
      const [currentUser, json] = await Promise.all([
        apiGet<Me>("/api/auth/me").catch(() => null),
        apiGet<UserProfileDto>(`/api/users/${userId}`),
      ]);

      setMe(currentUser);
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
      await apiSend<Me>("/api/auth/me", "PATCH", {
        displayName,
        avatarUrl,
        isProfilePublic,
      });
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
      await apiSend<void>("/api/auth/change-password", "POST", { currentPassword, newPassword });
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
      await apiSend<void>("/api/auth/me", "DELETE", { password: deletePassword });
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
                  <span>{profile.stats.trackedCount} tracked</span>
                  <span>{profile.threadCount} threads</span>
                  <span>{profile.commentCount} replies</span>
                  <span>{profile.stats.episodesWatched} episodes</span>
                </div>
              </div>
            </section>

            <section className="forumPanel">
              <div className="forumPanelTag">Stats</div>
              <div className="dashStatsRow" aria-label="Shared profile stats">
                <ProfileStat label="Watching" value={profile.stats.watchingCount} />
                <ProfileStat label="Completed" value={profile.stats.completedCount} />
                <ProfileStat label="Plan" value={profile.stats.planToWatchCount} />
                <ProfileStat label="Favorites" value={profile.stats.favoriteCount} />
                <ProfileStat label="Avg" value={profile.stats.averageRating ?? "—"} />
              </div>
              {profile.stats.topGenres.length > 0 && (
                <div className="forumTagRow">
                  {profile.stats.topGenres.map((genre) => (
                    <span key={genre}>#{genre}</span>
                  ))}
                </div>
              )}
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
                <div className="forumPanelTag">Activity</div>
                <h2 className="forumPanelTitle">Recent activity</h2>
                <div className="forumProfileList">
                  {profile.recentActivity.length === 0 ? (
                    <EmptyState
                      message="Track shows or join discussions to build an activity trail."
                      title="No recent activity"
                    />
                  ) : (
                    profile.recentActivity.map((activity, index) => (
                      <button
                        key={`${activity.type}-${activity.title}-${index}`}
                        className="forumProfileThread"
                        onClick={() => {
                          if (activity.threadId) navigate(`/forums/thread/${activity.threadId}`);
                          else if (activity.aniListId) navigate(`/anime/${activity.aniListId}`);
                        }}
                      >
                        <span>{activityLabel(activity.type)} · {activity.title}</span>
                        <small>{formatDate(activity.occurredUtc)}</small>
                      </button>
                    ))
                  )}
                </div>
              </div>

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
            </section>

            <section className="forumPanel">
              <div className="forumPanelTag">Shelves</div>
              <h2 className="forumPanelTitle">Shared anime shelves</h2>
              {profile.shelves.length === 0 ? (
                <EmptyState
                  actionLabel={isMe ? "Open dashboard" : "Browse search"}
                  message={
                    isMe
                      ? "Add custom list names on tracked shows to publish shelves here."
                      : "This profile has not shared any shelves yet."
                  }
                  onAction={() => navigate(isMe ? "/dashboard" : "/search")}
                  title="No shelves yet"
                />
              ) : (
                <div className="forumProfileList">
                  {profile.shelves.map((shelf) => (
                    <div className="forumShelfBlock" key={`${shelf.kind}-${shelf.name}`}>
                      <div className="forumPanelTag">{shelf.kind}</div>
                      <h3 className="forumPanelTitle">{shelf.name}</h3>
                      <div className="forumFavoriteGrid">
                        {shelf.items.map((favorite) => (
                          <FavoriteCard
                            favorite={favorite}
                            key={`${shelf.name}-${favorite.aniListId}`}
                            onOpen={() => navigate(`/anime/${favorite.aniListId}`)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="forumProfileGrid">

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
                      <FavoriteCard
                        favorite={favorite}
                        key={favorite.aniListId}
                        onOpen={() => navigate(`/anime/${favorite.aniListId}`)}
                      />
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

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="dashStatCard">
      <div className="dashStatLabel">{label}</div>
      <div className="dashStatValue">{value}</div>
    </div>
  );
}

function FavoriteCard({
  favorite,
  onOpen,
}: {
  favorite: UserFavorite;
  onOpen: () => void;
}) {
  return (
    <button
      className="forumFavoriteCard"
      onClick={onOpen}
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
        {favorite.customListName ?? favorite.trackingStatus} ·{" "}
        {favorite.personalRating ? `${favorite.personalRating}/10` : favorite.averageScore ?? "No score"}
      </small>
      {favorite.userTags.length > 0 && (
        <span className="forumThreadMeta">
          {favorite.userTags.slice(0, 2).map((tag) => `#${tag}`).join(" ")}
        </span>
      )}
    </button>
  );
}

function activityLabel(type: string) {
  if (type === "thread") return "Posted";
  if (type === "completed") return "Completed";
  return "Tracked";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
