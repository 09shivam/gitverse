// AI classifier — replaces the keyword heuristic with Claude, grounded strictly
// in each repo's real description/topics/language. Classifies into one of the
// GitVerse galaxies AND produces a concise ecosystem label. Batched and cached
// on disk so re-runs don't re-spend.
//
// Requires ANTHROPIC_API_KEY. When absent, build.ts falls back to classify.ts.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { DomainId } from "../src/types.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(__dir, ".cache/ai-classify-domains-v2.json");

// Override with GV_MODEL if desired.
const MODEL = process.env.GV_MODEL || "claude-opus-4-6";
const BATCH = Number(process.env.GV_AI_BATCH ?? 25);

export const AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;

export interface RepoForClass {
  full: string;
  description: string;
  topics: string[];
  language: string | null;
}

export interface Classification {
  domain: DomainId;
  ecosystem: string;
}

const DOMAINS: DomainId[] = [
  "ai",
  "web",
  "cloud",
  "devops",
  "data_engineering",
  "databases",
  "blockchain",
  "security",
  "game_dev",
];

function loadCache(): Record<string, Classification> {
  try {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}
function saveCache(c: Record<string, Classification>) {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(c, null, 2));
}

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Claude response did not contain JSON");
  }
}

async function classifyBatch(
  client: Anthropic,
  repos: RepoForClass[]
): Promise<Map<string, Classification>> {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      classifications: {
        type: "array",
        minItems: repos.length,
        maxItems: repos.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            repo: { type: "string" },
            domain: { type: "string", enum: DOMAINS },
            ecosystem: { type: "string" },
          },
          required: ["repo", "domain", "ecosystem"],
        },
      },
    },
    required: ["classifications"],
  };

  const catalog = repos
    .map(
      (r) =>
        `- ${r.full} | lang: ${r.language ?? "?"} | topics: ${
          r.topics.slice(0, 16).join(", ") || "none"
        } | ${(r.description || "(no description)").slice(0, 260)}`
    )
    .join("\n");

  const system =
    "You classify GitHub repositories into a software-ecosystem map. " +
    "For each repo, assign exactly one domain and one concise ecosystem label. " +
    "Domains: " +
    "ai = ML, LLMs, agents, data science, numerical computing, model tooling; " +
    "web = frontend, backend, HTTP, JavaScript/TypeScript frameworks, browsers; " +
    "cloud = cloud-native platforms, Kubernetes, containers, service mesh, serverless, cloud providers; " +
    "devops = CI/CD, infrastructure as code, deployment automation, build systems, observability; " +
    "data_engineering = ETL/ELT, data pipelines, streaming, Spark, Kafka, Airflow, warehouses/lakehouses; " +
    "databases = storage engines, query engines, SQL/NoSQL, analytics databases, vector search, caching; " +
    "blockchain = distributed ledgers, crypto protocols, wallets, Web3, smart contracts, DeFi; " +
    "security = cybersecurity, vulnerability scanning, auth, secrets, SAST/DAST, CVEs, appsec; " +
    "game_dev = game engines, rendering, graphics, simulation, game frameworks and tooling. " +
    "Use only the provided repo metadata. Return every repo exactly once, " +
    "with the repo field exactly matching the owner/name input. Ecosystem labels " +
    "must be 1-3 words in Title Case, for example 'LLM Agents', 'Frontend Frameworks', " +
    "'Infrastructure as Code', 'Vector Search', or 'Static Analysis'.";

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0,
    system,
    messages: [
      {
        role: "user",
        content: `Classify these ${repos.length} repositories:\n\n${catalog}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema } },
  } as any);

  const text = msg.content.find((b: any) => b.type === "text") as any;
  const parsed = extractJson(text?.text ?? "");
  const out = new Map<string, Classification>();
  for (const c of parsed.classifications ?? []) {
    if (DOMAINS.includes(c.domain) && typeof c.ecosystem === "string") {
      out.set(String(c.repo).toLowerCase(), {
        domain: c.domain,
        ecosystem: c.ecosystem.trim() || "Libraries",
      });
    }
  }
  return out;
}

/**
 * Classify repos into {domain, ecosystem}. Cached by repo full-name; only
 * uncached repos are sent to Claude. Returns a map keyed by lowercased full-name.
 */
export async function classifyReposAI(
  repos: RepoForClass[]
): Promise<Map<string, Classification>> {
  const cache = loadCache();
  const out = new Map<string, Classification>();
  const todo: RepoForClass[] = [];

  for (const r of repos) {
    const hit = cache[r.full.toLowerCase()];
    if (hit) out.set(r.full.toLowerCase(), hit);
    else todo.push(r);
  }
  if (todo.length === 0) return out;

  const client = new Anthropic();

  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const byRepo = await classifyBatch(client, slice);

    for (const r of slice) {
      const c = byRepo.get(r.full.toLowerCase());
      if (c) {
        out.set(r.full.toLowerCase(), c);
        cache[r.full.toLowerCase()] = c;
      }
    }
    saveCache(cache);
    console.log(`    · Claude classifier: ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  return out;
}
