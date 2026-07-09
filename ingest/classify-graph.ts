// Graph label-propagation classifier. Seeds carry known domains; we spread
// those labels through the real dependency + similarity graph so a repo is
// classified by the company it keeps. Free, deterministic, no API. Returns a
// domain + a confidence (vote margin) so the caller can send low-confidence
// repos to the LLM fallback.

import type { DomainId } from "../src/types.ts";

export interface GraphClass {
  domain: DomainId;
  confidence: number; // 0..1 — share of votes the winning domain received
}

export interface AffinityEdge {
  a: string;
  b: string;
  w: number;
}

/**
 * @param ids        every repo id
 * @param seedLabels id -> domain for the anchored seeds
 * @param edges      undirected affinity edges (dependency + similarity), weighted
 */
export function classifyGraph(
  ids: string[],
  seedLabels: Map<string, DomainId>,
  edges: AffinityEdge[],
  iterations = 15
): Map<string, GraphClass> {
  // undirected weighted adjacency
  const adj = new Map<string, { nb: string; w: number }[]>(ids.map((id) => [id, []]));
  for (const { a, b, w } of edges) {
    if (adj.has(a) && adj.has(b) && a !== b) {
      adj.get(a)!.push({ nb: b, w });
      adj.get(b)!.push({ nb: a, w });
    }
  }

  // current label per node (seeds fixed, others provisional)
  const label = new Map<string, DomainId>(seedLabels);

  for (let it = 0; it < iterations; it++) {
    const next = new Map<string, DomainId>(seedLabels); // seeds never move
    for (const id of ids) {
      if (seedLabels.has(id)) continue;
      const votes = tally(id, adj, label);
      const win = argmax(votes);
      if (win) next.set(id, win);
    }
    // stop early if stable
    let changed = false;
    for (const id of ids) if (next.get(id) !== label.get(id)) { changed = true; break; }
    label.clear();
    for (const [k, v] of next) label.set(k, v);
    if (!changed) break;
  }

  // final confidence from the settled labels
  const out = new Map<string, GraphClass>();
  for (const id of ids) {
    if (seedLabels.has(id)) continue;
    const votes = tally(id, adj, label);
    const total = [...votes.values()].reduce((s, v) => s + v, 0);
    const win = argmax(votes);
    if (win && total > 0) {
      out.set(id, { domain: win, confidence: votes.get(win)! / total });
    }
  }
  return out;
}

function tally(
  id: string,
  adj: Map<string, { nb: string; w: number }[]>,
  label: Map<string, DomainId>
): Map<DomainId, number> {
  const votes = new Map<DomainId, number>();
  for (const { nb, w } of adj.get(id) ?? []) {
    const d = label.get(nb);
    if (d) votes.set(d, (votes.get(d) ?? 0) + w);
  }
  return votes;
}

function argmax(votes: Map<DomainId, number>): DomainId | null {
  let best: DomainId | null = null;
  let bestV = 0;
  for (const [d, v] of votes) if (v > bestV) { best = d; bestV = v; }
  return best;
}
