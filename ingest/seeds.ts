import type { DomainId } from "../src/types.ts";

export interface Seed {
  /** owner/name on GitHub */
  repo: string;
  /** fallback label used only when no model is configured */
  domain: DomainId;
  /** fallback label used only when no model is configured */
  ecosystem: string;
  /** package name(s) this repo publishes — used to resolve dependency edges */
  provides?: string[];
}

export const DOMAIN_LABEL: Record<DomainId, string> = {
  ai: "AI / Machine Learning",
  web: "Web Development",
  cloud: "Cloud Native",
  devops: "DevOps",
  data_engineering: "Data Engineering",
  databases: "Databases",
  blockchain: "Blockchain",
  security: "Cybersecurity",
  game_dev: "Game Development",
};

/**
 * Curated seed set — the crawl roots the ingestion expands from. Domain and
 * ecosystem are offline fallback labels; model classification overrides them.
 */
export const SEEDS: Seed[] = [
  // AI
  { repo: "pytorch/pytorch", domain: "ai", ecosystem: "Deep Learning Frameworks", provides: ["torch", "pytorch"] },
  { repo: "tensorflow/tensorflow", domain: "ai", ecosystem: "Deep Learning Frameworks", provides: ["tensorflow"] },
  { repo: "huggingface/transformers", domain: "ai", ecosystem: "Large Language Models", provides: ["transformers"] },
  { repo: "vllm-project/vllm", domain: "ai", ecosystem: "Large Language Models", provides: ["vllm"] },
  { repo: "langchain-ai/langchain", domain: "ai", ecosystem: "Large Language Models", provides: ["langchain"] },

  // Web
  { repo: "facebook/react", domain: "web", ecosystem: "Frontend Frameworks", provides: ["react"] },
  { repo: "vuejs/core", domain: "web", ecosystem: "Frontend Frameworks", provides: ["vue"] },
  { repo: "vercel/next.js", domain: "web", ecosystem: "Frontend Frameworks", provides: ["next"] },
  { repo: "nodejs/node", domain: "web", ecosystem: "Node.js Backend", provides: ["node"] },
  { repo: "expressjs/express", domain: "web", ecosystem: "Node.js Backend", provides: ["express"] },

  // Cloud native
  { repo: "kubernetes/kubernetes", domain: "cloud", ecosystem: "Container Orchestration", provides: ["kubernetes", "k8s.io"] },
  { repo: "moby/moby", domain: "cloud", ecosystem: "Container Runtime", provides: ["docker", "moby"] },
  { repo: "istio/istio", domain: "cloud", ecosystem: "Service Mesh", provides: ["istio"] },
  { repo: "envoyproxy/envoy", domain: "cloud", ecosystem: "Service Proxy", provides: ["envoy"] },

  // DevOps
  { repo: "hashicorp/terraform", domain: "devops", ecosystem: "Infrastructure as Code", provides: ["terraform"] },
  { repo: "opentofu/opentofu", domain: "devops", ecosystem: "Infrastructure as Code", provides: ["opentofu"] },
  { repo: "ansible/ansible", domain: "devops", ecosystem: "Configuration Management", provides: ["ansible"] },
  { repo: "jenkinsci/jenkins", domain: "devops", ecosystem: "CI/CD", provides: ["jenkins"] },

  // Data Engineering
  { repo: "apache/spark", domain: "data_engineering", ecosystem: "Batch Processing", provides: ["spark", "pyspark"] },
  { repo: "apache/airflow", domain: "data_engineering", ecosystem: "Workflow Orchestration", provides: ["apache-airflow", "airflow"] },
  { repo: "apache/kafka", domain: "data_engineering", ecosystem: "Streaming", provides: ["kafka"] },
  { repo: "dbt-labs/dbt-core", domain: "data_engineering", ecosystem: "Data Transformation", provides: ["dbt-core", "dbt"] },

  // Databases
  { repo: "postgres/postgres", domain: "databases", ecosystem: "Relational & Analytical", provides: ["postgres", "postgresql", "libpq"] },
  { repo: "redis/redis", domain: "databases", ecosystem: "Relational & Analytical", provides: ["redis"] },
  { repo: "duckdb/duckdb", domain: "databases", ecosystem: "Relational & Analytical", provides: ["duckdb"] },
  { repo: "pgvector/pgvector", domain: "databases", ecosystem: "Vector Databases", provides: ["pgvector"] },

  // Cybersecurity
  { repo: "aquasecurity/trivy", domain: "security", ecosystem: "Scanning & SAST", provides: ["trivy"] },
  { repo: "semgrep/semgrep", domain: "security", ecosystem: "Scanning & SAST", provides: ["semgrep"] },
  { repo: "zaproxy/zaproxy", domain: "security", ecosystem: "Dynamic Analysis", provides: ["zaproxy"] },
  { repo: "gitleaks/gitleaks", domain: "security", ecosystem: "Secret Scanning", provides: ["gitleaks"] },

  // Blockchain
  { repo: "bitcoin/bitcoin", domain: "blockchain", ecosystem: "Protocol Clients", provides: ["bitcoin"] },
  { repo: "ethereum/go-ethereum", domain: "blockchain", ecosystem: "Protocol Clients", provides: ["geth", "go-ethereum"] },
  { repo: "hyperledger/fabric", domain: "blockchain", ecosystem: "Enterprise Blockchain", provides: ["fabric"] },
  { repo: "foundry-rs/foundry", domain: "blockchain", ecosystem: "Smart Contracts", provides: ["foundry", "forge"] },

  // Game Development
  { repo: "godotengine/godot", domain: "game_dev", ecosystem: "Game Engines", provides: ["godot"] },
  { repo: "bevyengine/bevy", domain: "game_dev", ecosystem: "Game Engines", provides: ["bevy"] },
  { repo: "cocos/cocos-engine", domain: "game_dev", ecosystem: "Game Engines", provides: ["cocos"] },
  { repo: "libsdl-org/SDL", domain: "game_dev", ecosystem: "Game Frameworks", provides: ["sdl", "sdl2"] },

  // Recent / trending (2024–2025) — extend the timeline to the present.
  // These are genuinely recently-created repos; GitHub is the source of truth
  // for their real createdAt, so the timeline axis grows to include them.
  { repo: "deepseek-ai/DeepSeek-R1", domain: "ai", ecosystem: "Large Language Models", provides: ["deepseek-r1"] },
  { repo: "deepseek-ai/DeepSeek-V3", domain: "ai", ecosystem: "Large Language Models", provides: ["deepseek-v3"] },
  { repo: "openai/codex", domain: "ai", ecosystem: "AI Coding Agents", provides: ["codex"] },
  { repo: "anthropics/claude-code", domain: "ai", ecosystem: "AI Coding Agents", provides: ["@anthropic-ai/claude-code", "claude-code"] },
  { repo: "browser-use/browser-use", domain: "ai", ecosystem: "LLM Agents", provides: ["browser-use"] },
  { repo: "microsoft/markitdown", domain: "ai", ecosystem: "LLM Tooling", provides: ["markitdown"] },
  { repo: "huggingface/smolagents", domain: "ai", ecosystem: "LLM Agents", provides: ["smolagents"] },
  { repo: "electric-sql/pglite", domain: "databases", ecosystem: "Embedded Databases", provides: ["@electric-sql/pglite", "pglite"] },
];
