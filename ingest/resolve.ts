// Resolves dependency package identifiers (from a repo's SBOM) to the GitHub
// repository that publishes them, so BFS can follow real dependency edges
// outward. Some purl types encode the repo directly (github, golang on
// github.com); npm / pypi / cargo require a registry lookup.

export interface Purl {
  type: string;
  namespace: string | null;
  name: string;
}

const cache = new Map<string, string | null>();

/** Parse a Package URL like pkg:npm/@scope/name@1.2.3 into its parts. */
export function parsePurl(locator: string): Purl | null {
  if (!locator.startsWith("pkg:")) return null;
  let body = locator.slice(4).split("@").slice(0, -1).join("@") || locator.slice(4);
  // strip version (last @segment) if present without breaking npm scopes
  const at = locator.lastIndexOf("@");
  if (at > 4) body = locator.slice(4, at);
  const [typeAndPath, ...rest] = body.split("?");
  const parts = typeAndPath.split("/").map(decodeURIComponent);
  const type = parts.shift() ?? "";
  if (!type || parts.length === 0) return null;
  const name = parts.pop()!;
  const namespace = parts.length ? parts.join("/") : null;
  return { type, namespace, name };
}

/** Extract "owner/repo" from any github URL. */
export function githubFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(/github\.com[/:]+([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

async function registryJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "gitverse-ingest" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Resolve a parsed purl to "owner/repo" on GitHub, or null. Cached. */
export async function resolveToRepo(p: Purl): Promise<string | null> {
  const key = `${p.type}:${p.namespace ?? ""}/${p.name}`;
  if (cache.has(key)) return cache.get(key)!;
  let repo: string | null = null;

  switch (p.type) {
    case "github":
    case "githubactions":
      if (p.namespace) repo = `${p.namespace}/${p.name}`;
      break;
    case "golang": {
      const full = `${p.namespace ?? ""}/${p.name}`;
      const m = full.match(/^github\.com\/([^/]+)\/([^/]+)/i);
      if (m) repo = `${m[1]}/${m[2]}`;
      break;
    }
    case "npm": {
      const pkg = p.namespace ? `${p.namespace}/${p.name}` : p.name;
      const d = await registryJson(`https://registry.npmjs.org/${encodeURIComponent(pkg).replace("%40", "@")}`);
      repo = githubFromUrl(d?.repository?.url);
      break;
    }
    case "pypi": {
      const d = await registryJson(`https://pypi.org/pypi/${encodeURIComponent(p.name)}/json`);
      const urls = { ...(d?.info?.project_urls ?? {}), home: d?.info?.home_page };
      for (const v of Object.values(urls)) {
        repo = githubFromUrl(v as string);
        if (repo) break;
      }
      break;
    }
    case "cargo": {
      const d = await registryJson(`https://crates.io/api/v1/crates/${encodeURIComponent(p.name)}`);
      repo = githubFromUrl(d?.crate?.repository);
      break;
    }
  }

  cache.set(key, repo);
  return repo;
}
