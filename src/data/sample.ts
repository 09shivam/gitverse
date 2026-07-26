import type { GVGraph, DomainId } from "../types";

export const DOMAIN_META: Record<
  DomainId,
  { label: string; color: string }
> = {
  ai: { label: "AI / Machine Learning", color: "#d95cff" },
  web: { label: "Web Development", color: "#3f7cff" },
  cloud: { label: "Cloud Native", color: "#20d6f5" },
  devops: { label: "DevOps", color: "#ffb02e" },
  data_engineering: { label: "Data Engineering", color: "#ff7a1a" },
  databases: { label: "Databases", color: "#32d6f4" },
  blockchain: { label: "Blockchain", color: "#7d74ff" },
  security: { label: "Cybersecurity", color: "#6ee77d" },
  game_dev: { label: "Game Development", color: "#ff5de0" },
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
    { id: "d-cloud", label: "Cloud", kind: "domain", domain: "cloud", createdAt: 2008, pagerank: 1, stars: 900, description: "Cloud native runtimes and platforms." },
    { id: "d-devops", label: "DevOps", kind: "domain", domain: "devops", createdAt: 2008, pagerank: 1, stars: 900, description: "CI/CD, containers, infrastructure." },
    { id: "d-data-eng", label: "Data", kind: "domain", domain: "data_engineering", createdAt: 2008, pagerank: 1, stars: 900, description: "Data pipelines, streaming, orchestration." },
    { id: "d-db", label: "Databases", kind: "domain", domain: "databases", createdAt: 2008, pagerank: 1, stars: 900, description: "Storage, query engines, vector stores." },
    { id: "d-blockchain", label: "Blockchain", kind: "domain", domain: "blockchain", createdAt: 2008, pagerank: 1, stars: 900, description: "Protocols, ledgers, smart contracts." },
    { id: "d-sec", label: "Cybersecurity", kind: "domain", domain: "security", createdAt: 2008, pagerank: 1, stars: 900, description: "AppSec, scanning, secrets, auth." },
    { id: "d-game", label: "Game Dev", kind: "domain", domain: "game_dev", createdAt: 2008, pagerank: 1, stars: 900, description: "Game engines, graphics, simulation." },

    // ---- AI ecosystem ----
    { id: "e-llm", label: "Large Language Models", kind: "ecosystem", domain: "ai", createdAt: 2018, pagerank: 0.9, stars: 400 },
    { id: "e-dl", label: "Deep Learning Frameworks", kind: "ecosystem", domain: "ai", createdAt: 2015, pagerank: 0.9, stars: 400 },
    { id: "r-pytorch", label: "pytorch", kind: "repo", domain: "ai", createdAt: 2016, stars: 82, pagerank: 0.98, momentum: 0.7, activity: 4200, contributors: 3400, forks: 22, openIssues: 14000, license: "BSD-3-Clause", language: "Python", owner: "pytorch", url: "https://pytorch.org", lastPush: 2024, description: "Tensors and dynamic neural networks with GPU acceleration." },
    { id: "r-tensorflow", label: "tensorflow", kind: "repo", domain: "ai", createdAt: 2015, stars: 185, pagerank: 0.85, momentum: 0.28, activity: 1800, contributors: 3600, forks: 74, openIssues: 2000, license: "Apache-2.0", language: "C++", owner: "tensorflow", url: "https://tensorflow.org", lastPush: 2024, description: "End-to-end machine learning platform." },
    { id: "r-transformers", label: "transformers", kind: "repo", domain: "ai", createdAt: 2018, stars: 133, pagerank: 0.95, momentum: 0.92, activity: 5200, contributors: 2900, forks: 27, openIssues: 1500, license: "Apache-2.0", language: "Python", owner: "huggingface", url: "https://huggingface.co/transformers", lastPush: 2024, description: "State-of-the-art pretrained models (Hugging Face)." },
    { id: "r-vllm", label: "vllm", kind: "repo", domain: "ai", createdAt: 2023, stars: 31, pagerank: 0.7, momentum: 0.98, activity: 6100, contributors: 900, forks: 4, openIssues: 1800, license: "Apache-2.0", language: "Python", owner: "vllm-project", url: "https://docs.vllm.ai", lastPush: 2024, description: "High-throughput LLM serving engine." },
    { id: "r-langchain", label: "langchain", kind: "repo", domain: "ai", createdAt: 2022, stars: 93, pagerank: 0.72, momentum: 0.88, activity: 3800, contributors: 3100, forks: 15, openIssues: 300, license: "MIT", language: "Python", owner: "langchain-ai", url: "https://langchain.com", lastPush: 2024, description: "Framework for building LLM-powered applications." },

    // ---- Web ecosystem ----
    { id: "e-frontend", label: "Frontend Frameworks", kind: "ecosystem", domain: "web", createdAt: 2013, pagerank: 0.9, stars: 400 },
    { id: "e-node", label: "Node.js Backend", kind: "ecosystem", domain: "web", createdAt: 2010, pagerank: 0.9, stars: 400 },
    { id: "r-react", label: "react", kind: "repo", domain: "web", createdAt: 2013, stars: 228, pagerank: 0.97, momentum: 0.6, activity: 900, contributors: 1600, forks: 47, openIssues: 900, license: "MIT", language: "JavaScript", owner: "facebook", url: "https://react.dev", lastPush: 2024, description: "Library for building user interfaces." },
    { id: "r-vue", label: "vue", kind: "repo", domain: "web", createdAt: 2014, stars: 207, pagerank: 0.8, momentum: 0.38, activity: 400, contributors: 500, forks: 33, openIssues: 600, license: "MIT", language: "TypeScript", owner: "vuejs", url: "https://vuejs.org", lastPush: 2024, description: "Progressive JavaScript framework." },
    { id: "r-next", label: "next.js", kind: "repo", domain: "web", createdAt: 2016, stars: 125, pagerank: 0.82, momentum: 0.85, activity: 3400, contributors: 3000, forks: 27, openIssues: 2500, license: "MIT", language: "JavaScript", owner: "vercel", url: "https://nextjs.org", lastPush: 2024, description: "The React framework for production." },
    { id: "r-node", label: "node", kind: "repo", domain: "web", createdAt: 2009, stars: 107, pagerank: 0.9, momentum: 0.5, activity: 1200, contributors: 3500, forks: 30, openIssues: 1800, license: "MIT", language: "JavaScript", owner: "nodejs", url: "https://nodejs.org", lastPush: 2024, description: "JavaScript runtime built on V8." },
    { id: "r-express", label: "express", kind: "repo", domain: "web", createdAt: 2010, stars: 65, pagerank: 0.78, momentum: 0.2, activity: 120, contributors: 300, forks: 12, openIssues: 150, license: "MIT", language: "JavaScript", owner: "expressjs", url: "https://expressjs.com", lastPush: 2024, description: "Fast, minimalist web framework for Node." },

    // ---- Cloud ecosystem ----
    { id: "e-cloud-runtime", label: "Cloud Native Platforms", kind: "ecosystem", domain: "cloud", createdAt: 2014, pagerank: 0.9, stars: 400 },
    { id: "r-envoy", label: "envoy", kind: "repo", domain: "cloud", createdAt: 2016, stars: 26, pagerank: 0.78, momentum: 0.58, activity: 1100, contributors: 900, forks: 5, openIssues: 1400, license: "Apache-2.0", language: "C++", owner: "envoyproxy", url: "https://www.envoyproxy.io", lastPush: 2024, description: "Cloud-native edge and service proxy." },
    { id: "r-istio", label: "istio", kind: "repo", domain: "cloud", createdAt: 2016, stars: 36, pagerank: 0.8, momentum: 0.54, activity: 1600, contributors: 1200, forks: 8, openIssues: 650, license: "Apache-2.0", language: "Go", owner: "istio", url: "https://istio.io", lastPush: 2024, description: "Service mesh for cloud-native applications." },

    // ---- DevOps ecosystem ----
    { id: "e-containers", label: "Containers & Orchestration", kind: "ecosystem", domain: "devops", createdAt: 2013, pagerank: 0.9, stars: 400 },
    { id: "e-iac", label: "Infrastructure as Code", kind: "ecosystem", domain: "devops", createdAt: 2014, pagerank: 0.9, stars: 400 },
    { id: "r-kubernetes", label: "kubernetes", kind: "repo", domain: "devops", createdAt: 2014, stars: 109, pagerank: 0.96, momentum: 0.65, activity: 4800, contributors: 3800, forks: 40, openIssues: 1700, license: "Apache-2.0", language: "Go", owner: "kubernetes", url: "https://kubernetes.io", lastPush: 2024, description: "Production-grade container orchestration." },
    { id: "r-docker", label: "moby/docker", kind: "repo", domain: "devops", createdAt: 2013, stars: 68, pagerank: 0.9, momentum: 0.32, activity: 600, contributors: 2200, forks: 19, openIssues: 2600, license: "Apache-2.0", language: "Go", owner: "moby", url: "https://mobyproject.org", github: "https://github.com/moby/moby", lastPush: 2024, description: "Container runtime and tooling." },
    { id: "r-terraform", label: "terraform", kind: "repo", domain: "devops", createdAt: 2014, stars: 42, pagerank: 0.8, momentum: 0.6, activity: 2600, contributors: 1900, forks: 10, openIssues: 1900, license: "MPL-2.0", language: "Go", owner: "hashicorp", url: "https://terraform.io", lastPush: 2024, description: "Infrastructure as code tool." },

    // ---- Data engineering ecosystem ----
    { id: "e-pipelines", label: "Pipelines & Streaming", kind: "ecosystem", domain: "data_engineering", createdAt: 2014, pagerank: 0.9, stars: 400 },
    { id: "r-airflow", label: "airflow", kind: "repo", domain: "data_engineering", createdAt: 2015, stars: 39, pagerank: 0.84, momentum: 0.56, activity: 2600, contributors: 2900, forks: 15, openIssues: 1400, license: "Apache-2.0", language: "Python", owner: "apache", url: "https://airflow.apache.org", lastPush: 2024, description: "Platform to programmatically author and schedule workflows." },
    { id: "r-spark", label: "spark", kind: "repo", domain: "data_engineering", createdAt: 2014, stars: 40, pagerank: 0.88, momentum: 0.42, activity: 1700, contributors: 2100, forks: 29, openIssues: 0, license: "Apache-2.0", language: "Scala", owner: "apache", url: "https://spark.apache.org", lastPush: 2024, description: "Unified analytics engine for large-scale data processing." },

    // ---- Databases ecosystem ----
    { id: "e-relational", label: "Relational & Analytical", kind: "ecosystem", domain: "databases", createdAt: 2010, pagerank: 0.9, stars: 400 },
    { id: "e-vector", label: "Vector Databases", kind: "ecosystem", domain: "databases", createdAt: 2021, pagerank: 0.85, stars: 300 },
    { id: "r-postgres", label: "postgres", kind: "repo", domain: "databases", createdAt: 2010, stars: 16, pagerank: 0.9, momentum: 0.45, activity: 900, contributors: 700, forks: 5, openIssues: 0, license: "PostgreSQL", language: "C", owner: "postgres", url: "https://postgresql.org", lastPush: 2024, description: "Advanced open-source relational database." },
    { id: "r-redis", label: "redis", kind: "repo", domain: "databases", createdAt: 2009, stars: 67, pagerank: 0.88, momentum: 0.4, activity: 700, contributors: 900, forks: 24, openIssues: 2600, license: "BSD-3-Clause", language: "C", owner: "redis", url: "https://redis.io", lastPush: 2024, description: "In-memory data structure store." },
    { id: "r-duckdb", label: "duckdb", kind: "repo", domain: "databases", createdAt: 2019, stars: 24, pagerank: 0.7, momentum: 0.9, activity: 2100, contributors: 400, forks: 2, openIssues: 400, license: "MIT", language: "C++", owner: "duckdb", url: "https://duckdb.org", lastPush: 2024, description: "In-process analytical database." },
    { id: "r-pgvector", label: "pgvector", kind: "repo", domain: "databases", createdAt: 2021, stars: 14, pagerank: 0.6, momentum: 0.95, activity: 800, contributors: 200, forks: 1, openIssues: 40, license: "PostgreSQL", language: "C", owner: "pgvector", url: "https://github.com/pgvector/pgvector", lastPush: 2024, description: "Vector similarity search for Postgres." },

    // ---- Blockchain ecosystem ----
    { id: "e-protocols", label: "Protocol Clients", kind: "ecosystem", domain: "blockchain", createdAt: 2009, pagerank: 0.88, stars: 360 },
    { id: "r-bitcoin", label: "bitcoin", kind: "repo", domain: "blockchain", createdAt: 2009, stars: 79, pagerank: 0.94, momentum: 0.38, activity: 850, contributors: 1100, forks: 36, openIssues: 600, license: "MIT", language: "C++", owner: "bitcoin", url: "https://bitcoincore.org", lastPush: 2024, description: "Bitcoin Core integration and staging tree." },
    { id: "r-geth", label: "go-ethereum", kind: "repo", domain: "blockchain", createdAt: 2013, stars: 48, pagerank: 0.9, momentum: 0.46, activity: 1300, contributors: 1000, forks: 21, openIssues: 700, license: "LGPL-3.0", language: "Go", owner: "ethereum", url: "https://geth.ethereum.org", lastPush: 2024, description: "Official Go implementation of the Ethereum protocol." },

    // ---- Cybersecurity ecosystem ----
    { id: "e-scanning", label: "Scanning & SAST", kind: "ecosystem", domain: "security", createdAt: 2016, pagerank: 0.85, stars: 300 },
    { id: "r-trivy", label: "trivy", kind: "repo", domain: "security", createdAt: 2019, stars: 24, pagerank: 0.7, momentum: 0.8, activity: 1500, contributors: 500, forks: 2, openIssues: 300, license: "Apache-2.0", language: "Go", owner: "aquasecurity", url: "https://trivy.dev", lastPush: 2024, description: "Vulnerability scanner for containers and code." },
    { id: "r-semgrep", label: "semgrep", kind: "repo", domain: "security", createdAt: 2020, stars: 11, pagerank: 0.65, momentum: 0.75, activity: 1300, contributors: 400, forks: 1, openIssues: 200, license: "LGPL-2.1", language: "OCaml", owner: "semgrep", url: "https://semgrep.dev", lastPush: 2024, description: "Lightweight static analysis for many languages." },

    // ---- Game development ecosystem ----
    { id: "e-engines", label: "Game Engines", kind: "ecosystem", domain: "game_dev", createdAt: 2014, pagerank: 0.88, stars: 360 },
    { id: "r-godot", label: "godot", kind: "repo", domain: "game_dev", createdAt: 2014, stars: 88, pagerank: 0.9, momentum: 0.72, activity: 3200, contributors: 2500, forks: 19, openIssues: 8000, license: "MIT", language: "C++", owner: "godotengine", url: "https://godotengine.org", lastPush: 2024, description: "Multi-platform 2D and 3D game engine." },
    { id: "r-bevy", label: "bevy", kind: "repo", domain: "game_dev", createdAt: 2020, stars: 36, pagerank: 0.72, momentum: 0.86, activity: 2200, contributors: 900, forks: 4, openIssues: 1200, license: "MIT", language: "Rust", owner: "bevyengine", url: "https://bevyengine.org", lastPush: 2024, description: "Data-driven game engine built in Rust." },
  ],
  links: [
    // domain -> ecosystem (contains)
    { source: "d-ai", target: "e-llm", kind: "contains", createdAt: 2018 },
    { source: "d-ai", target: "e-dl", kind: "contains", createdAt: 2015 },
    { source: "d-web", target: "e-frontend", kind: "contains", createdAt: 2013 },
    { source: "d-web", target: "e-node", kind: "contains", createdAt: 2010 },
    { source: "d-cloud", target: "e-cloud-runtime", kind: "contains", createdAt: 2014 },
    { source: "d-devops", target: "e-containers", kind: "contains", createdAt: 2013 },
    { source: "d-devops", target: "e-iac", kind: "contains", createdAt: 2014 },
    { source: "d-data-eng", target: "e-pipelines", kind: "contains", createdAt: 2014 },
    { source: "d-db", target: "e-relational", kind: "contains", createdAt: 2010 },
    { source: "d-db", target: "e-vector", kind: "contains", createdAt: 2021 },
    { source: "d-blockchain", target: "e-protocols", kind: "contains", createdAt: 2009 },
    { source: "d-sec", target: "e-scanning", kind: "contains", createdAt: 2016 },
    { source: "d-game", target: "e-engines", kind: "contains", createdAt: 2014 },

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
    { source: "e-cloud-runtime", target: "r-envoy", kind: "contains", createdAt: 2016 },
    { source: "e-cloud-runtime", target: "r-istio", kind: "contains", createdAt: 2016 },
    { source: "e-containers", target: "r-kubernetes", kind: "contains", createdAt: 2014 },
    { source: "e-containers", target: "r-docker", kind: "contains", createdAt: 2013 },
    { source: "e-iac", target: "r-terraform", kind: "contains", createdAt: 2014 },
    { source: "e-pipelines", target: "r-airflow", kind: "contains", createdAt: 2015 },
    { source: "e-pipelines", target: "r-spark", kind: "contains", createdAt: 2014 },
    { source: "e-relational", target: "r-postgres", kind: "contains", createdAt: 2010 },
    { source: "e-relational", target: "r-redis", kind: "contains", createdAt: 2009 },
    { source: "e-relational", target: "r-duckdb", kind: "contains", createdAt: 2019 },
    { source: "e-vector", target: "r-pgvector", kind: "contains", createdAt: 2021 },
    { source: "e-protocols", target: "r-bitcoin", kind: "contains", createdAt: 2009 },
    { source: "e-protocols", target: "r-geth", kind: "contains", createdAt: 2013 },
    { source: "e-scanning", target: "r-trivy", kind: "contains", createdAt: 2019 },
    { source: "e-scanning", target: "r-semgrep", kind: "contains", createdAt: 2020 },
    { source: "e-engines", target: "r-godot", kind: "contains", createdAt: 2014 },
    { source: "e-engines", target: "r-bevy", kind: "contains", createdAt: 2020 },

    // cross-cutting: dependencies
    { source: "r-transformers", target: "r-pytorch", kind: "depends_on", createdAt: 2019 },
    { source: "r-vllm", target: "r-pytorch", kind: "depends_on", createdAt: 2023 },
    { source: "r-vllm", target: "r-transformers", kind: "depends_on", createdAt: 2023 },
    { source: "r-langchain", target: "r-transformers", kind: "depends_on", createdAt: 2022 },
    { source: "r-next", target: "r-react", kind: "depends_on", createdAt: 2016 },
    { source: "r-express", target: "r-node", kind: "depends_on", createdAt: 2010 },
    { source: "r-react", target: "r-node", kind: "depends_on", createdAt: 2013 },
    { source: "r-kubernetes", target: "r-docker", kind: "depends_on", createdAt: 2014 },
    { source: "r-istio", target: "r-envoy", kind: "depends_on", createdAt: 2017 },
    { source: "r-terraform", target: "r-kubernetes", kind: "depends_on", createdAt: 2018 },
    { source: "r-airflow", target: "r-postgres", kind: "depends_on", createdAt: 2015 },
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
