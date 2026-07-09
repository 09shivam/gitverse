// GitVerse ingestion — BFS frontier expansion from the seed set.
//
// Starting at the curated seeds, we fetch each repo, resolve its real
// dependencies (SBOM) to their GitHub repos, and enqueue newly-discovered ones
// up to a depth/budget. Discovered repos are classified into a galaxy by
// heuristic. Output is public/graph.json in the GVGraph shape.
//
// Run:  npm run ingest                          (unauth: seeds only)
//       GITHUB_TOKEN=… npm run ingest           (auth: expands 1 hop, ~60 repos)
//       GV_DEPTH=2 GV_BUDGET=120 … npm run ingest

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GVGraph, GVNode, GVEdge, DomainId } from "../src/types.ts";
import { SEEDS, DOMAIN_LABEL, type Seed } from "./seeds.ts";
import { gh, AUTHED } from "./github.ts";
import { parsePurl, resolveToRepo } from "./resolve.ts";
import { classifyDomain } from "./classify.ts";
import { classifyReposAI, AI_ENABLED } from "./classify-ai.ts";
import { classifyGraph, type AffinityEdge } from "./classify-graph.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = pathResolve(__dir, "../public/graph.json");

const MAX_DEPTH = Number(process.env.GV_DEPTH ?? (AUTHED ? 1 : 0));
const BUDGET = Number(process.env.GV_BUDGET ?? (AUTHED ? 60 : SEEDS.length));
const MAX_DEPS_PER_REPO = 25;
// dependency ecosystems we follow (real software deps, not CI tooling)
const FOLLOW_TYPES = new Set(["npm", "pypi", "cargo", "golang"]);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const year = (iso: string) => new Date(iso).getFullYear();
const norm = (v: number, min: number, max: number) => (max > min ? (v - min) / (max - min) : 0.5);
const repoIdOf = (full: string) => "r-" + slug(full);

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
  stars: number;
  createdAt: number;
  topics: string[];
  description: string;
  language: string | null;
  starsPerDay: number;
  activity?: number;
  contributors?: number;
  depRepos: string[]; // resolved dependency repo full-names
  depth: number;
}

// fast path: known seed package names -> repo full name (skips registry calls)
const pkgKnown = new Map<string, string>();
for (const s of SEEDS) for (const p of s.provides ?? []) pkgKnown.set(p.toLowerCase(), s.repo);

async function fetchCore(full: string): Promise<Omit<RepoData, "domain" | "ecosystem" | "depth"> | null> {
  const res = await gh<any>(`/repos/${full}`);
  if (!res.ok || !res.data) return null;
  const d = res.data;
  const created = d.created_at as string;
  const ageDays = Math.max(1, (Date.now() - new Date(created).getTime()) / 86_400_000);
  return {
    full,
    id: repoIdOf(full),
    label: d.name,
    stars: d.stargazers_count ?? 0,
    createdAt: year(created),
    topics: (d.topics ?? []).map((t: string) => t.toLowerCase()),
    description: d.description ?? "",
    language: d.language ?? null,
    starsPerDay: (d.stargazers_count ?? 0) / ageDays,
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

async function main() {
  console.log(
    `GitVerse ingest — ${AUTHED ? "authenticated" : "UNAUTHENTICATED"} · ` +
      `depth ${MAX_DEPTH}, budget ${BUDGET} · ` +
      `classifier: ${AI_ENABLED ? "AI (Claude)" : "heuristic"}\n`
  );

  const seedByFull = new Map(SEEDS.map((s) => [s.repo.toLowerCase(), s]));
  const visited = new Map<string, RepoData>();
  const queued = new Set<string>(SEEDS.map((s) => s.repo.toLowerCase()));
  const queue: { full: string; depth: number }[] = SEEDS.map((s) => ({ full: s.repo, depth: 0 }));

  while (queue.length && visited.size < BUDGET) {
    const { full, depth } = queue.shift()!;
    const low = full.toLowerCase();
    if (visited.has(low)) continue;

    const core = await fetchCore(full);
    if (!core) {
      console.warn(`  ! ${full}: fetch failed`);
      continue;
    }

    const seed = seedByFull.get(low);
    const domain: DomainId = seed ? seed.domain : classifyDomain(core.topics, core.language, core.description);
    const ecosystem = seed ? seed.ecosystem : `${DOMAIN_LABEL[domain]} Libraries`;
    const rd: RepoData = { ...core, domain, ecosystem, depth };

    if (AUTHED) await enrich(rd);
    visited.set(low, rd);
    console.log(
      `  ✓ [d${depth}] ${full} — ${rd.stars.toLocaleString()}★ · ${DOMAIN_LABEL[domain]}` +
        (rd.depRepos.length ? ` · ${rd.depRepos.length} deps` : "")
    );

    if (depth < MAX_DEPTH) {
      for (const dep of rd.depRepos) {
        const dlow = dep.toLowerCase();
        if (!queued.has(dlow) && visited.size + queued.size < BUDGET * 2) {
          queued.add(dlow);
          queue.push({ full: dep, depth: depth + 1 });
        }
      }
    }
  }

  const repos = [...visited.values()];
  if (repos.length === 0) throw new Error("No repos fetched — check network / rate limit / token.");

  // ---- edges among included repos (also feed the classifier) ----
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

  // ---- hybrid classification of discovered repos ----
  // 1) graph label-propagation (free) — spread the seeds' known domains.
  const seedLabels = new Map<string, DomainId>();
  for (const r of repos) if (r.depth === 0) seedLabels.set(r.id, r.domain);
  const affinity: AffinityEdge[] = [
    ...depEdges.map(([a, b]) => ({ a, b, w: 1 })),
    ...simPairs.map(([a, b]) => ({ a, b, w: 3 })), // shared-topic ties are strong
  ];
  const graphCls = classifyGraph(repos.map((r) => r.id), seedLabels, affinity);

  // Trust the graph only when it AGREES with the repo's own text signal — this
  // guards against the AI-seeds' dense fan-out pulling every shared lib into AI.
  // Disagreements are the genuinely ambiguous cases → LLM (or heuristic).
  const discovered = repos.filter((r) => r.depth > 0);
  const CONF = 0.6;
  const uncertain: RepoData[] = [];
  let byGraph = 0;
  for (const r of discovered) {
    const gc = graphCls.get(r.id);
    const textDom = classifyDomain(r.topics, r.language, r.description);
    if (gc && gc.confidence >= CONF && gc.domain === textDom) {
      r.domain = gc.domain;
      r.ecosystem = topicEcosystem(r.topics, gc.domain);
      byGraph++;
    } else {
      uncertain.push(r); // 2) send ambiguous ones to the LLM (or heuristic)
    }
  }

  let byLLM = 0;
  let llmFailed = false;
  if (uncertain.length && AI_ENABLED) {
    try {
      const cls = await classifyReposAI(
        uncertain.map((r) => ({ full: r.full, description: r.description, topics: r.topics, language: r.language }))
      );
      for (const r of uncertain) {
        const c = cls.get(r.full.toLowerCase());
        if (c) {
          r.domain = c.domain;
          r.ecosystem = c.ecosystem;
          byLLM++;
        } else {
          r.ecosystem = topicEcosystem(r.topics, r.domain);
        }
      }
    } catch (e: any) {
      llmFailed = true;
      console.warn(`  ! LLM classification failed (${e.message}) — using heuristic fallback`);
    }
  }
  if (!uncertain.length) {
    // nothing to do
  } else if (!AI_ENABLED || llmFailed) {
    for (const r of uncertain) {
      r.domain = classifyDomain(r.topics, r.language, r.description);
      r.ecosystem = topicEcosystem(r.topics, r.domain);
    }
  }
  console.log(
    `\nClassified ${discovered.length} discovered repos — ` +
      `graph: ${byGraph}, ${AI_ENABLED && !llmFailed ? `LLM: ${byLLM}` : `heuristic: ${uncertain.length}`}`
  );

  // ---- metrics ----
  const spd = repos.map((r) => r.starsPerDay);
  const spdMin = Math.min(...spd);
  const spdMax = Math.max(...spd);
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
      momentum: Number(clamp01(norm(r.starsPerDay, spdMin, spdMax)).toFixed(2)),
      activity: r.activity,
      contributors: r.contributors,
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

  const graph: GVGraph = { nodes, links };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(graph, null, 2));

  const seedCount = repos.filter((r) => r.depth === 0).length;
  const depCount = links.filter((l) => l.kind === "depends_on").length;
  console.log(
    `\nWrote ${OUT}\n  ${repos.length} repos (${seedCount} seeds + ${repos.length - seedCount} discovered) · ` +
      `${nodes.length} nodes · ${links.length} edges (${depCount} dependency)`
  );
  if (!AUTHED) console.log("\nNote: set GITHUB_TOKEN to expand beyond the seeds (BFS needs SBOM access).");
}

main().catch((e) => {
  console.error("\nIngest failed:", e.message);
  process.exit(1);
});
