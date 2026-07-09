import type { GVGraph, DomainId } from "../types";

export const DOMAIN_META: Record<
  DomainId,
  { label: string; color: string }
> = {
  ai: { label: "Artificial Intelligence", color: "#7c5cff" },
  web: { label: "Web Development", color: "#22c1a6" },
  devops: { label: "DevOps & Cloud", color: "#ff8a4c" },
  databases: { label: "Databases", color: "#4c8dff" },
  security: { label: "Security", color: "#ff5c8a" },
};

/**
 * Small hand-curated slice of the "software universe" used to prove out the
 * frontend before the real ingestion pipeline exists. Structure mirrors the
 * production hierarchy: Domain -> Ecosystem -> Repo, plus cross-cutting
 * dependency / shared-tech / semantic-similarity edges. `createdAt` years feed
 * the timeline scrubber. Everything here is illustrative sample data.
 */
export const sampleGraph: GVGraph = {
  nodes: [
    // ---- Domains (galaxies) ----
    { id: "d-ai", label: "AI", kind: "domain", domain: "ai", createdAt: 2008, pagerank: 1, stars: 900, description: "Machine learning, LLMs, model tooling." },
    { id: "d-web", label: "Web", kind: "domain", domain: "web", createdAt: 2008, pagerank: 1, stars: 900, description: "Frontend and backend web frameworks." },
    { id: "d-devops", label: "DevOps", kind: "domain", domain: "devops", createdAt: 2008, pagerank: 1, stars: 900, description: "CI/CD, containers, infrastructure." },
    { id: "d-db", label: "Databases", kind: "domain", domain: "databases", createdAt: 2008, pagerank: 1, stars: 900, description: "Storage, query engines, vector stores." },
    { id: "d-sec", label: "Security", kind: "domain", domain: "security", createdAt: 2008, pagerank: 1, stars: 900, description: "AppSec, scanning, secrets, auth." },

    // ---- AI ecosystem ----
    { id: "e-llm", label: "Large Language Models", kind: "ecosystem", domain: "ai", createdAt: 2018, pagerank: 0.9, stars: 400 },
    { id: "e-dl", label: "Deep Learning Frameworks", kind: "ecosystem", domain: "ai", createdAt: 2015, pagerank: 0.9, stars: 400 },
    { id: "r-pytorch", label: "pytorch", kind: "repo", domain: "ai", createdAt: 2016, stars: 82, pagerank: 0.98, momentum: 0.7, activity: 4200, contributors: 3400, description: "Tensors and dynamic neural networks with GPU acceleration." },
    { id: "r-tensorflow", label: "tensorflow", kind: "repo", domain: "ai", createdAt: 2015, stars: 185, pagerank: 0.85, momentum: 0.28, activity: 1800, contributors: 3600, description: "End-to-end machine learning platform." },
    { id: "r-transformers", label: "transformers", kind: "repo", domain: "ai", createdAt: 2018, stars: 133, pagerank: 0.95, momentum: 0.92, activity: 5200, contributors: 2900, description: "State-of-the-art pretrained models (Hugging Face)." },
    { id: "r-vllm", label: "vllm", kind: "repo", domain: "ai", createdAt: 2023, stars: 31, pagerank: 0.7, momentum: 0.98, activity: 6100, contributors: 900, description: "High-throughput LLM serving engine." },
    { id: "r-langchain", label: "langchain", kind: "repo", domain: "ai", createdAt: 2022, stars: 93, pagerank: 0.72, momentum: 0.88, activity: 3800, contributors: 3100, description: "Framework for building LLM-powered applications." },

    // ---- Web ecosystem ----
    { id: "e-frontend", label: "Frontend Frameworks", kind: "ecosystem", domain: "web", createdAt: 2013, pagerank: 0.9, stars: 400 },
    { id: "e-node", label: "Node.js Backend", kind: "ecosystem", domain: "web", createdAt: 2010, pagerank: 0.9, stars: 400 },
    { id: "r-react", label: "react", kind: "repo", domain: "web", createdAt: 2013, stars: 228, pagerank: 0.97, momentum: 0.6, activity: 900, contributors: 1600, description: "Library for building user interfaces." },
    { id: "r-vue", label: "vue", kind: "repo", domain: "web", createdAt: 2014, stars: 207, pagerank: 0.8, momentum: 0.38, activity: 400, contributors: 500, description: "Progressive JavaScript framework." },
    { id: "r-next", label: "next.js", kind: "repo", domain: "web", createdAt: 2016, stars: 125, pagerank: 0.82, momentum: 0.85, activity: 3400, contributors: 3000, description: "The React framework for production." },
    { id: "r-node", label: "node", kind: "repo", domain: "web", createdAt: 2009, stars: 107, pagerank: 0.9, momentum: 0.5, activity: 1200, contributors: 3500, description: "JavaScript runtime built on V8." },
    { id: "r-express", label: "express", kind: "repo", domain: "web", createdAt: 2010, stars: 65, pagerank: 0.78, momentum: 0.2, activity: 120, contributors: 300, description: "Fast, minimalist web framework for Node." },

    // ---- DevOps ecosystem ----
    { id: "e-containers", label: "Containers & Orchestration", kind: "ecosystem", domain: "devops", createdAt: 2013, pagerank: 0.9, stars: 400 },
    { id: "e-iac", label: "Infrastructure as Code", kind: "ecosystem", domain: "devops", createdAt: 2014, pagerank: 0.9, stars: 400 },
    { id: "r-kubernetes", label: "kubernetes", kind: "repo", domain: "devops", createdAt: 2014, stars: 109, pagerank: 0.96, momentum: 0.65, activity: 4800, contributors: 3800, description: "Production-grade container orchestration." },
    { id: "r-docker", label: "moby/docker", kind: "repo", domain: "devops", createdAt: 2013, stars: 68, pagerank: 0.9, momentum: 0.32, activity: 600, contributors: 2200, description: "Container runtime and tooling." },
    { id: "r-terraform", label: "terraform", kind: "repo", domain: "devops", createdAt: 2014, stars: 42, pagerank: 0.8, momentum: 0.6, activity: 2600, contributors: 1900, description: "Infrastructure as code tool." },

    // ---- Databases ecosystem ----
    { id: "e-relational", label: "Relational & Analytical", kind: "ecosystem", domain: "databases", createdAt: 2010, pagerank: 0.9, stars: 400 },
    { id: "e-vector", label: "Vector Databases", kind: "ecosystem", domain: "databases", createdAt: 2021, pagerank: 0.85, stars: 300 },
    { id: "r-postgres", label: "postgres", kind: "repo", domain: "databases", createdAt: 2010, stars: 16, pagerank: 0.9, momentum: 0.45, activity: 900, contributors: 700, description: "Advanced open-source relational database." },
    { id: "r-redis", label: "redis", kind: "repo", domain: "databases", createdAt: 2009, stars: 67, pagerank: 0.88, momentum: 0.4, activity: 700, contributors: 900, description: "In-memory data structure store." },
    { id: "r-duckdb", label: "duckdb", kind: "repo", domain: "databases", createdAt: 2019, stars: 24, pagerank: 0.7, momentum: 0.9, activity: 2100, contributors: 400, description: "In-process analytical database." },
    { id: "r-pgvector", label: "pgvector", kind: "repo", domain: "databases", createdAt: 2021, stars: 14, pagerank: 0.6, momentum: 0.95, activity: 800, contributors: 200, description: "Vector similarity search for Postgres." },

    // ---- Security ecosystem ----
    { id: "e-scanning", label: "Scanning & SAST", kind: "ecosystem", domain: "security", createdAt: 2016, pagerank: 0.85, stars: 300 },
    { id: "r-trivy", label: "trivy", kind: "repo", domain: "security", createdAt: 2019, stars: 24, pagerank: 0.7, momentum: 0.8, activity: 1500, contributors: 500, description: "Vulnerability scanner for containers and code." },
    { id: "r-semgrep", label: "semgrep", kind: "repo", domain: "security", createdAt: 2020, stars: 11, pagerank: 0.65, momentum: 0.75, activity: 1300, contributors: 400, description: "Lightweight static analysis for many languages." },
  ],
  links: [
    // domain -> ecosystem (contains)
    { source: "d-ai", target: "e-llm", kind: "contains", createdAt: 2018 },
    { source: "d-ai", target: "e-dl", kind: "contains", createdAt: 2015 },
    { source: "d-web", target: "e-frontend", kind: "contains", createdAt: 2013 },
    { source: "d-web", target: "e-node", kind: "contains", createdAt: 2010 },
    { source: "d-devops", target: "e-containers", kind: "contains", createdAt: 2013 },
    { source: "d-devops", target: "e-iac", kind: "contains", createdAt: 2014 },
    { source: "d-db", target: "e-relational", kind: "contains", createdAt: 2010 },
    { source: "d-db", target: "e-vector", kind: "contains", createdAt: 2021 },
    { source: "d-sec", target: "e-scanning", kind: "contains", createdAt: 2016 },

    // ecosystem -> repo (contains)
    { source: "e-dl", target: "r-pytorch", kind: "contains", createdAt: 2016 },
    { source: "e-dl", target: "r-tensorflow", kind: "contains", createdAt: 2015 },
    { source: "e-llm", target: "r-transformers", kind: "contains", createdAt: 2018 },
    { source: "e-llm", target: "r-vllm", kind: "contains", createdAt: 2023 },
    { source: "e-llm", target: "r-langchain", kind: "contains", createdAt: 2022 },
    { source: "e-frontend", target: "r-react", kind: "contains", createdAt: 2013 },
    { source: "e-frontend", target: "r-vue", kind: "contains", createdAt: 2014 },
    { source: "e-frontend", target: "r-next", kind: "contains", createdAt: 2016 },
    { source: "e-node", target: "r-node", kind: "contains", createdAt: 2009 },
    { source: "e-node", target: "r-express", kind: "contains", createdAt: 2010 },
    { source: "e-containers", target: "r-kubernetes", kind: "contains", createdAt: 2014 },
    { source: "e-containers", target: "r-docker", kind: "contains", createdAt: 2013 },
    { source: "e-iac", target: "r-terraform", kind: "contains", createdAt: 2014 },
    { source: "e-relational", target: "r-postgres", kind: "contains", createdAt: 2010 },
    { source: "e-relational", target: "r-redis", kind: "contains", createdAt: 2009 },
    { source: "e-relational", target: "r-duckdb", kind: "contains", createdAt: 2019 },
    { source: "e-vector", target: "r-pgvector", kind: "contains", createdAt: 2021 },
    { source: "e-scanning", target: "r-trivy", kind: "contains", createdAt: 2019 },
    { source: "e-scanning", target: "r-semgrep", kind: "contains", createdAt: 2020 },

    // cross-cutting: dependencies
    { source: "r-transformers", target: "r-pytorch", kind: "depends_on", createdAt: 2019 },
    { source: "r-vllm", target: "r-pytorch", kind: "depends_on", createdAt: 2023 },
    { source: "r-vllm", target: "r-transformers", kind: "depends_on", createdAt: 2023 },
    { source: "r-langchain", target: "r-transformers", kind: "depends_on", createdAt: 2022 },
    { source: "r-next", target: "r-react", kind: "depends_on", createdAt: 2016 },
    { source: "r-express", target: "r-node", kind: "depends_on", createdAt: 2010 },
    { source: "r-react", target: "r-node", kind: "depends_on", createdAt: 2013 },
    { source: "r-kubernetes", target: "r-docker", kind: "depends_on", createdAt: 2014 },
    { source: "r-terraform", target: "r-kubernetes", kind: "depends_on", createdAt: 2018 },
    { source: "r-pgvector", target: "r-postgres", kind: "depends_on", createdAt: 2021 },
    { source: "r-langchain", target: "r-pgvector", kind: "depends_on", createdAt: 2023 },
    { source: "r-trivy", target: "r-docker", kind: "depends_on", createdAt: 2019 },

    // cross-cutting: semantic similarity (AI-discovered)
    { source: "r-pytorch", target: "r-tensorflow", kind: "similar_to", createdAt: 2016 },
    { source: "r-react", target: "r-vue", kind: "similar_to", createdAt: 2014 },
    { source: "r-postgres", target: "r-duckdb", kind: "similar_to", createdAt: 2019 },
    { source: "r-trivy", target: "r-semgrep", kind: "similar_to", createdAt: 2020 },

    // cross-cutting: shared technology (bridges across domains)
    { source: "r-langchain", target: "r-vllm", kind: "shares_tech", createdAt: 2023 },
    { source: "r-duckdb", target: "r-pytorch", kind: "shares_tech", createdAt: 2022 },
  ],
};
