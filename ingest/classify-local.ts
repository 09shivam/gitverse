// Local-model classifier — talks to any OpenAI-compatible chat endpoint
// (mlx_lm.server, Ollama, vLLM, LM Studio, llama.cpp server, …) so a local
// Qwen (or any model) can do the categorization instead of Claude.
//
// Enabled by GV_LOCAL_URL. Real-time: repos are classified in small live
// batches during ingest, results cached on disk so re-runs don't re-spend.
//
//   GV_LOCAL_URL=http://localhost:8080/v1   # server base (OpenAI-compatible)
//   GV_LOCAL_MODEL=qwen2.5-3b               # model name the server expects

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DomainId } from "../src/types.ts";
import type { RepoForClass, Classification } from "./classify-ai.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(__dir, ".cache/local-classify-domains-v2.json");

const BASE = (process.env.GV_LOCAL_URL || "").replace(/\/$/, "");
export const LOCAL_ENABLED = BASE.length > 0;
export const LOCAL_MODEL = process.env.GV_LOCAL_MODEL || "qwen2.5-3b";
export const LOCAL_LABEL = `local (${LOCAL_MODEL})`;

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
const BATCH = Number(process.env.GV_LOCAL_BATCH ?? 10);

function endpoint(): string {
  return BASE.endsWith("/chat/completions") ? BASE : `${BASE}/chat/completions`;
}

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

const SYSTEM =
  "You classify GitHub repositories into a software-ecosystem map. " +
  "For each repo assign exactly one domain and a concise ecosystem label " +
  "(1-3 words, Title Case, e.g. 'Scientific Computing', 'HTTP Clients', 'Vector Search'). " +
  "Domains: ai (ML/LLMs/agents/model tooling), web (frontend/backend/HTTP/JS), " +
  "cloud (Kubernetes/containers/service mesh/serverless/cloud platforms), " +
  "devops (CI/CD/IaC/deployment/build/observability), " +
  "data_engineering (ETL/pipelines/streaming/Spark/Kafka/Airflow/warehouses), " +
  "databases (storage/query/SQL/NoSQL/vector/caching), " +
  "blockchain (ledgers/Web3/smart contracts/wallets/DeFi), " +
  "security (cybersecurity/scanning/auth/secrets/CVEs), " +
  "game_dev (game engines/rendering/graphics/simulation/tooling). " +
  "Base the decision ONLY on the provided metadata. " +
  'Reply with ONLY a JSON object of the form ' +
  '{"classifications":[{"repo":"owner/name","domain":"ai","ecosystem":"Label"}]} ' +
  "and nothing else.";

// Pull the first well-formed JSON object out of a model reply.
function extractJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function classifyBatch(repos: RepoForClass[]): Promise<Map<string, Classification>> {
  const catalog = repos
    .map(
      (r) =>
        `- ${r.full} | lang: ${r.language ?? "?"} | topics: ${
          r.topics.slice(0, 12).join(", ") || "none"
        } | ${(r.description || "(no description)").slice(0, 200)}`
    )
    .join("\n");

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // some servers want a bearer token; harmless if ignored
      Authorization: `Bearer ${process.env.GV_LOCAL_KEY || "local"}`,
    },
    body: JSON.stringify({
      model: LOCAL_MODEL,
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: "json_object" }, // honored by many servers; ignored otherwise
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Classify these ${repos.length} repositories:\n\n${catalog}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`local model HTTP ${res.status} — is the server at ${BASE} running?`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);

  const out = new Map<string, Classification>();
  for (const c of parsed?.classifications ?? []) {
    if (DOMAINS.includes(c.domain)) {
      out.set(String(c.repo).toLowerCase(), {
        domain: c.domain,
        ecosystem: c.ecosystem || "Libraries",
      });
    }
  }
  return out;
}

/** Classify repos into {domain, ecosystem} via the local model. Cached by full-name. */
export async function classifyReposLocal(
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

  // real-time, small live batches so a 3B model stays accurate and responsive
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const got = await classifyBatch(slice);
    for (const r of slice) {
      const c = got.get(r.full.toLowerCase());
      if (c) {
        out.set(r.full.toLowerCase(), c);
        cache[r.full.toLowerCase()] = c;
      }
    }
    console.log(`    · local classifier: ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  saveCache(cache);
  return out;
}
