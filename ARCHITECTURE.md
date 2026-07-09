# GitVerse — Technical Architecture

**A software observatory: GitHub as a living, explorable knowledge graph — spatial, historical, and semantic.**

> Status: design/plan. No application code yet.
> Scope: **full production system**, not a demo. No corners cut. Built to represent the whole ecosystem, its history, and its evolution.

---

## 0. What "no corners cut" means here

We build the complete pyramid described in the vision:

- **Full zoom hierarchy** — Domain → Ecosystem → Repo → Package → Module → File → Function. Including the code-level tiers, which require cloning and parsing source, not just repo metadata.
- **Full history** — replay from GitHub's early years to today, with ecosystems forming/merging/fragmenting over time. This needs a *historical dataset*, not just the live API (see §2).
- **Full relationship set** — dependencies, contributor overlap, orgs, shared tech, framework ecosystems, languages, packages, lineage/forks, and AI semantic similarity.
- **AI that explains, never invents** — grounded strictly in the graph, evaluated for hallucination.
- **Continuous operation** — the graph is a living system, refreshed and re-analyzed on an ongoing basis.

The consequence: this is a **multi-store, multi-service data platform**, not a single app. The rest of this document is that platform.

---

## 1. Why databases at all — and why several

Three independent forcing functions require persistent, purpose-built storage:

1. **Ingestion is slow and rate-limited** — the graph is built over hours/days and refreshed continuously. It must outlive any process and support concurrent read/write (serving while ingesting). → transactional storage.
2. **History is large and time-shaped** — years of events, metric time-series (stars/commits/contributors over time), temporal snapshots. → columnar/time-series storage.
3. **Multiple query shapes** — graph traversal, vector similarity, full-text search, and time-range aggregation are *different* access patterns; no single engine is good at all four.

So we use **polyglot persistence**, each store doing what it's best at:

| Store | Technology | Responsibility |
|-------|-----------|----------------|
| **Graph** | Neo4j (+ Graph Data Science), or Amazon Neptune / JanusGraph at extreme scale | Property graph: nodes, edges, traversals, PageRank/community/betweenness |
| **Vectors** | Qdrant / Weaviate (or pgvector) | Embeddings for semantic similarity + semantic search |
| **Time-series / analytics** | ClickHouse (or BigQuery) | Event history, metric curves over time, temporal aggregations for the timeline |
| **Search** | OpenSearch / Elasticsearch | Keyword + faceted search over repos, packages, symbols |
| **Object store** | S3 / GCS | Raw SBOMs, cloned-repo ASTs, layout tiles, snapshot exports, embeddings blobs |
| **Cache / queue state** | Redis | Response cache, rate-limit token buckets, hot slices, job coordination |
| **Relational** | Postgres | Job metadata, ingestion frontier, entity catalog, provenance, user/session data |

This directly settles the earlier questions: **for a full product, yes — a database is required, and specifically a graph database earns its place** because centrality (foundational-ness) and community detection (ecosystems) are the headline features and are native graph algorithms.

---

## 2. Data sources — history forces a change to the earlier plan

**Important:** you previously chose "live GitHub API" as the data source. The live API is essential for *freshness* but **cannot reconstruct history** — it returns current state, not "what the graph looked like in 2014." The vision's timeline ("replay growth from GitHub's early years") therefore requires a **historical dataset**. Full-scope means a hybrid of three feeds:

1. **Historical backfill — GH Archive (2011→present) via BigQuery, + GHTorrent where useful.**
   Every public GitHub event since 2011 (pushes, stars, forks, PRs, releases, repo creation). This is what makes the timeline real: we reconstruct the state of the graph at any point in time and animate its evolution. Ingested as a batch pipeline into ClickHouse (events/metrics) and materialized into temporal graph snapshots.
2. **Live enrichment — GitHub GraphQL v4 + REST v3.**
   Current structural detail GH Archive lacks or that's easier via API: full dependency graph/SBOM, language byte-breakdowns, topics, org membership, current stars/forks. Rate-limited; runs as a rate-aware crawler.
3. **Continuous freshness — GitHub Events API + webhooks (GitHub App).**
   Ongoing updates so the observatory stays live. A **GitHub App** (installation tokens) gives higher, scalable rate limits than a single PAT and is the right production posture.

> **Decision to confirm (§13):** adopt GH Archive/BigQuery for history. Without it, "watch ecosystems evolve over time" degrades to "nodes appear by creation date," which is not the full vision. I recommend adopting it.

---

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                              │
│  WebGL galaxy (deck.gl / react-three-fiber) · semantic-zoom LOD           │
│  timeline scrubber (time-travel) · AI explanation & NL-query panel        │
│  graph-tile streaming client                                              │
└───────────────┬───────────────────────────────────────────┬──────────────┘
                │ GraphQL / tile API                         │
┌───────────────▼───────────────┐   ┌────────────────────────▼──────────────┐
│        SERVING LAYER          │   │            AI SERVICES                 │
│  • GraphQL BFF                │   │  • classifier (domain/topic)           │
│  • graph-tile service (LOD,   │◄──┤  • embedder → vectors                  │
│    quadtree tiles, per-time)  │   │  • explainer (graph-RAG, grounded)     │
│  • search service             │   │  • NL→Cypher (guardrailed)             │
│  • temporal-slice service     │   │  • narrative generator (time diffs)    │
└──────┬────────────────────────┘   │  • eval/grounding harness              │
       │                            └───────────────┬────────────────────────┘
       │ reads                                       │ reads/writes
┌──────▼──────────────────────────────────────────────▼─────────────────────┐
│                            STORAGE LAYER (polyglot)                         │
│  Neo4j+GDS (graph) · Qdrant (vectors) · ClickHouse (history/metrics)       │
│  OpenSearch (search) · Postgres (catalog/jobs) · Redis (cache) · S3 (blobs)│
└──────▲──────────────────────────────────────────────▲─────────────────────┘
       │ writes                                        │ writes
┌──────┴───────────────────┐   ┌──────────────────┐   ┌┴───────────────────────┐
│   INGESTION & ENRICHMENT │   │  CODE-GRAPH      │   │  GRAPH ANALYTICS       │
│  • GH Archive→ClickHouse │   │  BUILDER         │   │  (batch/scheduled)     │
│  • GraphQL/REST crawler  │   │  • clone repos   │   │  • PageRank/centrality │
│  • Events API/webhooks   │   │  • tree-sitter   │   │  • Louvain/Leiden      │
│  • SBOM/dependency       │   │    AST/symbols   │   │  • betweenness/bridges │
│  • rate-limit token pool │   │  • call graphs   │   │  • temporal snapshots  │
│  • resumable frontier    │   │  • file/fn nodes │   │  • hierarchical layout │
└──────────▲───────────────┘   └──────────────────┘   └────────────────────────┘
           │ HTTPS
   ┌───────┴─────────────────────────────────────────────┐
   │ GitHub GraphQL v4 · REST v3 · Events/webhooks · GH Archive (BigQuery) │
   └──────────────────────────────────────────────────────┘
                    orchestrated by Temporal / Dagster
```

**The graph is the source of truth.** Every other store is either a feed into it (ingestion), a derived index of it (vectors, search, tiles), or a temporal projection of it (ClickHouse/snapshots). AI reads from these; it never bypasses them.

---

## 4. Graph data model (full hierarchy)

### Node types

**Ecosystem tier:** `Domain` (13 galaxies), `Ecosystem`/`Cluster` (community-detected), `Org`, `User`, `Language`, `Topic`, `Framework`.
**Repo tier:** `Repo`, `Package` (npm/pypi/cargo/…), `Release`.
**Code tier (the part that requires source parsing):** `Module`, `File`, `Symbol`/`Function`.

Key `Repo` props: `id`, `description`, `stars`, `forks`, `primaryLanguage`, `createdAt`, `pushedAt`, `topics[]`, `domain`, and *derived*: `pagerank`, `communityId`, `betweenness`, `embeddingId`, layout `x,y[,z]`.

### Edge types (each timestamped for time-travel where derivable)

`DEPENDS_ON` (Repo/Package→Package/Repo), `CONTRIBUTES_TO` (User→Repo, weight=commits), `OWNED_BY`, `WRITTEN_IN` (weight=bytes), `TAGGED`, `IN_DOMAIN`, `IN_ECOSYSTEM`, `SIMILAR_TO` (score=cosine), `SHARES_CONTRIBUTORS` (overlap), `FORK_OF`/`LINEAGE`, and code-tier `CONTAINS` (Repo→Module→File→Symbol) and `CALLS`/`IMPORTS` (Symbol→Symbol, File→File).

### Bitemporal modeling (required for the timeline)

Every node/edge carries **valid-time** (`validFrom`,`validTo`) so we can query the graph *as of* any date. Point-in-time metrics (stars, contributor counts) live in ClickHouse as time-series and are joined in for temporal views. This is what powers "replay" and questions like "which repos disappeared" / "when did this ecosystem begin."

---

## 5. Ingestion & enrichment

- **Historical batch:** scheduled BigQuery jobs over GH Archive → dedup/normalize → ClickHouse (raw events + rolled-up metric curves) → materialize temporal graph edges into Neo4j.
- **Structural crawler:** GraphQL-first neighborhood fetches (repo + langs + topics + owner + releases + top contributors in one query); REST for endpoints GraphQL lacks. **BFS frontier** from curated roots across all 13 domains, expanded to a governed node budget with a **resumable, persisted frontier** (Postgres).
- **Dependencies:** SBOM (`/dependency-graph/sbom`, SPDX) + GraphQL `dependencyGraphManifests`; resolve packages → source repos to create repo-to-repo dependency edges; store raw SBOMs in S3 for provenance.
- **Freshness:** GitHub App webhooks + Events API stream ongoing changes; incremental upserts with ETag/`updatedAt` conditional requests (304s don't cost rate limit).
- **Rate management:** **token pool** across GitHub App installations; token-bucket limiter reading `rateLimit{cost,remaining,resetAt}`; automatic backoff; work is idempotent and resumable.
- **Orchestration:** Temporal (or Dagster) owns the DAGs — backfill, crawl, SBOM, code-graph, analytics, layout — with retries, backpressure, and observability.

## 6. Code-graph builder (files & functions tier)

Because the vision goes down to functions, we treat source as a first-class subsystem:

- **Selection policy:** clone + parse the most significant repos (by PageRank/stars/domain coverage) rather than all of GitHub — a governed, expandable set.
- **Parsing:** **tree-sitter** (multi-language) to extract modules, files, symbols/functions, imports, and call edges into the graph under `CONTAINS`/`CALLS`/`IMPORTS`.
- **Incremental:** re-parse on push webhooks (changed files only); store ASTs/symbol tables in S3.
- **Scale control:** code-tier nodes are enormous, so they're loaded lazily and only materialized for repos a user actually zooms into deeply (tiles fetched on demand), while the selected-repo set is precomputed.

## 7. Graph analytics (the "foundational-ness" engine)

Scheduled batch jobs, results written back onto nodes/edges:

- **PageRank / eigenvector centrality** → "foundational" projects; **rising centrality with flat stars** → *becoming* foundational before adoption (a headline insight; computed per temporal snapshot).
- **Louvain/Leiden community detection** → `Ecosystem` clusters = the galaxy/cluster tiers.
- **Betweenness** → bridge repos linking technologies ("hidden relationships between seemingly unrelated technologies").
- **Temporal snapshots** → run the above per time window so the timeline shows metrics *evolving*, not just static values.
- **Scale path:** Neo4j GDS for the working set; Spark/GraphX or a batch graph engine if the full graph exceeds single-instance GDS.

## 8. Layout & tiling (continuous zoom at scale)

- **Hierarchical, precomputed layout:** domains get regions; ecosystems nest inside; repos inside those. Force-directed within clusters, packed hierarchically. Positions persisted (`x,y`) so the map is **stable across sessions, zoom, and time**.
- **Graph tiles:** the layout is cut into **quadtree tiles per zoom level and per time bucket** (map-tile analogy). The tile service serves only `{bbox, zoom, time}`. This is what makes "continuous, not pages" scale to millions of nodes.
- **Incremental relayout:** new/changed nodes are placed incrementally to avoid global reshuffles.

## 9. AI layer (grounded, evaluated, productionized)

Independent services, all reading the graph/vectors — never authoring truth:

- **Classification** — repos → 13 domains + topics (`claude-sonnet-4-6`, batched, cached).
- **Embeddings** — README/description/code-doc → vectors in Qdrant → top-k `SIMILAR_TO` edges + semantic search.
- **Explainer (graph-RAG)** — selecting a node/cluster retrieves its real subgraph + metrics; `claude-opus-4-8` explains strictly from that context; UI shows the source subgraph alongside the text.
- **NL→Cypher** — question → parameterized, **read-only, allowlisted** Cypher against a schema description; results rendered as a subgraph. Guardrails: query caps, timeouts, validation.
- **Narrative generator** — given a temporal graph diff, narrates what emerged/rose/declined ("historical narratives").
- **Grounding eval harness** — automated checks that every generated claim traces to retrieved graph facts; hallucination regression tests in CI.

## 10. Serving layer

- **GraphQL BFF** — flexible nested slices, node detail, neighborhoods.
- **Graph-tile service** — `{bbox, zoom, time}` → tile of nodes/edges (LOD).
- **Temporal-slice service** — graph *as of* time T (bitemporal query + ClickHouse metric join).
- **Search service** — hybrid keyword (OpenSearch) + semantic (Qdrant).
- **AI endpoints** — `/explain`, `/nl-query`, `/narrative`.

## 11. Frontend

- **Rendering:** WebGL mandatory — **deck.gl** (excellent for large tiled node/edge scenes with LOD) or **react-three-fiber** for a true 3D galaxy. 2D-with-depth for legibility, optional 3D mode.
- **Tile streaming:** fetch only the current `{viewport, zoom, time}` tile set; prefetch neighbors; cache with React Query.
- **Semantic zoom** across all tiers Domain→…→Function, continuous, context-preserving.
- **Timeline scrubber:** global `time T`; server returns temporal slices; nodes/edges/metrics animate as T moves — ecosystems visibly form, merge, fragment.
- **AI panel:** grounded explanations + NL query, always showing underlying nodes/edges.
- **State:** Zustand (camera/time/selection) + React Query (tiles/slices).

## 12. Cross-cutting (production concerns, not optional here)

- **Orchestration:** Temporal/Dagster for all pipelines.
- **Observability:** OpenTelemetry traces + Prometheus/Grafana; data-freshness and rate-budget dashboards.
- **Data quality & provenance:** every node/edge records its source feed + fetch time; validation and dedup stages.
- **Schema/versioning:** versioned graph schema + migrations; reproducible snapshot exports (S3).
- **Security:** secrets management for GitHub App keys/model keys; read-only guardrails on AI-generated queries.
- **IaC & CI/CD:** infrastructure as code; automated tests incl. the AI grounding harness.

---

## 13. Decisions to confirm before build

1. **History source — adopt GH Archive/BigQuery?** Strongly recommended; without it the timeline can't truly "replay" evolution. *(This revises the earlier "live API only" choice — live API stays for freshness/enrichment.)*
2. **Graph engine — Neo4j+GDS** (recommended; native centrality/community) vs. Neptune/JanusGraph (bigger scale, more ops).
3. **Code-tier breadth** — how many repos get cloned/parsed to files/functions (governs cost); policy = top-N by centrality, expandable on demand.
4. **3D vs 2.5D galaxy** — true 3D (more "wow") vs. 2D-with-depth (more legible). Recommend 2D default + 3D toggle.
5. **Hosting/scale target** — cloud footprint and how much of GitHub we aim to represent (governs infra sizing).

---

## 14. Phased delivery (full build, not an MVP)

Sequenced so each phase is independently valuable, but the end state is the complete system:

| Phase | Focus |
|-------|-------|
| **1 — Platform foundation** | Storage layer (Neo4j, ClickHouse, Qdrant, OpenSearch, Postgres, Redis, S3), orchestration, GitHub App + token pool, schema, observability. |
| **2 — Structural graph** | GraphQL/REST crawler, BFS frontier, SBOM/dependency, contributors/langs/topics/orgs across all 13 domains. |
| **3 — History** | GH Archive→ClickHouse backfill; bitemporal edges; metric time-series; temporal snapshots. |
| **4 — Analytics & layout** | PageRank/community/betweenness (per snapshot); hierarchical layout; quadtree tiling. |
| **5 — AI** | Classification, embeddings/similarity, graph-RAG explainer, NL→Cypher, narratives, grounding eval. |
| **6 — Code tier** | Clone + tree-sitter parsing; file/function nodes; call/import graphs; on-demand deep zoom. |
| **7 — Frontend** | WebGL galaxy, tile streaming, full semantic zoom, timeline time-travel, AI panel. |
| **8 — Freshness & hardening** | Webhooks/Events live updates, incremental relayout, perf, security, deploy. |
