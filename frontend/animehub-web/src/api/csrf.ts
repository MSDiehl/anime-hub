const csrfHeaderName = "X-CSRF-TOKEN";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let csrfToken: string | null = null;

type CsrfResponse = {
  token?: string;
};

export function clearCsrfToken() {
  csrfToken = null;
}

export async function refreshCsrfToken() {
  csrfToken = null;
  return getCsrfToken();
}

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const needsToken = unsafeMethods.has(method);
  const headers = new Headers(init.headers);

  if (needsToken) {
    headers.set(csrfHeaderName, await getCsrfToken());
  }

  const request = {
    ...init,
    credentials: "include" as RequestCredentials,
    headers,
  };

  const res = await fetch(input, request);
  if (res.status !== 400 || !needsToken) return res;

  clearCsrfToken();
  headers.set(csrfHeaderName, await getCsrfToken());

  return fetch(input, {
    ...request,
    headers,
  });
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;

  const res = await fetch("/api/auth/csrf", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to initialize CSRF protection.");

  const json = (await res.json()) as CsrfResponse;
  csrfToken = json.token ?? "";
  return csrfToken;
}
