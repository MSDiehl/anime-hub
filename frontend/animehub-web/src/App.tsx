import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./Home";
import AnimeDetails from "./pages/AnimeDetails";
import Dashboard from "./pages/Dashboard";

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
   Auth page (UNCHANGED)
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
    <div style={authStyles.page}>
      <div style={authStyles.bgGlow} />

      <div style={authStyles.card}>
        <div style={authStyles.header}>
          <div>
            <h1 style={authStyles.title}>AnimeHub</h1>
            <p style={authStyles.subtitle}>
              {mode === "login" ? "Sign in to continue" : "Create your account"}
            </p>
          </div>
        </div>

        <div style={authStyles.tabs}>
          <button
            onClick={() => setMode("login")}
            style={tabStyle(mode === "login")}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode("register")}
            style={tabStyle(mode === "register")}
          >
            Create account
          </button>
        </div>

        <div style={authStyles.form}>
          {mode === "register" && (
            <div style={authStyles.field}>
              <label style={authStyles.label}>Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. CoolKid41234"
                style={authStyles.input}
                autoComplete="nickname"
              />
            </div>
          )}

          <div style={authStyles.field}>
            <label style={authStyles.label}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={authStyles.input}
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div style={authStyles.field}>
            <label style={authStyles.label}>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              style={authStyles.input}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) submit();
              }}
            />
          </div>

          {error && <div style={authStyles.error}>{error}</div>}

          <button
            onClick={submit}
            disabled={busy}
            style={{
              ...authStyles.primaryBtn,
              ...(busy ? authStyles.primaryBtnDisabled : null),
            }}
          >
            {busy
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>

          <div style={authStyles.hint}>
            Tip: press <span style={authStyles.kbd}>Enter</span> to submit
          </div>
        </div>
      </div>
    </div>
  );
}

const authStyles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    width: "100%",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    position: "relative",
    background:
      "radial-gradient(1200px 600px at 20% 0%, rgba(108,99,255,.22), transparent 60%), #0b0b10",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    padding: 16,
    boxSizing: "border-box",
  },
  bgGlow: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(700px 340px at 70% 25%, rgba(140,80,255,.18), transparent 60%)",
  },

  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.10)",
    boxShadow: "0 18px 70px rgba(0,0,0,.35)",
    backdropFilter: "blur(10px)",
    boxSizing: "border-box",
    position: "relative",
    zIndex: 1,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 950 as any,
    letterSpacing: -0.3,
  },
  subtitle: {
    margin: "6px 0 0",
    opacity: 0.75,
    fontSize: 13,
  },

  tabs: {
    display: "flex",
    gap: 8,
    marginTop: 10,
  },

  form: {
    marginTop: 12,
    display: "grid",
    gap: 10,
  },

  field: {
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 12,
    opacity: 0.75,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(0,0,0,.22)",
    color: "#fff",
    outline: "none",
    fontSize: 14,
  },

  error: {
    color: "#ff9aa2",
    fontSize: 13,
    lineHeight: 1.3,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255, 100, 120, .10)",
    border: "1px solid rgba(255, 100, 120, .18)",
  },

  primaryBtn: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background:
      "linear-gradient(135deg, rgba(108,99,255,1), rgba(168,94,255,1))",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  primaryBtnDisabled: {
    opacity: 0.75,
    cursor: "not-allowed",
  },

  hint: {
    textAlign: "center",
    fontSize: 12,
    opacity: 0.65,
    marginTop: 2,
  },
  kbd: {
    display: "inline-block",
    padding: "2px 6px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.08)",
    fontSize: 11,
    margin: "0 2px",
  },
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.10)",
    background: active ? "rgba(108,99,255,.28)" : "rgba(255,255,255,.06)",
    color: "#fff",
    fontWeight: 850 as any,
    cursor: "pointer",
    opacity: active ? 1 : 0.8,
  };
}
