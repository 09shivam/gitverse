// GitVerse ingestion — GitHub Search discovery + BFS dependency expansion.
//
// Search finds recent/active/popular repos across the product domains. Seeds
// still provide stable anchors, then authenticated runs can BFS outward through
// real dependency edges. When a model is configured, every fetched repo is
// classified from GitHub metadata; otherwise we fall back to graph + heuristic
// labels. Output is public/graph.json in the GVGraph shape.
//
// Run:  npm run ingest                                   (unauth: seeds only)
//       GITHUB_TOKEN=… npm run ingest                    (search + BFS)
//       GITHUB_TOKEN=… ANTHROPIC_API_KEY=… npm run ingest (Claude labels)

import "./loadenv.ts"; // must be first — populates process.env before github/classify load
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GVGraph,
  GVNode,
  GVEdge,
  DomainId,
  DiscoverySource,
  RepoBadge,
} from "../src/types.ts";
import { SEEDS, DOMAIN_LABEL } from "./seeds.ts";
import { gh, AUTHED } from "./github.ts";
import { parsePurl, resolveToRepo } from "./resolve.ts";
import { classifyDomain } from "./classify.ts";
import { classifyReposAI, AI_ENABLED } from "./classify-ai.ts";
import { classifyReposLocal, LOCAL_ENABLED, LOCAL_LABEL } from "./classify-local.ts";
import { classifyGraph, type AffinityEdge } from "./classify-graph.ts";
import { discoverSearchRepos } from "./search.ts";

const CLASSIFIER = (process.env.GV_CLASSIFIER ?? (AI_ENABLED ? "claude" : "auto")).toLowerCase();
const LLM =
  CLASSIFIER === "none"
    ? null
    : CLASSIFIER === "claude"
    ? AI_ENABLED
      ? { run: classifyReposAI, label: "AI (Claude)" }
      : null
    : CLASSIFIER === "local"
    ? LOCAL_ENABLED
      ? { run: classifyReposLocal, label: LOCAL_LABEL }
      : null
    : AI_ENABLED
    ? { run: classifyReposAI, label: "AI (Claude)" }
    : LOCAL_ENABLED
    ? { run: classifyReposLocal, label: LOCAL_LABEL }
    : null;

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = pathResolve(__dir, "../public/graph.json");
const HISTORY_DIR = pathResolve(__dir, "../public/history");
const HISTORY_INDEX = pathResolve(HISTORY_DIR, "index.json");

const MAX_DEPTH = Number(process.env.GV_DEPTH ?? (AUTHED ? 1 : 0));
const BUDGET = Number(process.env.GV_BUDGET ?? (AUTHED ? 240 : SEEDS.length));
const SEARCH_ENABLED = process.env.GV_SEARCH === "1" || (AUTHED && process.env.GV_SEARCH !== "0");
const MAX_DEPS_PER_REPO = 25;
const NEW_WINDOW_DAYS = Number(process.env.GV_NEW_WINDOW_DAYS ?? 365);
const ACTIVE_WINDOW_DAYS = Number(process.env.GV_ACTIVE_WINDOW_DAYS ?? 90);
const GLOBAL_BADGE_TOP = Number(process.env.GV_BADGE_TOP ?? 18);
const DOMAIN_BADGE_TOP = Number(process.env.GV_DOMAIN_BADGE_TOP ?? 3);
// dependency ecosystems we follow (real software deps, not CI tooling)
const FOLLOW_TYPES = new Set(["npm", "pypi", "cargo", "golang"]);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const year = (iso: string) => new Date(iso).getFullYear();
const norm = (v: number, min: number, max: number) => (max > min ? (v - min) / (max - min) : 0.5);
const repoIdOf = (full: string) => "r-" + slug(full);
const daysSince = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);

// Derive a readable ecosystem label from a repo's topics (fallback: domain bucket).
const GENERIC_TOPICS = new Set([
  "python", "javascript", "typescript", "golang", "go", "rust", "java", "cpp", "c",
  "library", "cli", "framework", "hacktoberfest", "opensource", "open-source",
  "github", "api", "tool", "tools", "utility",
]);
function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function topicEcosystem(topics: string[], domain: DomainId): string {
  const cand = topics.filter((t) => !GENERIC_TOPICS.has(t));
  const pick = cand.find((t) => t.includes("-")) ?? cand[0]; // prefer descriptive multi-word topics
  if (pick) return titleCase(pick.replace(/-/g, " "));
  return DOMAIN_LABEL[domain].split(" ")[0] + " Libraries";
}

function heuristicLabel(r: RepoData) {
  r.domain = classifyDomain(r.topics, r.language, r.description);
  r.ecosystem = topicEcosystem(r.topics, r.domain);
}

function addBadge(r: RepoData, badge: RepoBadge) {
  if (!r.badges.includes(badge)) r.badges.push(badge);
}

/** Real PageRank over the dependency graph — measures foundational-ness. */
function pageRank(ids: string[], edges: [string, string][], damping = 0.85, iterations = 80) {
  const N = ids.length;
  const idSet = new Set(ids);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [u, v] of edges) if (idSet.has(u) && idSet.has(v) && u !== v) out.get(u)!.push(v);
  const outDeg = new Map(ids.map((id) => [id, out.get(id)!.length]));
  let pr = new Map(ids.map((id) => [id, 1 / N]));
  for (let it = 0; it < iterations; it++) {
    const next = new Map(ids.map((id) => [id, (1 - damping) / N]));
    let dangling = 0;
    for (const id of ids) if (outDeg.get(id) === 0) dangling += pr.get(id)!;
    for (const u of ids) {
      const deg = outDeg.get(u)!;
      if (deg === 0) continue;
      const share = (damping * pr.get(u)!) / deg;
      for (const v of out.get(u)!) next.set(v, next.get(v)! + share);
    }
    const spread = (damping * dangling) / N;
    for (const id of ids) next.set(id, next.get(id)! + spread);
    pr = next;
  }
  return pr;
}

interface RepoData {
  full: string;
  id: string;
  label: string;
  domain: DomainId;
  ecosystem: string;
  discoveredBy: DiscoverySource;
  discoverySignals: string[];
  stars: number;
  createdAt: number;
  createdAtIso: string;
  pushedAtIso: string;
  updatedAtIso: string;
  topics: string[];
  description: string;
  language: string | null;
  starsPerDay: number;
  trendScore: number;
  newScore: number;
  contributionScore: number;
  trendRank?: number;
  newRank?: number;
  contributionRank?: number;
  badges: RepoBadge[];
  forks: number;
  openIssues: number;
  license: string | null;
  owner: string;
  url: string;
  lastPush: number;
  activity?: number;
  contributors?: number;
  depRepos: string[]; // resolved dependency repo full-names
  depth: number;
}

interface FrontierItem {
  full: string;
  depth: number;
  discoveredBy: DiscoverySource;
  hintedDomain?: DomainId;
  fallbackEcosystem?: string;
  signals: string[];
}

// fast path: known seed package names -> repo full name (skips registry calls)
const pkgKnown = new Map<string, string>();
for (const s of SEEDS) for (const p of s.provides ?? []) pkgKnown.set(p.toLowerCase(), s.repo);

async function fetchCore(
  full: string
): Promise<
  Omit<
    RepoData,
    | "domain"
    | "ecosystem"
    | "depth"
    | "discoveredBy"
    | "discoverySignals"
    | "trendScore"
    | "newScore"
    | "contributionScore"
    | "badges"
  > | null
> {
  const res = await gh<any>(`/repos/${full}`);
  if (!res.ok || !res.data) return null;
  const d = res.data;
  const created = d.created_at as string;
  const pushed = (d.pushed_at ?? created) as string;
  const updated = (d.updated_at ?? pushed) as string;
  const ageDays = Math.max(1, (Date.now() - new Date(created).getTime()) / 86_400_000);
  const spdx = d.license?.spdx_id as string | undefined;
  return {
    full,
    id: repoIdOf(full),
    label: d.name,
    stars: d.stargazers_count ?? 0,
    createdAt: year(created),
    createdAtIso: created,
    pushedAtIso: pushed,
    updatedAtIso: updated,
    topics: (d.topics ?? []).map((t: string) => t.toLowerCase()),
    description: d.description ?? "",
    language: d.language ?? null,
    starsPerDay: (d.stargazers_count ?? 0) / ageDays,
    forks: d.forks_count ?? 0,
    openIssues: d.open_issues_count ?? 0,
    license: spdx && spdx !== "NOASSERTION" ? spdx : null,
    owner: d.owner?.login ?? full.split("/")[0],
    url: d.homepage || d.html_url || `https://github.com/${full}`,
    lastPush: year(pushed),
    depRepos: [],
  };
}

async function enrich(rd: RepoData) {
  const c = await gh<any[]>(`/repos/${rd.full}/contributors?per_page=1&anon=true`);
  if (c.ok) rd.contributors = c.linkLast ?? (c.data?.length ?? 0);

  const act = await gh<any[]>(`/repos/${rd.full}/stats/commit_activity`);
  if (act.ok && Array.isArray(act.data)) {
    rd.activity = act.data.slice(-13).reduce((s, w) => s + (w.total ?? 0), 0);
  }

  const sbom = await gh<any>(`/repos/${rd.full}/dependency-graph/sbom`);
  if (!sbom.ok || !sbom.data?.sbom?.packages) return;

  // collect purls, follow only real software-dependency ecosystems
  const locators = new Set<string>();
  for (const p of sbom.data.sbom.packages as any[]) {
    for (const ref of p.externalRefs ?? []) {
      if (ref.referenceType === "purl" && typeof ref.referenceLocator === "string") {
        locators.add(ref.referenceLocator);
      }
    }
  }

  const targets = new Set<string>();
  let budget = MAX_DEPS_PER_REPO;
  for (const loc of locators) {
    if (budget <= 0) break;
    const purl = parsePurl(loc);
    if (!purl || !FOLLOW_TYPES.has(purl.type)) continue;
    budget--;
    const known = pkgKnown.get(purl.name.toLowerCase());
    const full = known ?? (await resolveToRepo(purl));
    if (full && full.toLowerCase() !== rd.full.toLowerCase()) targets.add(full);
  }
  rd.depRepos = [...targets];
}

function scoreRepos(repos: RepoData[]) {
  const stars = repos.map((r) => r.stars);
  const forks = repos.map((r) => r.forks);
  const spd = repos.map((r) => r.starsPerDay);
  const activity = repos.map((r) => r.activity ?? 0);
  const contributors = repos.map((r) => r.contributors ?? 0);
  const minMax = (xs: number[]) => [Math.min(...xs), Math.max(...xs)] as const;
  const [starsMin, starsMax] = minMax(stars);
  const [forksMin, forksMax] = minMax(forks);
  const [spdMin, spdMax] = minMax(spd);
  const [actMin, actMax] = minMax(activity);
  const [conMin, conMax] = minMax(contributors);

  for (const r of repos) {
    const ageScore = clamp01(1 - daysSince(r.createdAtIso) / NEW_WINDOW_DAYS);
    const pushedScore = clamp01(1 - daysSince(r.pushedAtIso) / ACTIVE_WINDOW_DAYS);
    const starsScore = norm(r.stars, starsMin, starsMax);
    const forksScore = norm(r.forks, forksMin, forksMax);
    const speedScore = norm(r.starsPerDay, spdMin, spdMax);
    const activityScore = norm(r.activity ?? 0, actMin, actMax);
    const contributorScore = norm(r.contributors ?? 0, conMin, conMax);

    r.newScore = Number(
      clamp01(ageScore * 0.55 + starsScore * 0.25 + speedScore * 0.2).toFixed(3)
    );
    r.trendScore = Number(
      clamp01(speedScore * 0.4 + activityScore * 0.25 + pushedScore * 0.25 + forksScore * 0.1).toFixed(3)
    );
    r.contributionScore = Number(
      clamp01(activityScore * 0.65 + contributorScore * 0.25 + pushedScore * 0.1).toFixed(3)
    );
  }

  const rank = (
    key: "trendScore" | "newScore" | "contributionScore",
    rankKey: "trendRank" | "newRank" | "contributionRank",
    badge: RepoBadge
  ) => {
    const ranked = [...repos].sort((a, b) => b[key] - a[key]);
    ranked.forEach((r, i) => {
      r[rankKey] = i + 1;
      if (i < GLOBAL_BADGE_TOP) addBadge(r, badge);
    });
    for (const domain of Object.keys(DOMAIN_LABEL) as DomainId[]) {
      ranked
        .filter((r) => r.domain === domain)
        .slice(0, DOMAIN_BADGE_TOP)
        .forEach((r) => addBadge(r, badge));
    }
  };

  rank("trendScore", "trendRank", "trending");
  rank("newScore", "newRank", "new");
  rank("contributionScore", "contributionRank", "active");
}

function writeHistorySnapshot(graph: GVGraph, repos: RepoData[], generatedAt: string) {
  const day = generatedAt.slice(0, 10);
  mkdirSync(HISTORY_DIR, { recursive: true });
  writeFileSync(
    pathResolve(HISTORY_DIR, `${day}.json`),
    JSON.stringify(
      {
        generatedAt,
        repoCount: repos.length,
        repos: repos.map((r) => ({
          full: r.full,
          domain: r.domain,
          ecosystem: r.ecosystem,
          stars: r.stars,
          forks: r.forks,
          contributors: r.contributors,
          recentCommits: r.activity ?? 0,
          trendScore: r.trendScore,
          newScore: r.newScore,
          contributionScore: r.contributionScore,
          createdAt: r.createdAtIso,
          pushedAt: r.pushedAtIso,
          discoverySignals: r.discoverySignals,
        })),
        summary: graph.summary,
      },
      null,
      2
    )
  );

  let existing: { snapshots?: string[] } = {};
  try {
    existing = JSON.parse(readFileSync(HISTORY_INDEX, "utf8"));
  } catch {
    existing = {};
  }
  const snapshots = new Set(existing.snapshots ?? []);
  snapshots.add(`${day}.json`);
  writeFileSync(
    HISTORY_INDEX,
    JSON.stringify({ generatedAt, snapshots: [...snapshots].sort() }, null, 2)
  );
}

async function main() {
  console.log(
    `GitVerse ingest — ${AUTHED ? "authenticated" : "UNAUTHENTICATED"} · ` +
      `depth ${MAX_DEPTH}, budget ${BUDGET} · ` +
      `search ${SEARCH_ENABLED ? "on" : "off"} · classifier: ${LLM ? LLM.label : "heuristic"}\n`
  );

  const seedByFull = new Map(SEEDS.map((s) => [s.repo.toLowerCase(), s]));
  const frontier = new Map<string, FrontierItem>();
  const addFrontier = (item: FrontierItem) => {
    const key = item.full.toLowerCase();
    const existing = frontier.get(key);
    if (!existing) {
      frontier.set(key, item);
      return;
    }
    existing.depth = Math.min(existing.depth, item.depth);
    existing.signals = [...new Set([...existing.signals, ...item.signals])];
    existing.hintedDomain ??= item.hintedDomain;
    existing.fallbackEcosystem ??= item.fallbackEcosystem;
    if (existing.discoveredBy !== "seed") existing.discoveredBy = item.discoveredBy;
  };

  for (const s of SEEDS) {
    addFrontier({
      full: s.repo,
      depth: 0,
      discoveredBy: "seed",
      hintedDomain: s.domain,
      fallbackEcosystem: s.ecosystem,
      signals: ["seed"],
    });
  }

  if (SEARCH_ENABLED) {
    const found = await discoverSearchRepos();
    for (const c of found) {
      addFrontier({
        full: c.full,
        depth: 0,
        discoveredBy: c.discoveredBy,
        hintedDomain: c.hintedDomain,
        signals: c.signals,
      });
    }
  }

  const visited = new Map<string, RepoData>();
  const queued = new Set<string>();
  const queue: FrontierItem[] = [];
  for (const item of frontier.values()) {
    queued.add(item.full.toLowerCase());
    queue.push(item);
  }

  while (queue.length && visited.size < BUDGET) {
    const item = queue.shift()!;
    const { full, depth } = item;
    const low = full.toLowerCase();
    if (visited.has(low)) continue;

    const core = await fetchCore(full);
    if (!core) {
      console.warn(`  ! ${full}: fetch failed`);
      continue;
    }

    const seed = seedByFull.get(low);
    const domain: DomainId =
      seed?.domain ?? item.hintedDomain ?? classifyDomain(core.topics, core.language, core.description);
    const ecosystem = seed?.ecosystem ?? item.fallbackEcosystem ?? `${DOMAIN_LABEL[domain]} Libraries`;
    const rd: RepoData = {
      ...core,
      domain,
      ecosystem,
      depth,
      discoveredBy: item.discoveredBy,
      discoverySignals: item.signals,
      trendScore: 0,
      newScore: 0,
      contributionScore: 0,
      badges: [],
    };

    if (AUTHED) await enrich(rd);
    visited.set(low, rd);
    const labelPreview = LLM ? "" : ` · ${DOMAIN_LABEL[domain]}`;
    console.log(
      `  ✓ [d${depth}] ${full} — ${rd.stars.toLocaleString()}★${labelPreview}` +
        (rd.depRepos.length ? ` · ${rd.depRepos.length} deps` : "")
    );

    if (depth < MAX_DEPTH) {
      for (const dep of rd.depRepos) {
        const dlow = dep.toLowerCase();
        if (!queued.has(dlow) && visited.size + queued.size < BUDGET * 2) {
          queued.add(dlow);
          queue.push({
            full: dep,
            depth: depth + 1,
            discoveredBy: "dependency",
            signals: [`dependency:${rd.full}`],
          });
        }
      }
    }
  }

  const repos = [...visited.values()];
  if (repos.length === 0) throw new Error("No repos fetched — check network / rate limit / token.");

  // ---- edges among included repos (also feed the offline classifier) ----
  const includedId = new Map(repos.map((r) => [r.full.toLowerCase(), r.id]));
  const yearById = new Map(repos.map((r) => [r.id, r.createdAt]));
  const depEdges: [string, string][] = [];
  for (const r of repos) {
    for (const dep of r.depRepos) {
      const tid = includedId.get(dep.toLowerCase());
      if (tid && tid !== r.id) depEdges.push([r.id, tid]);
    }
  }
  // similarity from shared topics (>= 3 shared)
  const simPairs: [string, string][] = [];
  for (let i = 0; i < repos.length; i++) {
    for (let j = i + 1; j < repos.length; j++) {
      const a = new Set(repos[i].topics);
      if (repos[j].topics.filter((t) => a.has(t)).length >= 3) {
        simPairs.push([repos[i].id, repos[j].id]);
      }
    }
  }

  // ---- categorization ----
  // Preferred path: the configured model classifies every repo, including seeds.
  // Seed domains remain only as crawl-root hints and offline fallback labels.
  let classifierUsed = LLM?.label ?? "heuristic";
  if (LLM) {
    let byModel = 0;
    let byFallback = 0;
    try {
      const cls = await LLM.run(
        repos.map((r) => ({
          full: r.full,
          description: r.description,
          topics: r.topics,
          language: r.language,
        }))
      );
      for (const r of repos) {
        const c = cls.get(r.full.toLowerCase());
        if (c) {
          r.domain = c.domain;
          r.ecosystem = c.ecosystem;
          byModel++;
        } else {
          heuristicLabel(r);
          byFallback++;
        }
      }
    } catch (e: any) {
      byFallback = repos.length;
      classifierUsed = "heuristic fallback";
      for (const r of repos) heuristicLabel(r);
      console.warn(`  ! ${LLM.label} classification failed (${e.message}) — using heuristic fallback`);
    }
    if (byModel > 0 && byFallback > 0) classifierUsed = `${LLM.label} + heuristic fallback`;
    console.log(
      `\nClassified ${repos.length} repos — ${LLM.label}: ${byModel}` +
        (byFallback ? `, heuristic fallback: ${byFallback}` : "")
    );
  } else {
    // Offline fallback: keep the previous free hybrid behavior for discovered
    // repos, using seed labels only as graph anchors.
    const seedLabels = new Map<string, DomainId>();
    for (const r of repos) if (r.depth === 0) seedLabels.set(r.id, r.domain);
    const affinity: AffinityEdge[] = [
      ...depEdges.map(([a, b]) => ({ a, b, w: 1 })),
      ...simPairs.map(([a, b]) => ({ a, b, w: 3 })), // shared-topic ties are strong
    ];
    const graphCls = classifyGraph(repos.map((r) => r.id), seedLabels, affinity);

    const discovered = repos.filter((r) => r.depth > 0);
    const CONF = 0.6;
    let byGraph = 0;
    let byHeuristic = 0;
    for (const r of discovered) {
      const gc = graphCls.get(r.id);
      const textDom = classifyDomain(r.topics, r.language, r.description);
      if (gc && gc.confidence >= CONF && gc.domain === textDom) {
        r.domain = gc.domain;
        r.ecosystem = topicEcosystem(r.topics, gc.domain);
        byGraph++;
      } else {
        heuristicLabel(r);
        byHeuristic++;
      }
    }
    console.log(
      `\nClassified ${discovered.length} discovered repos — ` +
        `graph: ${byGraph}, heuristic: ${byHeuristic}`
    );
  }

  scoreRepos(repos);

  // ---- metrics ----
  const pr = pageRank(repos.map((r) => r.id), depEdges);
  const prMin = Math.min(...pr.values());
  const prMax = Math.max(...pr.values());

  // ---- build nodes ----
  const nodes: GVNode[] = [];
  const links: GVEdge[] = [];
  const domainYear = new Map<DomainId, number>();
  const ecoInfo = new Map<string, { domain: DomainId; label: string; year: number }>();
  const seenEdge = new Set<string>();
  const addEdge = (e: GVEdge) => {
    const k = `${e.source}|${e.target}|${e.kind}`;
    if (!seenEdge.has(k)) {
      seenEdge.add(k);
      links.push(e);
    }
  };

  for (const r of repos) {
    nodes.push({
      id: r.id,
      label: r.label,
      kind: "repo",
      domain: r.domain,
      stars: Math.round(r.stars / 1000),
      pagerank: Number(clamp01(norm(pr.get(r.id) ?? 0, prMin, prMax)).toFixed(2)),
      momentum: r.trendScore,
      trendScore: r.trendScore,
      newScore: r.newScore,
      contributionScore: r.contributionScore,
      starsPerDay: Number(r.starsPerDay.toFixed(3)),
      recentCommits: r.activity ?? 0,
      discoveredBy: r.discoveredBy,
      discoverySignals: r.discoverySignals,
      trendRank: r.trendRank,
      newRank: r.newRank,
      contributionRank: r.contributionRank,
      badges: r.badges,
      activity: r.activity,
      contributors: r.contributors,
      forks: Math.round(r.forks / 1000),
      openIssues: r.openIssues,
      license: r.license ?? undefined,
      language: r.language ?? undefined,
      owner: r.owner,
      url: r.url,
      github: `https://github.com/${r.full}`,
      lastPush: r.lastPush,
      createdAt: r.createdAt,
      description: r.description,
    });
    domainYear.set(r.domain, Math.min(domainYear.get(r.domain) ?? 9999, r.createdAt));
    const eId = "e-" + slug(r.domain + "-" + r.ecosystem);
    const eco = ecoInfo.get(eId);
    ecoInfo.set(eId, { domain: r.domain, label: r.ecosystem, year: Math.min(eco?.year ?? 9999, r.createdAt) });
    addEdge({ source: eId, target: r.id, kind: "contains", createdAt: r.createdAt });
  }

  for (const [domain, y] of domainYear) {
    nodes.push({
      id: "d-" + domain,
      label: DOMAIN_LABEL[domain].split(" ")[0],
      kind: "domain",
      domain,
      pagerank: 1,
      stars: 900,
      createdAt: y,
      description: DOMAIN_LABEL[domain],
    });
  }
  for (const [eId, e] of ecoInfo) {
    nodes.push({ id: eId, label: e.label, kind: "ecosystem", domain: e.domain, pagerank: 0.9, stars: 400, createdAt: e.year });
    addEdge({ source: "d-" + e.domain, target: eId, kind: "contains", createdAt: e.year });
  }
  for (const [u, v] of depEdges) {
    const created = nodes.find((n) => n.id === u)?.createdAt ?? 2020;
    addEdge({ source: u, target: v, kind: "depends_on", createdAt: created });
  }

  // similarity edges (computed earlier from shared topics)
  for (const [a, b] of simPairs) {
    addEdge({
      source: a,
      target: b,
      kind: "similar_to",
      createdAt: Math.max(yearById.get(a) ?? 2020, yearById.get(b) ?? 2020),
    });
  }

  const generatedAt = new Date().toISOString();
  const graph: GVGraph = {
    nodes,
    links,
    generatedAt,
    summary: {
      repoCount: repos.length,
      searchEnabled: SEARCH_ENABLED,
      classifier: classifierUsed,
    },
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(graph, null, 2));
  writeHistorySnapshot(graph, repos, generatedAt);

  const seedCount = repos.filter((r) => r.depth === 0).length;
  const searchCount = repos.filter((r) => r.discoveredBy === "search").length;
  const depCount = links.filter((l) => l.kind === "depends_on").length;
  console.log(
    `\nWrote ${OUT}\n  ${repos.length} repos (${seedCount} frontier, ${searchCount} search-discovered) · ` +
      `${nodes.length} nodes · ${links.length} edges (${depCount} dependency)`
  );
  console.log(`  History snapshot: public/history/${generatedAt.slice(0, 10)}.json`);
  if (!AUTHED) console.log("\nNote: set GITHUB_TOKEN to enable default Search discovery + BFS enrichment.");
}

main().catch((e) => {
  console.error("\nIngest failed:", e.message);
  process.exit(1);
});
