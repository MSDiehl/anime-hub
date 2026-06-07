import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Home from "./Home";
import AnimeDetails from "./pages/AnimeDetails";
import Dashboard from "./pages/Dashboard";
import Forums from "./pages/Forums";
import ForumThread from "./pages/ForumThread";
import Schedule from "./pages/Schedule";
import UserProfile from "./pages/UserProfile";
import { apiGet, apiSend } from "./api/client";
import { clearCsrfToken, refreshCsrfToken } from "./api/csrf";
import { SkeletonBlock } from "./components/Feedback";
import { CheckIcon, KeyIcon, MailIcon, StarIcon } from "./components/Icons";
import { getErrorMessage } from "./utils/apiError";
import "./App.css";

type Me = {
  id?: string;
  email?: string;
  emailConfirmed?: boolean;
  displayName?: string;
  avatarUrl?: string | null;
  isProfilePublic?: boolean;
  canModerate?: boolean;
};

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    setLoading(true);
    try {
      setMe(await apiGet<Me>("/api/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await apiSend<void>("/api/auth/logout", "POST");
    clearCsrfToken();
    await refreshMe();
  }

  useEffect(() => {
    refreshMe();
  }, []);

  if (loading) {
    return (
      <div className="appBoot">
        <SkeletonBlock rows={3} />
      </div>
    );
  }
  if (!me) return <AuthPage onAuthed={refreshMe} />;

  return (
    <Routes>
      {/* When logged in, going to "/" sends you to dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/dashboard" element={<Dashboard onLogout={logout} />} />

      {/* Search page */}
      <Route path="/search" element={<Home onLogout={logout} />} />

      {/* Schedule */}
      <Route path="/schedule" element={<Schedule onLogout={logout} />} />

      {/* Forums */}
      <Route path="/forums" element={<Forums onLogout={logout} />} />
      <Route
        path="/forums/thread/:threadId"
        element={<ForumThread onLogout={logout} />}
      />
      <Route
        path="/users/:userId"
        element={<UserProfile onLogout={logout} />}
      />

      {/* Anime Details */}
      <Route
        path="/anime/:aniListId"
        element={<AnimeDetails onLogout={logout} />}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

/* ---------------------------
   Auth page
---------------------------- */
function AuthPage({ onAuthed }: { onAuthed: () => Promise<void> | void }) {
  const [mode, setMode] = useState<"login" | "register" | "confirm" | "forgot" | "reset">(
    "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === "/reset-password") {
      setEmail(params.get("email") ?? "");
      setToken(params.get("token") ?? "");
      setMode("reset");
    }
    if (window.location.pathname === "/confirm-email") {
      setUserId(params.get("userId") ?? "");
      setToken(params.get("token") ?? "");
      setMode("confirm");
    }
  }, []);

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const json = await apiSend<AuthWorkflowResponse>(
          "/api/auth/forgot-password",
          "POST",
          { email },
        );
        setUserId(json.userId ?? "");
        setToken(json.developmentToken ?? "");
        setMode("reset");
        setNotice("Check your email for a password reset token.");
        return;
      }

      if (mode === "reset") {
        await apiSend<void>(
          "/api/auth/reset-password",
          "POST",
          { email, token, newPassword },
        );
        setPassword("");
        setNewPassword("");
        setToken("");
        setMode("login");
        setNotice("Password reset. Sign in with the new password.");
        return;
      }

      if (mode === "confirm") {
        await apiSend<void>("/api/auth/confirm-email", "POST", { userId, token });
        clearCsrfToken();
        await refreshCsrfToken();
        await onAuthed();
        return;
      }

      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, displayName };

      const json = await apiSend<AuthWorkflowResponse | Me>(url, "POST", body);

      if (mode === "register") {
        if ("requiresEmailConfirmation" in json && json.requiresEmailConfirmation) {
          setUserId(json.userId ?? "");
          setToken(json.developmentToken ?? "");
          setMode("confirm");
          setNotice("Check your email to confirm this account.");
          return;
        }
      }

      clearCsrfToken();
      await refreshCsrfToken();
      await onAuthed();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Auth failed"));
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const json = await apiSend<AuthWorkflowResponse>(
        "/api/auth/resend-confirmation",
        "POST",
        { email },
      );
      setUserId(json.userId ?? userId);
      setToken(json.developmentToken ?? token);
      setNotice("Confirmation email sent.");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Resend failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authPage" aria-label="Authentication">
      {/* Background decor (purely visual) */}
      <div className="authBg" aria-hidden="true">
        <div className="authSpeedLines" />
        <div className="authHalftone" />
        <div className="authInkWash" />
      </div>

      <div className="authShell">
        <div
          className="authCard mangaPanel"
          role="region"
          aria-label="Login card"
        >
          <header className="authHeader">
            <div className="authBrand">
              <div className="authLogo" aria-hidden="true">
                <span className="authLogoStamp" />
              </div>

              <div>
                <h1 className="authTitle">AnimeHub</h1>
                <p className="authSubtitle">
                  {authSubtitle(mode)}
                </p>
              </div>
            </div>

            {/* Speech bubble badge */}
            <div className="authBadge" aria-hidden="true">
              <span className="authBadgeDot" />
              <span className="authBadgeText">
                {mode === "login" ? "Welcome back!" : "New arc begins!"}
              </span>
            </div>
          </header>

          <div className="authTabs" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setNotice(null);
              }}
              className="authTab"
              data-active={mode === "login" ? "true" : "false"}
              role="tab"
              aria-selected={mode === "login"}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setNotice(null);
              }}
              className="authTab"
              data-active={mode === "register" ? "true" : "false"}
              role="tab"
              aria-selected={mode === "register"}
            >
              Create account
            </button>
            <div
              className="authTabsIndicator"
              data-mode={mode}
              aria-hidden="true"
            />
          </div>

          <div className="authForm" role="form" aria-label="Auth form">
            {mode === "register" && (
              <div className="authField">
                <label className="authLabel">Display name</label>
                <div className="authInputWrap">
                  <span className="authIcon" aria-hidden="true">
                    <StarIcon />
                  </span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. CoolKid41234"
                    className="authInput"
                    autoComplete="nickname"
                  />
                </div>
              </div>
            )}

            {(mode === "login" || mode === "register" || mode === "forgot" || mode === "reset") && (
              <div className="authField">
              <label className="authLabel">Email</label>
              <div className="authInputWrap">
                <span className="authIcon" aria-hidden="true">
                  <MailIcon />
                </span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="authInput"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              </div>
            )}

            {(mode === "login" || mode === "register") && (
              <div className="authField">
              <label className="authLabel">Password</label>
              <div className="authInputWrap">
                <span className="authIcon" aria-hidden="true">
                  <KeyIcon />
                </span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  className="authInput"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) submit();
                  }}
                />
              </div>
              </div>
            )}

            {mode === "confirm" && (
              <>
                <div className="authField">
                  <label className="authLabel">User ID</label>
                  <div className="authInputWrap">
                    <span className="authIcon" aria-hidden="true">
                      <KeyIcon />
                    </span>
                    <input
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      className="authInput"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="authField">
                  <label className="authLabel">Confirmation token</label>
                  <div className="authInputWrap">
                    <span className="authIcon" aria-hidden="true">
                      <CheckIcon />
                    </span>
                    <input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="authInput"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </>
            )}

            {mode === "reset" && (
              <>
                <div className="authField">
                  <label className="authLabel">Reset token</label>
                  <div className="authInputWrap">
                    <span className="authIcon" aria-hidden="true">
                      <KeyIcon />
                    </span>
                    <input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="authInput"
                      autoComplete="one-time-code"
                    />
                  </div>
                </div>

                <div className="authField">
                  <label className="authLabel">New password</label>
                  <div className="authInputWrap">
                    <span className="authIcon" aria-hidden="true">
                      <KeyIcon />
                    </span>
                    <input
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      type="password"
                      className="authInput"
                      autoComplete="new-password"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !busy) submit();
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="authError" role="alert">
                <div className="authErrorTitle">WHAM!</div>
                <div className="authErrorMsg">{error}</div>
              </div>
            )}

            {notice && (
              <div className="authHint" role="status">
                {notice}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="authPrimaryBtn"
              data-busy={busy ? "true" : "false"}
            >
              <span className="authPrimaryBtnBurst" aria-hidden="true" />
              <span className="authPrimaryBtnText">
                {busy ? "Working…" : authButtonLabel(mode)}
              </span>
            </button>

            <div className="authHint">
              {mode === "login" ? (
                <button
                  type="button"
                  className="authInlineBtn"
                  onClick={() => setMode("forgot")}
                >
                  Forgot password?
                </button>
              ) : mode === "confirm" ? (
                <button
                  type="button"
                  className="authInlineBtn"
                  onClick={resendConfirmation}
                  disabled={busy || !email}
                >
                  Resend confirmation
                </button>
              ) : (
                <button
                  type="button"
                  className="authInlineBtn"
                  onClick={() => setMode("login")}
                >
                  Back to sign in
                </button>
              )}
            </div>
          </div>

          <div className="authFooter" aria-hidden="true">
            <span className="authFooterPill">
              Fun Fact: One Piece is the greatest anime ever.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

type AuthWorkflowResponse = {
  userId?: string;
  email?: string;
  requiresEmailConfirmation?: boolean;
  resetEmailSent?: boolean;
  developmentToken?: string | null;
};

function authSubtitle(mode: "login" | "register" | "confirm" | "forgot" | "reset") {
  if (mode === "login") return "Sign in to continue";
  if (mode === "register") return "Create your account";
  if (mode === "confirm") return "Confirm your email";
  if (mode === "forgot") return "Reset your password";
  return "Choose a new password";
}

function authButtonLabel(mode: "login" | "register" | "confirm" | "forgot" | "reset") {
  if (mode === "login") return "Sign in";
  if (mode === "register") return "Create account";
  if (mode === "confirm") return "Confirm email";
  if (mode === "forgot") return "Send reset";
  return "Reset password";
}
