import type { DomainId, DiscoverySource } from "../src/types.ts";
import { gh } from "./github.ts";

export type SearchMode = "new" | "active" | "popular";

export interface SearchCandidate {
  full: string;
  hintedDomain: DomainId;
  discoveredBy: DiscoverySource;
  signals: string[];
}

interface SearchRepo {
  full_name: string;
}

interface SearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: SearchRepo[];
}

const DOMAIN_TERMS: Record<DomainId, string[]> = {
  ai: ["llm", "ai agent"],
  web: ["web framework", "frontend"],
  cloud: ["cloud native", "kubernetes", "service mesh"],
  devops: ["devops", "infrastructure as code", "ci cd"],
  data_engineering: ["data engineering", "etl pipeline", "stream processing"],
  databases: ["database", "vector database"],
  blockchain: ["blockchain", "smart contract", "web3"],
  security: ["cybersecurity", "security", "sast"],
  game_dev: ["game engine", "game development", "gamedev"],
};

const SEARCH_MODES: SearchMode[] = ["new", "active", "popular"];
const PER_QUERY = Number(process.env.GV_SEARCH_PER_QUERY ?? 8);
const SEARCH_BUDGET = Number(process.env.GV_SEARCH_BUDGET ?? 180);
const NEW_DAYS = Number(process.env.GV_SEARCH_NEW_DAYS ?? 365);
const ACTIVE_DAYS = Number(process.env.GV_SEARCH_ACTIVE_DAYS ?? 90);
const MIN_NEW_STARS = Number(process.env.GV_SEARCH_MIN_NEW_STARS ?? 50);
const MIN_ACTIVE_STARS = Number(process.env.GV_SEARCH_MIN_ACTIVE_STARS ?? 250);
const MIN_POPULAR_STARS = Number(process.env.GV_SEARCH_MIN_POPULAR_STARS ?? 3000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isoDateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function queryFor(term: string, mode: SearchMode): { q: string; sort: string } {
  const base = `${term} in:name,description,topics archived:false mirror:false fork:false`;
  if (mode === "new") {
    return {
      q: `${base} created:>=${isoDateDaysAgo(NEW_DAYS)} stars:>=${MIN_NEW_STARS}`,
      sort: "stars",
    };
  }
  if (mode === "active") {
    return {
      q: `${base} pushed:>=${isoDateDaysAgo(ACTIVE_DAYS)} stars:>=${MIN_ACTIVE_STARS}`,
      sort: "updated",
    };
  }
  return {
    q: `${base} stars:>=${MIN_POPULAR_STARS}`,
    sort: "stars",
  };
}

async function searchRepos(
  domain: DomainId,
  term: string,
  mode: SearchMode
): Promise<SearchCandidate[]> {
  const { q, sort } = queryFor(term, mode);
  const path =
    `/search/repositories?q=${encodeURIComponent(q)}` +
    `&sort=${sort}&order=desc&per_page=${PER_QUERY}`;
  const res = await gh<SearchResponse>(path);
  if (!res.ok || !res.data) {
    console.warn(`  ! search ${domain}/${mode}/${term}: HTTP ${res.status}`);
    return [];
  }
  return res.data.items
    .filter((r) => r.full_name)
    .map((r) => ({
      full: r.full_name,
      hintedDomain: domain,
      discoveredBy: "search",
      signals: [`${domain}:${mode}`],
    }));
}

export async function discoverSearchRepos(): Promise<SearchCandidate[]> {
  const byFull = new Map<string, SearchCandidate>();
  let requestCount = 0;

  for (const domain of Object.keys(DOMAIN_TERMS) as DomainId[]) {
    for (const term of DOMAIN_TERMS[domain]) {
      for (const mode of SEARCH_MODES) {
        if (byFull.size >= SEARCH_BUDGET) break;
        const got = await searchRepos(domain, term, mode);
        requestCount++;
        for (const c of got) {
          const key = c.full.toLowerCase();
          const existing = byFull.get(key);
          if (existing) {
            existing.signals = [...new Set([...existing.signals, ...c.signals])];
          } else {
            byFull.set(key, c);
          }
          if (byFull.size >= SEARCH_BUDGET) break;
        }
        // The Search API has its own tight bucket; keep the loop conservative.
        await sleep(2200);
      }
    }
  }

  const out = [...byFull.values()].slice(0, SEARCH_BUDGET);
  console.log(`\nSearch discovery — ${out.length} repos from ${requestCount} GitHub Search queries`);
  return out;
}
