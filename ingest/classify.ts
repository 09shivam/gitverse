import type { DomainId } from "../src/types.ts";

// Heuristic domain classifier for BFS-discovered repos (which have no curated
// domain). Matches whole tokens (not substrings) from topics/description +
// a light language hint.
//
// Deliberate interim: transparent and swappable for the AI classifier
// (architecture §9) without changing anything downstream.

const KEYWORDS: Record<DomainId, string[]> = {
  ai: ["ml", "ai", "machine", "learning", "deep", "llm", "llms", "nlp", "neural", "transformer", "transformers", "model", "models", "inference", "pytorch", "tensorflow", "cuda", "gpu", "embedding", "embeddings", "diffusion", "dataset", "datasets", "tensor", "quantization"],
  web: ["web", "frontend", "browser", "react", "vue", "svelte", "css", "html", "ui", "http", "server", "express", "node", "nodejs", "framework", "javascript", "typescript", "bundler", "rendering", "dom", "api", "rest"],
  devops: ["devops", "kubernetes", "k8s", "docker", "container", "containers", "cloud", "ci", "cd", "infrastructure", "terraform", "deployment", "orchestration", "helm", "observability", "serverless", "aws", "gcp", "azure", "build"],
  databases: ["database", "databases", "sql", "postgres", "postgresql", "mysql", "sqlite", "redis", "storage", "query", "cache", "vector", "index", "olap", "oltp", "columnar", "data", "dataframe", "analytics", "warehouse"],
  security: ["security", "vulnerability", "scanner", "sast", "dast", "secrets", "auth", "authentication", "crypto", "cryptography", "cve", "exploit", "pentest", "firewall", "compliance", "encryption"],
};

const LANG_HINT: Record<string, DomainId> = {
  hcl: "devops",
  dockerfile: "devops",
  go: "devops",
  vue: "web",
  svelte: "web",
  sql: "databases",
  plpgsql: "databases",
};

const tokenize = (s: string) =>
  new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

export function classifyDomain(
  topics: string[],
  language: string | null,
  description: string
): DomainId {
  const topicTokens = tokenize(topics.join(" "));
  const descTokens = tokenize(description);
  const score: Record<DomainId, number> = { ai: 0, web: 0, devops: 0, databases: 0, security: 0 };

  for (const d of Object.keys(KEYWORDS) as DomainId[]) {
    for (const kw of KEYWORDS[d]) {
      if (topicTokens.has(kw)) score[d] += 2; // topics are the strongest signal
      else if (descTokens.has(kw)) score[d] += 1;
    }
  }
  const langHint = language ? LANG_HINT[language.toLowerCase()] : undefined;
  if (langHint) score[langHint] += 0.5;

  let best: DomainId = langHint ?? "web";
  let bestScore = -1;
  for (const d of Object.keys(score) as DomainId[]) {
    if (score[d] > bestScore) {
      best = d;
      bestScore = score[d];
    }
  }
  return best;
}
