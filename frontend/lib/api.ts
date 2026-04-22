export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const TOKEN_KEY = "ria_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && (body as { error: string }).error) ||
      `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function ping(): Promise<{ status: string; db: string }> {
  const base = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  const res = await fetch(`${base}/healthz`);
  return res.json();
}

export async function uploadCatalog<T>(
  file: File,
  dedupeStrategy: "detect" | "merge" | "first",
): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("dedupe_strategy", dedupeStrategy);
  return apiFetch<T>("/catalog/upload", { method: "POST", body: fd });
}

export async function runAudit<T>(): Promise<T> {
  return apiFetch<T>("/audit/run", { method: "POST" });
}

export async function rescoreProduct<T>(sku: string): Promise<T> {
  return apiFetch<T>(`/audit/rescore/${encodeURIComponent(sku)}`, { method: "POST" });
}
