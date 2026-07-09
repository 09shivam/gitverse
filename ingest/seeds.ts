import type { DomainId } from "../src/types.ts";

export interface Seed {
  /** owner/name on GitHub */
  repo: string;
  domain: DomainId;
  ecosystem: string;
  /** package name(s) this repo publishes — used to resolve dependency edges */
  provides?: string[];
}

export const DOMAIN_LABEL: Record<DomainId, string> = {
  ai: "Artificial Intelligence",
  web: "Web Development",
  devops: "DevOps & Cloud",
  databases: "Databases",
  security: "Security",
};

/**
 * Curated seed set — the "roots" the ingestion expands from. Real ingestion
 * would BFS outward from these; for now we resolve relationships among the set.
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

  // DevOps
  { repo: "kubernetes/kubernetes", domain: "devops", ecosystem: "Containers & Orchestration", provides: ["kubernetes", "k8s.io"] },
  { repo: "moby/moby", domain: "devops", ecosystem: "Containers & Orchestration", provides: ["docker", "moby"] },
  { repo: "hashicorp/terraform", domain: "devops", ecosystem: "Infrastructure as Code", provides: ["terraform"] },

  // Databases
  { repo: "postgres/postgres", domain: "databases", ecosystem: "Relational & Analytical", provides: ["postgres", "postgresql", "libpq"] },
  { repo: "redis/redis", domain: "databases", ecosystem: "Relational & Analytical", provides: ["redis"] },
  { repo: "duckdb/duckdb", domain: "databases", ecosystem: "Relational & Analytical", provides: ["duckdb"] },
  { repo: "pgvector/pgvector", domain: "databases", ecosystem: "Vector Databases", provides: ["pgvector"] },

  // Security
  { repo: "aquasecurity/trivy", domain: "security", ecosystem: "Scanning & SAST", provides: ["trivy"] },
  { repo: "semgrep/semgrep", domain: "security", ecosystem: "Scanning & SAST", provides: ["semgrep"] },
];
