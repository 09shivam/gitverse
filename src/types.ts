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
