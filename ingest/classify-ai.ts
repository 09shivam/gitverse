// AI classifier — replaces the keyword heuristic with Claude, grounded strictly
// in each repo's real description/topics/language. Classifies into one of the 5
// galaxies AND produces a concise ecosystem label. Batched into one request,
// results cached on disk so re-runs don't re-spend.
//
// Requires ANTHROPIC_API_KEY. When absent, build.ts falls back to classify.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { DomainId } from "../src/types.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(__dir, ".cache/ai-classify.json");

// Default to the latest capable model. Override with GV_MODEL if desired.
const MODEL = process.env.GV_MODEL || "claude-opus-4-8";

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

const DOMAINS: DomainId[] = ["ai", "web", "devops", "databases", "security"];

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

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      classifications: {
        type: "array",
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

  const catalog = todo
    .map(
      (r) =>
        `- ${r.full} | lang: ${r.language ?? "?"} | topics: ${
          r.topics.slice(0, 12).join(", ") || "none"
        } | ${(r.description || "(no description)").slice(0, 200)}`
    )
    .join("\n");

  const system =
    "You classify GitHub repositories into a software-ecosystem map. " +
    "For each repo, assign exactly one domain and a concise ecosystem label " +
    "(1-3 words, Title Case, e.g. 'Scientific Computing', 'HTTP Clients', " +
    "'Build Tooling', 'Vector Search'). Domains: " +
    "ai (ML/LLMs/data science/numerical), web (frontend/backend/HTTP/JS), " +
    "devops (containers/CI/cloud/infra/build systems), " +
    "databases (storage/query/SQL/vector/caching), " +
    "security (scanning/auth/crypto/vulnerabilities). " +
    "Base the decision ONLY on the provided metadata. Return every repo exactly once.";

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [
      {
        role: "user",
        content: `Classify these ${todo.length} repositories:\n\n${catalog}`,
      },
    ],
    // constrain output to the schema (Opus 4.8 supports structured outputs)
    output_config: { format: { type: "json_schema", schema } },
  } as any);

  const text = msg.content.find((b: any) => b.type === "text") as any;
  const parsed = JSON.parse(text?.text ?? '{"classifications":[]}');
  const byRepo = new Map<string, Classification>();
  for (const c of parsed.classifications ?? []) {
    if (DOMAINS.includes(c.domain)) {
      byRepo.set(String(c.repo).toLowerCase(), {
        domain: c.domain,
        ecosystem: c.ecosystem || "Libraries",
      });
    }
  }

  for (const r of todo) {
    const c = byRepo.get(r.full.toLowerCase());
    if (c) {
      out.set(r.full.toLowerCase(), c);
      cache[r.full.toLowerCase()] = c;
    }
  }
  saveCache(cache);
  return out;
}
