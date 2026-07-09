// Minimal rate-limit-aware GitHub REST client (uses global fetch).
// Auth is optional: a token unlocks higher limits + contributor/activity/SBOM
// endpoints; without one we still get real core metadata (60 req/hr).

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
export const AUTHED = TOKEN.length > 0;

const BASE = "https://api.github.com";

function headers(accept = "application/vnd.github+json"): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "gitverse-ingest",
    Accept: accept,
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

export interface GhResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  linkLast: number | null;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** GET with basic retry/backoff and rate-limit awareness. */
export async function gh<T = any>(
  path: string,
  accept?: string
): Promise<GhResponse<T>> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: headers(accept) });

    const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "1");
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0");

    // GitHub returns 202 while computing stats — retry after a short wait.
    if (res.status === 202) {
      await sleep(1500 * (attempt + 1));
      continue;
    }

    if (res.status === 403 && remaining === 0) {
      const waitMs = Math.max(0, reset * 1000 - Date.now()) + 1000;
      throw new Error(
        `Rate limit exhausted. Resets in ${Math.ceil(waitMs / 1000)}s. ` +
          `Set GITHUB_TOKEN for higher limits.`
      );
    }

    const linkLast = parseLastPage(res.headers.get("link"));

    if (!res.ok) {
      return { ok: false, status: res.status, data: null, linkLast };
    }

    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, linkLast };
  }
  return { ok: false, status: 0, data: null, linkLast: null };
}

/** Parse the `rel="last"` page number out of a Link header (for counts). */
function parseLastPage(link: string | null): number | null {
  if (!link) return null;
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
}
