export type NodeKind = "domain" | "ecosystem" | "repo";

export type DomainId =
  | "ai"
  | "web"
  | "devops"
  | "databases"
  | "security";

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
}
