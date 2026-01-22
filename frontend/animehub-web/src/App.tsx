import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./Home";
import AnimeDetails from "./pages/AnimeDetails";
import Dashboard from "./pages/Dashboard";
import Schedule from "./pages/Schedule";
import "./App.css";

type Me = { id?: string; email?: string };

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        setMe(null);
      } else {
        setMe(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    await refreshMe();
  }

  useEffect(() => {
    refreshMe();
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!me) return <AuthPage onAuthed={refreshMe} />;

  return (
    <Routes>
      {/* ✅ When logged in, going to "/" sends you to dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/dashboard" element={<Dashboard onLogout={logout} />} />

      {/* Keep search page accessible */}
      <Route path="/search" element={<Home onLogout={logout} />} />

      <Route path="/schedule" element={<Schedule onLogout={logout} />} />

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
   Auth page (FUNCTIONALITY UNCHANGED)
---------------------------- */

function AuthPage({ onAuthed }: { onAuthed: () => Promise<void> | void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, displayName };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let msg = "Request failed";
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const data = await res.json().catch(() => null);
          msg = typeof data === "string" ? data : JSON.stringify(data);
        } else {
          msg = `${res.status} ${res.statusText}`;
        }
        throw new Error(msg);
      }
      await onAuthed();
    } catch (e: any) {
      setError(e?.message ?? "Auth failed");
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
                  {mode === "login"
                    ? "Sign in to continue"
                    : "Create your account"}
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
              onClick={() => setMode("login")}
              className="authTab"
              data-active={mode === "login" ? "true" : "false"}
              role="tab"
              aria-selected={mode === "login"}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
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
                    ★
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

            <div className="authField">
              <label className="authLabel">Email</label>
              <div className="authInputWrap">
                <span className="authIcon" aria-hidden="true">
                  ✉
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

            <div className="authField">
              <label className="authLabel">Password</label>
              <div className="authInputWrap">
                <span className="authIcon" aria-hidden="true">
                  ⚷
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

            {error && (
              <div className="authError" role="alert">
                <div className="authErrorTitle">WHAM!</div>
                <div className="authErrorMsg">{error}</div>
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
                {busy
                  ? "Working…"
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </span>
            </button>

            <div className="authHint">
              Tip: press <span className="authKbd">Enter</span> to submit
            </div>
          </div>

          <div className="authFooter" aria-hidden="true">
            <span className="authFooterPill">
              Fun Fact: One Piece is the greates anime ever.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
