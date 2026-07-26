import type { DomainId } from "../src/types.ts";

// Heuristic domain classifier for BFS-discovered repos (which have no curated
// domain). Matches whole tokens (not substrings) from topics/description +
// a light language hint.
//
// Deliberate interim: transparent and swappable for the AI classifier
// (architecture §9) without changing anything downstream.

const KEYWORDS: Record<DomainId, string[]> = {
  ai: ["ml", "ai", "machine", "learning", "deep", "llm", "llms", "nlp", "neural", "transformer", "transformers", "model", "models", "inference", "pytorch", "tensorflow", "cuda", "gpu", "embedding", "embeddings", "diffusion", "dataset", "datasets", "tensor", "quantization", "science"],
  web: ["web", "frontend", "browser", "react", "vue", "svelte", "css", "html", "ui", "http", "server", "express", "node", "nodejs", "framework", "javascript", "typescript", "bundler", "rendering", "dom", "api", "rest"],
  cloud: ["cloud", "cloudnative", "native", "kubernetes", "k8s", "docker", "container", "containers", "orchestration", "helm", "service", "mesh", "istio", "envoy", "serverless", "aws", "gcp", "azure", "lambda"],
  devops: ["devops", "ci", "cd", "pipeline", "pipelines", "infrastructure", "terraform", "opentofu", "deployment", "deploy", "automation", "ansible", "jenkins", "build", "observability", "monitoring", "prometheus", "grafana"],
  data_engineering: ["etl", "elt", "pipeline", "pipelines", "spark", "airflow", "kafka", "flink", "streaming", "batch", "warehouse", "lakehouse", "orchestration", "dbt", "analytics", "dataflow", "dag"],
  databases: ["database", "databases", "sql", "postgres", "postgresql", "mysql", "sqlite", "redis", "storage", "query", "cache", "vector", "index", "olap", "oltp", "columnar"],
  blockchain: ["blockchain", "bitcoin", "ethereum", "web3", "crypto", "cryptocurrency", "wallet", "defi", "solidity", "smart", "contract", "contracts", "ledger", "consensus", "evm"],
  security: ["security", "cybersecurity", "vulnerability", "scanner", "sast", "dast", "secrets", "auth", "authentication", "cryptography", "cve", "exploit", "pentest", "firewall", "compliance", "encryption"],
  game_dev: ["game", "games", "gamedev", "engine", "engines", "graphics", "rendering", "renderer", "unity", "unreal", "godot", "bevy", "cocos", "sdl", "simulation"],
};

const LANG_HINT: Record<string, DomainId> = {
  hcl: "devops",
  dockerfile: "cloud",
  vue: "web",
  svelte: "web",
  sql: "databases",
  plpgsql: "databases",
  solidity: "blockchain",
  gdscript: "game_dev",
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
  const domains = Object.keys(KEYWORDS) as DomainId[];
  const score = Object.fromEntries(domains.map((d) => [d, 0])) as Record<DomainId, number>;

  for (const d of domains) {
    for (const kw of KEYWORDS[d]) {
      if (topicTokens.has(kw)) score[d] += 2; // topics are the strongest signal
      else if (descTokens.has(kw)) score[d] += 1;
    }
  }
  const langHint = language ? LANG_HINT[language.toLowerCase()] : undefined;
  if (langHint) score[langHint] += 0.5;

  let best: DomainId = langHint ?? "web";
  let bestScore = -1;
  for (const d of domains) {
    if (score[d] > bestScore) {
      best = d;
      bestScore = score[d];
    }
  }
  return best;
}
