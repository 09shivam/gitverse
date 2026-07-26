export type NodeKind = "domain" | "ecosystem" | "repo";

export type DiscoverySource = "seed" | "search" | "dependency";

export type RepoBadge = "new" | "trending" | "active";

export type DomainId =
  | "ai"
  | "web"
  | "cloud"
  | "devops"
  | "data_engineering"
  | "databases"
  | "blockchain"
  | "security"
  | "game_dev";

export interface GVNode {
  id: string;
  label: string;
  kind: NodeKind;
  domain: DomainId;
  /** popularity proxy (stars in thousands) — drives node size */
  stars?: number;
  /** graph centrality proxy 0..1 — "foundational-ness" */
  pagerank?: number;
  /** trending score 0..1 — recent star/attention velocity */
  momentum?: number;
  /** explicit trend score 0..1 — current GitHub attention/activity */
  trendScore?: number;
  /** explicit newness score 0..1 — favors recently-created repos with traction */
  newScore?: number;
  /** explicit contribution score 0..1 — recent commit + contributor activity */
  contributionScore?: number;
  /** stars per day since creation, preserved from ingest scoring */
  starsPerDay?: number;
  /** recent commits in the last 90 days */
  recentCommits?: number;
  /** where this repo entered the ingest frontier */
  discoveredBy?: DiscoverySource;
  /** search modes that found this repo, e.g. new/active/popular */
  discoverySignals?: string[];
  /** top-level ranks used by the "now" UI */
  trendRank?: number;
  newRank?: number;
  contributionRank?: number;
  /** visual highlight categories */
  badges?: RepoBadge[];
  /** recent development activity — commits in the last 90 days */
  activity?: number;
  /** distinct contributors */
  contributors?: number;
  /** total forks */
  forks?: number;
  /** open issues + PRs */
  openIssues?: number;
  /** SPDX license id, e.g. "MIT", "Apache-2.0" */
  license?: string;
  /** primary language, e.g. "Python", "TypeScript" */
  language?: string;
  /** owner login (org or user) */
  owner?: string;
  /** project homepage or repo URL */
  url?: string;
  /** canonical github.com/owner/repo URL */
  github?: string;
  /** year of the most recent push — "still alive?" vs createdAt */
  lastPush?: number;
  /** year the project/ecosystem appeared — drives the timeline */
  createdAt: number;
  description?: string;
  // runtime layout fields injected by force-graph
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export type EdgeKind =
  | "contains"
  | "depends_on"
  | "shares_tech"
  | "similar_to";

export interface GVEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  /** year the relationship became true */
  createdAt: number;
}

export interface GVGraph {
  nodes: GVNode[];
  links: GVEdge[];
  generatedAt?: string;
  summary?: {
    repoCount: number;
    searchEnabled?: boolean;
    classifier?: string;
  };
}
