import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { forceCollide, forceX, forceY } from "d3-force";
import { sampleGraph, DOMAIN_META } from "./data/sample";
import type { GVNode, GVEdge, GVGraph, DomainId, NodeKind } from "./types";

const DOMAIN_ORDER: DomainId[] = [
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
const DOMAIN_ANCHOR: Record<DomainId, { x: number; y: number }> = {
  ai: { x: -245, y: -90 },
  web: { x: 40, y: -205 },
  cloud: { x: 315, y: -150 },
  devops: { x: 360, y: 64 },
  data_engineering: { x: 90, y: 200 },
  databases: { x: -105, y: 150 },
  blockchain: { x: -380, y: 60 },
  security: { x: -230, y: 250 },
  game_dev: { x: 330, y: 245 },
};

const EDGE_COLOR: Record<GVEdge["kind"], string> = {
  contains: "148,154,196",
  depends_on: "180,156,232",
  shares_tech: "166,186,226",
  similar_to: "214,194,244",
};

const EDGE_LABEL: Record<GVEdge["kind"], string> = {
  contains: "contains",
  depends_on: "depends on",
  shares_tech: "shares tech with",
  similar_to: "similar to",
};

function nodeRadius(n: GVNode): number {
  if (n.kind === "domain") return 5.6;
  if (n.kind === "ecosystem") return 3.6;
  const stars = Math.max(0, n.stars ?? 0);
  const signal = n.badges?.includes("trending") ? 0.45 : n.badges?.includes("new") ? 0.25 : 0;
  return Math.min(5.2, 0.9 + Math.log10(stars + 1) * 1.05 + (n.trendScore ?? 0) * 0.45 + signal);
}

// Extra keywords so "machine learning", "frontend", "infra" etc. resolve to a galaxy.
const DOMAIN_SYN: Record<DomainId, string> = {
  ai: "artificial intelligence machine learning ml llm deep neural model data science",
  web: "web frontend backend javascript typescript react node http framework",
  cloud: "cloud native kubernetes service mesh containers serverless aws gcp azure platform",
  devops: "devops infrastructure ci cd deploy automation terraform ansible observability build",
  data_engineering: "data engineering etl pipeline airflow spark kafka warehouse lakehouse analytics",
  databases: "database data sql storage query vector cache warehouse",
  blockchain: "blockchain crypto ethereum bitcoin web3 smart contract defi wallet",
  security: "cybersecurity security auth vulnerability scanning crypto appsec secrets cve",
  game_dev: "game development game engine graphics unity godot unreal bevy gamedev",
};

const DOMAIN_DESCRIPTIONS: Record<DomainId, string> = {
  ai: "Model tooling, agents, LLM infrastructure, and applied machine learning projects.",
  web: "Frontend frameworks, backend runtimes, browser tooling, and product UI systems.",
  cloud: "Cloud native runtimes, orchestration layers, service mesh, and platform systems.",
  devops: "Infrastructure automation, CI/CD, deployment systems, and observability tooling.",
  data_engineering: "Pipelines, streaming, orchestration, warehouses, and large-scale data processing.",
  databases: "Storage engines, query systems, search, caches, and vector stores.",
  blockchain: "Distributed ledgers, smart contracts, wallets, Web3 tooling, and protocol clients.",
  security: "Static analysis, vulnerability scanners, identity, secrets, and app security.",
  game_dev: "Game engines, rendering systems, simulation tooling, and creator frameworks.",
};

const SIDE_NAV = ["Universe", "Timeline", "Ecosystems", "Languages", "AI Categories", "Trending"];

// Validated dark-mode categorical palette (dataviz skill) — fixed order, not cycled.
const CHART_COLORS = ["#f5f0ff", "#cfc4ff", "#aebcff", "#d8b6ff", "#8fa7ef"];

interface Suggestion {
  kind: NodeKind;
  domain: DomainId;
  label: string;
  sub: string;
}

type DomainFilter = "all" | DomainId;

interface DomainStat {
  domain: DomainId;
  repos: number;
  stars: number;
  contributors: number;
  fresh: number;
  trend: number;
  topRepos: GVNode[];
}

interface UniverseStats {
  repos: number;
  stars: number;
  contributors: number;
  openIssues: number;
  fresh: number;
}

export default function App() {
  const fgRef = useRef<ForceGraphMethods>();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [playing, setPlaying] = useState(false);
  const [zoomPct, setZoomPct] = useState(46);
  const [selected, setSelected] = useState<GVNode | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modalDomain, setModalDomain] = useState<DomainId | null>(null);
  const [nowDomain, setNowDomain] = useState<DomainFilter>("all");

  // Live graph ingested from GitHub (public/graph.json), falling back to the
  // curated sample when the snapshot hasn't been generated yet.
  const [remote, setRemote] = useState<GVGraph | null>(null);
  useEffect(() => {
    fetch("/graph.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((g: GVGraph | null) => g && g.nodes?.length && setRemote(g))
      .catch(() => {});
  }, []);
  const source = remote ?? sampleGraph;

  const [minYear, maxYear] = useMemo(() => {
    const ys = source.nodes.map((n) => n.createdAt);
    return [Math.min(...ys), Math.max(...ys)];
  }, [source]);
  // frame the whole history whenever the data source changes
  useEffect(() => setYear(maxYear), [maxYear]);

  // Stable graph data — passed once so the force layout never reshuffles.
  // Timeline is expressed as per-node opacity, not by adding/removing nodes.
  const data = useMemo(() => {
    const jitter = () => (Math.random() - 0.5) * 140;
    const sourceNodes = [...source.nodes];
    const existingDomains = new Set(
      sourceNodes.filter((n) => n.kind === "domain").map((n) => n.domain)
    );
    for (const domain of DOMAIN_ORDER) {
      if (!existingDomains.has(domain)) {
        sourceNodes.push({
          id: "d-" + domain,
          label: DOMAIN_META[domain].label,
          kind: "domain",
          domain,
          createdAt: minYear,
          pagerank: 1,
          stars: 900,
          description: DOMAIN_DESCRIPTIONS[domain],
        });
      }
    }

    const nodes = sourceNodes.map((n) => {
      const anchor = DOMAIN_ANCHOR[n.domain];
      const node: any = { ...n, x: anchor.x + jitter(), y: anchor.y + jitter() };
      // pin galaxy centers so domains stay in distinct regions
      if (n.kind === "domain") {
        node.fx = anchor.x;
        node.fy = anchor.y;
      }
      return node;
    });
    return { nodes, links: source.links.map((l) => ({ ...l })) };
  }, [source, minYear]);

  // Persistent starfield — mostly faint white dust, a few bright tinted stars
  // that slowly twinkle. `tw`/`ph` drive the per-star shimmer.
  const stars = useRef(
    Array.from({ length: 1150 }, () => {
      const bright = Math.random() < 0.045;
      const tint = Math.random();
      return {
        x: (Math.random() - 0.5) * 4200,
        y: (Math.random() - 0.5) * 2600,
        r: bright ? Math.random() * 1.15 + 0.7 : Math.random() * 0.55 + 0.12,
        a: bright ? Math.random() * 0.36 + 0.42 : Math.random() * 0.24 + 0.04,
        c:
          tint < 0.14
            ? "180,200,255" // blue-white
            : tint < 0.22
            ? "255,220,190" // warm
            : "228,234,255", // near white
        tw: Math.random() * 1.6 + 0.25,
        ph: Math.random() * Math.PI * 2,
        bright,
      };
    })
  );

  const galaxyDust = useRef(
    Array.from({ length: 1250 }, () => {
      const along = (Math.random() - 0.5) * 2200;
      const core = Math.random() < 0.74;
      const off = (Math.random() - 0.5) * (core ? 190 : 420);
      const tint = Math.random();
      return {
        x: along,
        y: Math.sin(along / 220) * 46 + off,
        r: core ? Math.random() * 1.25 + 0.15 : Math.random() * 0.55 + 0.08,
        a: core ? Math.random() * 0.3 + 0.1 : Math.random() * 0.13 + 0.04,
        c:
          tint < 0.5
            ? "190,175,255"
            : tint < 0.78
            ? "240,185,225"
            : "165,196,255",
        tw: Math.random() * 0.8 + 0.15,
        ph: Math.random() * Math.PI * 2,
      };
    })
  );

  // Timeline autoplay.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setYear((y) => {
        if (y >= maxYear) {
          setPlaying(false);
          return y;
        }
        return y + 1;
      });
    }, 650);
    return () => clearInterval(id);
  }, [playing, maxYear]);

  // Tune forces once the engine is available.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // bounded repulsion so galaxies stay tight and don't fly apart
    fg.d3Force("charge")?.strength(-70).distanceMax(190);
    const link = fg.d3Force("link");
    // @ts-ignore - d3 link force distance/strength
    link?.distance((l: any) => (l.kind === "contains" ? 24 : 100));
    // @ts-ignore - weaken cross-domain pull so galaxies don't merge
    link?.strength((l: any) => (l.kind === "contains" ? 0.8 : 0.03));
    // keep nodes from overlapping
    fg.d3Force("collide", forceCollide((n: any) => Math.max(4.5, nodeRadius(n) + 1.4)).strength(0.82));
    // hold repos near their galaxy (domain centers are already pinned via fx/fy)
    fg.d3Force("x", forceX((n: any) => DOMAIN_ANCHOR[n.domain as DomainId].x).strength(0.14));
    fg.d3Force("y", forceY((n: any) => DOMAIN_ANCHOR[n.domain as DomainId].y).strength(0.14));
    fg.d3ReheatSimulation?.();
    // guaranteed framing once the layout has settled
    const t = setTimeout(() => fgRef.current?.zoomToFit(600, 120), 5600);
    return () => clearTimeout(t);
  }, [source]);

  const born = useCallback((createdAt: number) => createdAt <= year, [year]);

  const relationships = useMemo(() => {
    if (!selected) return [];
    const out: { label: string; via: string; born: boolean }[] = [];
    for (const l of source.links) {
      const s = typeof l.source === "string" ? l.source : (l.source as any).id;
      const t = typeof l.target === "string" ? l.target : (l.target as any).id;
      if (s !== selected.id && t !== selected.id) continue;
      const otherId = s === selected.id ? t : s;
      const other = source.nodes.find((n) => n.id === otherId);
      if (!other) continue;
      out.push({
        label: other.label,
        via: EDGE_LABEL[l.kind],
        born: born(l.createdAt),
      });
    }
    return out.sort((a, b) => Number(b.born) - Number(a.born));
  }, [selected, born, source]);

  // Domain / ecosystem analytics — aggregate the repos in scope, respecting the
  // timeline year so "trending in 2018" differs from "trending in 2024".
  const analytics = useMemo(() => {
    if (!selected || selected.kind === "repo") return null;

    let repos: GVNode[];
    if (selected.kind === "domain") {
      repos = source.nodes.filter(
        (n) => n.kind === "repo" && n.domain === selected.domain && born(n.createdAt)
      );
    } else {
      // ecosystem: repos it "contains"
      const childIds = new Set(
        source.links
          .filter((l) => (l.source as any) === selected.id && l.kind === "contains")
          .map((l) => l.target as string)
      );
      repos = source.nodes.filter(
        (n) => n.kind === "repo" && childIds.has(n.id) && born(n.createdAt)
      );
    }

    const top = (key: (n: GVNode) => number, k = 4) =>
      [...repos].sort((a, b) => key(b) - key(a)).slice(0, k);

    // distribution helper: count repos by a categorical field, sorted desc
    const dist = (key: (n: GVNode) => string | undefined, k = 5) => {
      const m = new Map<string, number>();
      for (const n of repos) {
        const v = key(n);
        if (v) m.set(v, (m.get(v) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
    };

    return {
      count: repos.length,
      totalStars: repos.reduce((s, n) => s + (n.stars ?? 0), 0),
      totalContributors: repos.reduce((s, n) => s + (n.contributors ?? 0), 0),
      totalForks: repos.reduce((s, n) => s + (n.forks ?? 0), 0),
      totalOpenIssues: repos.reduce((s, n) => s + (n.openIssues ?? 0), 0),
      languages: dist((n) => n.language),
      licenses: dist((n) => n.license),
      trending: top((n) => n.trendScore ?? n.momentum ?? 0),
      newest: top((n) => n.newScore ?? n.createdAt),
      mostWorkedOn: top((n) => n.contributionScore ?? n.activity ?? 0),
      foundational: top((n) => n.pagerank ?? 0),
    };
  }, [selected, born, source]);

  const visibleCount = data.nodes.filter((n) => born(n.createdAt)).length;
  const now = useMemo(() => {
    const repos = source.nodes.filter(
      (n) => n.kind === "repo" && (nowDomain === "all" || n.domain === nowDomain)
    );
    const top = (key: (n: GVNode) => number) =>
      [...repos].sort((a, b) => key(b) - key(a)).slice(0, 5);
    return {
      trending: top((n) => n.trendScore ?? n.momentum ?? 0),
      fresh: top((n) => n.newScore ?? n.createdAt),
      active: top((n) => n.contributionScore ?? n.activity ?? 0),
    };
  }, [source, nowDomain]);

  const domainStats = useMemo(
    (): DomainStat[] =>
      DOMAIN_ORDER.map((domain) => {
        const repos = source.nodes.filter((n) => n.kind === "repo" && n.domain === domain);
        const topRepos = [...repos]
          .sort((a, b) => (b.trendScore ?? b.momentum ?? 0) - (a.trendScore ?? a.momentum ?? 0))
          .slice(0, 5);
        return {
          domain,
          repos: repos.length,
          stars: repos.reduce((s, n) => s + (n.stars ?? 0), 0),
          contributors: repos.reduce((s, n) => s + (n.contributors ?? 0), 0),
          fresh: repos.filter((n) => n.badges?.includes("new") || (n.newScore ?? 0) >= 0.55).length,
          trend: topRepos[0]?.trendScore ?? topRepos[0]?.momentum ?? 0,
          topRepos,
        };
      }),
    [source]
  );

  const universeStats = useMemo<UniverseStats>(() => {
    const repos = source.nodes.filter((n) => n.kind === "repo");
    return {
      repos: source.summary?.repoCount ?? repos.length,
      stars: repos.reduce((s, n) => s + (n.stars ?? 0), 0),
      contributors: repos.reduce((s, n) => s + (n.contributors ?? 0), 0),
      openIssues: repos.reduce((s, n) => s + (n.openIssues ?? 0), 0),
      fresh: repos.filter((n) => n.badges?.includes("new") || (n.newScore ?? 0) >= 0.55).length,
    };
  }, [source]);

  const spotlightDomain: DomainId =
    selected?.domain ?? (nowDomain === "all" ? "ai" : nowDomain);
  const spotlight = domainStats.find((d) => d.domain === spotlightDomain) ?? domainStats[0];

  const timelineYears = useMemo(() => buildTimelineYears(minYear, maxYear), [minYear, maxYear]);
  const milestones = useMemo(() => buildMilestones(source, timelineYears), [source, timelineYears]);

  // Search: resolve a query to galaxies (by name/synonym) or repos/ecosystems
  // (by label/description). Every match carries the domain whose modal it opens.
  const suggestions = useMemo<Suggestion[]>(() => {
    const ql = query.toLowerCase().trim();
    if (!ql) return [];
    const out: Suggestion[] = [];
    for (const d of Object.keys(DOMAIN_META) as DomainId[]) {
      const hay = `${DOMAIN_META[d].label} ${d} ${DOMAIN_SYN[d]}`.toLowerCase();
      if (hay.includes(ql)) out.push({ kind: "domain", domain: d, label: DOMAIN_META[d].label, sub: "Galaxy" });
    }
    for (const n of source.nodes) {
      if (n.kind === "domain") continue;
      if (n.label.toLowerCase().includes(ql) || (n.description ?? "").toLowerCase().includes(ql)) {
        out.push({
          kind: n.kind,
          domain: n.domain,
          label: n.label,
          sub: n.kind === "ecosystem" ? "Ecosystem" : DOMAIN_META[n.domain].label,
        });
      }
    }
    return out.slice(0, 8);
  }, [query, source]);

  const openModal = (s: Suggestion) => {
    setModalDomain(s.domain);
    setQuery("");
  };

  const setGraphZoom = (pct: number) => {
    setZoomPct(pct);
    fgRef.current?.zoom(Math.max(0.18, pct / 46), 350);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="top-brand">
          <strong>
            <span>Git</span>Verse
          </strong>
          <small>Live Beta</small>
        </div>

        <div className="searchbar top-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions[0]) openModal(suggestions[0]);
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Search repositories, domains, ecosystems..."
            aria-label="Search"
          />
          {query && (
            <div className="suggest">
              {suggestions.length === 0 && <div className="empty">No matches</div>}
              {suggestions.map((s, i) => (
                <button key={`${s.kind}-${s.label}-${i}`} onClick={() => openModal(s)}>
                  <span className="sdot" style={{ background: DOMAIN_META[s.domain].color }} />
                  <span className="slabel">{s.label}</span>
                  <span className="ssub">{s.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="topnav" aria-label="Primary">
          <button onClick={() => setModalDomain("ai")}>AI Explorer</button>
          <button onClick={() => setNowDomain("all")}>Collections</button>
          <button onClick={() => fgRef.current?.zoomToFit(500, 150)}>Compare</button>
          <button onClick={() => setSelected(null)}>About</button>
          <span className="avatar">GV</span>
        </nav>
      </header>

      <NowPanel
        domain={nowDomain}
        generatedAt={source.generatedAt}
        lists={now}
        domainStats={domainStats}
        universeStats={universeStats}
        onDomain={setNowDomain}
        onPick={(n) => {
          setSelected(n);
          setYear(Math.max(year, n.createdAt));
        }}
      />

      <div className="zoom-widget">
        <span>Zoom</span>
        <input
          type="range"
          min={18}
          max={130}
          value={zoomPct}
          onChange={(e) => setGraphZoom(Number(e.target.value))}
          aria-label="Graph zoom"
        />
        <strong>{zoomPct}%</strong>
      </div>

      <div className="map-tools">
        <button type="button" onClick={() => setGraphZoom(Math.min(130, zoomPct + 10))} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => setGraphZoom(Math.max(18, zoomPct - 10))} aria-label="Zoom out">
          -
        </button>
        <button type="button" onClick={() => fgRef.current?.zoomToFit(500, 150)} aria-label="Fit graph">
          Fit
        </button>
      </div>

      {!selected && spotlight && (
        <>
          <DomainSpotlight stat={spotlight} onExplore={() => setModalDomain(spotlight.domain)} />
          <UniverseInsights stats={universeStats} />
        </>
      )}

      <ForceGraph2D
        ref={fgRef as any}
        graphData={data}
        backgroundColor="#03040a"
        cooldownTime={5000}
        onEngineStop={() => fgRef.current?.zoomToFit(500, 120)}
        d3VelocityDecay={0.28}
        onZoom={({ k }: any) => setZoomPct(Math.round(Math.max(18, Math.min(130, k * 46))))}
        nodeRelSize={1}
        onNodeClick={(n: any) => born(n.createdAt) && setSelected(n)}
        onNodeHover={(n: any) => setHoverId(n?.id ?? null)}
        onBackgroundClick={() => setSelected(null)}
        linkColor={(l: any) => {
          const alpha = born(l.createdAt) ? (l.kind === "contains" ? 0.055 : 0.13) : 0.014;
          return `rgba(${EDGE_COLOR[l.kind as GVEdge["kind"]]},${alpha})`;
        }}
        linkWidth={(l: any) => (l.kind === "contains" ? 0.35 : 0.55)}
        linkCurvature={(l: any) => (l.kind === "contains" ? 0 : 0.12)}
        linkDirectionalParticles={0}
        linkDirectionalParticleWidth={0}
        linkDirectionalParticleSpeed={0.005}
        onRenderFramePre={(ctx: CanvasRenderingContext2D) => {
          const t = performance.now() / 1000;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";

          // A single broad nebula band keeps the whole scene reading as one galaxy.
          ctx.save();
          ctx.rotate(-0.18);
          const clouds: [number, number, number, number, string, number][] = [
            [-620, -60, 520, 190, "125,96,255", 0.13],
            [-210, 24, 620, 220, "232,158,220", 0.09],
            [260, -8, 560, 190, "166,190,255", 0.1],
            [650, 72, 430, 165, "203,164,244", 0.07],
          ];
          for (const [cx, cy, rx, ry, rgb, peak] of clouds) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(rx / ry, 1);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
            g.addColorStop(0, `rgba(${rgb},${peak})`);
            g.addColorStop(0.5, `rgba(${rgb},${peak * 0.34})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, ry, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
          }
          for (const d of galaxyDust.current) {
            const tw = 0.72 + 0.28 * Math.sin(t * d.tw + d.ph);
            ctx.globalAlpha = d.a * tw;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
            ctx.fillStyle = `rgb(${d.c})`;
            ctx.fill();
          }
          ctx.restore();

          // Domain orbit rings give each cluster a galaxy system without drawing bubbles.
          for (const d of DOMAIN_ORDER) {
            const a = DOMAIN_ANCHOR[d];
            const col = DOMAIN_META[d].color;
            const spin = t * 0.035 + a.x * 0.002;
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(spin);
            for (let i = 0; i < 5; i += 1) {
              const rx = 42 + i * 16;
              const ry = 12 + i * 6.2;
              ctx.lineWidth = 0.45;
              ctx.strokeStyle = hexToRgba(col, 0.13 - i * 0.018);
              ctx.beginPath();
              ctx.ellipse(0, 0, rx, ry, -0.18 + i * 0.08, 0, 2 * Math.PI);
              ctx.stroke();
            }
            for (let i = 0; i < 26; i += 1) {
              const p = (i / 26) * Math.PI * 2 + spin * 1.8;
              const rr = 20 + i * 2.3;
              const x = Math.cos(p) * rr;
              const y = Math.sin(p) * rr * 0.32;
              ctx.globalAlpha = 0.16 + 0.12 * Math.sin(t * 1.5 + i);
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.arc(x, y, i % 7 === 0 ? 1.2 : 0.55, 0, 2 * Math.PI);
              ctx.fill();
            }
            ctx.restore();
          }

          // Warm core at the center, matching the reference's galaxy nucleus.
          const core = ctx.createRadialGradient(0, 24, 0, 0, 24, 180);
          core.addColorStop(0, "rgba(255,244,210,0.34)");
          core.addColorStop(0.22, "rgba(242,178,246,0.16)");
          core.addColorStop(0.58, "rgba(87,111,255,0.06)");
          core.addColorStop(1, "rgba(87,111,255,0)");
          ctx.globalAlpha = 1;
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(0, 24, 180, 0, 2 * Math.PI);
          ctx.fill();

          // Twinkling starfield.
          for (const s of stars.current) {
            const tw = 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
            ctx.globalAlpha = s.a * tw;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
            ctx.fillStyle = `rgb(${s.c})`;
            ctx.fill();
            // cross-glint on the brightest stars
            if (s.bright) {
              ctx.globalAlpha = s.a * tw * 0.5;
              ctx.fillRect(s.x - s.r * 3, s.y - 0.15, s.r * 6, 0.3);
              ctx.fillRect(s.x - 0.15, s.y - s.r * 3, 0.3, s.r * 6);
            }
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        }}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          if (!born(node.createdAt)) return;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.max(8, nodeRadius(node) + 5), 0, 2 * Math.PI);
          ctx.fill();
        }}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          // Positions are undefined/NaN until the force layout runs its first ticks.
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
          const n = node as GVNode;
          const isBorn = born(n.createdAt);
          const color = DOMAIN_META[n.domain].color;
          const r = nodeRadius(n);
          const isSel = selected?.id === n.id;
          const isHover = hoverId === n.id;
          const alpha = isBorn ? 1 : 0.08;
          const badges = n.badges ?? [];
          const t = performance.now() / 1000;

          ctx.globalAlpha = alpha;

          const intensity =
            n.kind === "domain"
              ? 1
              : n.kind === "ecosystem"
              ? 0.82
              : 0.56 + Math.min(0.32, (n.trendScore ?? n.momentum ?? 0) * 0.32);
          const core = n.kind === "repo" ? Math.max(0.72, r * 0.42) : r * 0.58;
          const halo = r * (isSel || isHover ? 8.5 : n.kind === "repo" ? 5.8 : 6.8);

          // Additive bloom: broad and transparent, so nodes read as stars instead of disks.
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, halo);
          glow.addColorStop(0, `rgba(255,255,255,${isSel || isHover ? 0.42 : 0.26 * intensity})`);
          glow.addColorStop(0.2, hexToRgba(color, (isSel || isHover ? 0.18 : 0.11) * intensity));
          glow.addColorStop(0.58, hexToRgba(color, (isSel || isHover ? 0.07 : 0.035) * intensity));
          glow.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, halo, 0, 2 * Math.PI);
          ctx.fill();

          // Compact hot core. No opaque outer disk.
          const hot = ctx.createRadialGradient(
            node.x - core * 0.2,
            node.y - core * 0.2,
            0,
            node.x,
            node.y,
            core
          );
          hot.addColorStop(0, "rgba(255,255,255,0.98)");
          hot.addColorStop(0.38, "rgba(246,242,255,0.72)");
          hot.addColorStop(1, hexToRgba(color, n.kind === "repo" ? 0.74 : 0.9));
          ctx.fillStyle = hot;
          ctx.beginPath();
          ctx.arc(node.x, node.y, core, 0, 2 * Math.PI);
          ctx.fill();

          const shouldGlint =
            isSel ||
            isHover ||
            n.kind === "domain" ||
            (n.kind === "repo" && (badges.includes("trending") || badges.includes("new")));
          if (shouldGlint) {
            const pulse = 0.86 + 0.14 * Math.sin(t * 2.7 + r);
            const ray = Math.max(4.5, r * (isSel || isHover ? 2.9 : 2.1)) * pulse;
            const gap = Math.max(1.1, core * 1.45);
            ctx.lineWidth = (isSel || isHover ? 1.1 : 0.7) / globalScale;
            ctx.strokeStyle = `rgba(245,240,255,${isSel || isHover ? 0.92 : 0.42})`;
            ctx.beginPath();
            ctx.moveTo(node.x - ray, node.y);
            ctx.lineTo(node.x - gap, node.y);
            ctx.moveTo(node.x + gap, node.y);
            ctx.lineTo(node.x + ray, node.y);
            ctx.moveTo(node.x, node.y - ray);
            ctx.lineTo(node.x, node.y - gap);
            ctx.moveTo(node.x, node.y + gap);
            ctx.lineTo(node.x, node.y + ray);
            ctx.stroke();
          }
          ctx.restore();

          if (isSel || isHover) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = "rgba(255,255,255,0.86)";
            ctx.beginPath();
            ctx.arc(node.x, node.y, Math.max(1.2, core * 0.55), 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
          }

          // Semantic-zoom labels: keep the map sparse until the user zooms into a cluster.
          const show =
            n.kind === "domain" ||
            (n.kind === "ecosystem" && globalScale > 2.1) ||
            (n.kind === "repo" && (globalScale > 4.4 || isSel || isHover));
          if (isBorn && show) {
            const fontSize = (n.kind === "domain" ? 12 : n.kind === "ecosystem" ? 9 : 8) / globalScale;
            ctx.font = `${n.kind === "domain" ? 700 : 500} ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = n.kind === "domain" ? "rgba(242,240,255,0.94)" : "rgba(215,222,245,0.78)";
            ctx.shadowColor = "rgba(0,0,0,0.75)";
            ctx.shadowBlur = 4 / globalScale;
            const label = n.kind === "domain" ? DOMAIN_META[n.domain].label : n.label;
            ctx.fillText(label, node.x, node.y + r + fontSize * 1.05);
            if (n.kind === "domain") {
              const stat = domainStats.find((d) => d.domain === n.domain);
              ctx.font = `500 ${8 / globalScale}px Inter, sans-serif`;
              ctx.fillStyle = "rgba(184,191,218,0.78)";
              ctx.fillText(`${fmt(stat?.repos ?? 0)} repos`, node.x, node.y + r + fontSize * 1.95);
            }
            ctx.shadowBlur = 0;
          }
          ctx.globalAlpha = 1;
        }}
      />

      <div className="vignette" />

      {selected && analytics && (
        <div className="detail wide">
          <button className="close" onClick={() => setSelected(null)}>
            ✕
          </button>
          <div className="kind">
            {selected.kind === "domain" ? "Galaxy" : "Ecosystem"} · {year}
          </div>
          <h2 style={{ color: DOMAIN_META[selected.domain].color }}>
            {DOMAIN_META[selected.domain].label}
          </h2>
          <div className="stats">
            <div className="stat">
              <div className="v">{analytics.count}</div>
              <div className="l">Repos</div>
            </div>
            <div className="stat">
              <div className="v">{fmtStars(analytics.totalStars)}</div>
              <div className="l">Stars</div>
            </div>
            <div className="stat">
              <div className="v">{fmt(analytics.totalContributors)}</div>
              <div className="l">Contributors</div>
            </div>
            <div className="stat">
              <div className="v">{fmtStars(analytics.totalForks)}</div>
              <div className="l">Forks</div>
            </div>
            <div className="stat">
              <div className="v">{fmt(analytics.totalOpenIssues)}</div>
              <div className="l">Open issues</div>
            </div>
          </div>

          <Distribution
            title="Languages"
            rows={analytics.languages}
            total={analytics.count}
            color={DOMAIN_META[selected.domain].color}
          />
          <Distribution
            title="Licenses"
            rows={analytics.licenses}
            total={analytics.count}
            color={DOMAIN_META[selected.domain].color}
          />

          <MetricList
            title="Trending"
            rows={analytics.trending}
            value={(n) => `${Math.round((n.trendScore ?? n.momentum ?? 0) * 100)}`}
            unit="trend"
            color={DOMAIN_META[selected.domain].color}
            onPick={setSelected}
          />
          <MetricList
            title="New arrivals"
            rows={analytics.newest}
            value={(n) => `${Math.round((n.newScore ?? 0) * 100) || n.createdAt}`}
            unit={analytics.newest[0]?.newScore != null ? "new" : ""}
            color={DOMAIN_META[selected.domain].color}
            onPick={setSelected}
          />
          <MetricList
            title="Most contributed"
            rows={analytics.mostWorkedOn}
            value={(n) => `${Math.round((n.contributionScore ?? 0) * 100) || fmt(n.activity ?? 0)}`}
            unit={analytics.mostWorkedOn[0]?.contributionScore != null ? "activity" : "commits/90d"}
            color={DOMAIN_META[selected.domain].color}
            onPick={setSelected}
          />
          <MetricList
            title="Foundational"
            rows={analytics.foundational}
            value={(n) => (n.pagerank ?? 0).toFixed(2)}
            unit="centrality"
            color={DOMAIN_META[selected.domain].color}
            onPick={setSelected}
          />
        </div>
      )}

      {selected && !analytics && (
        <div className="detail">
          <button className="close" onClick={() => setSelected(null)}>
            ✕
          </button>
          <div className="kind">
            {selected.owner ? `${selected.owner} · ` : ""}
            {selected.kind} · {DOMAIN_META[selected.domain].label}
          </div>
          <h2>{selected.label}</h2>
          {selected.badges?.length ? (
            <div className="badges">
              {selected.badges.map((b) => (
                <span className={`badge ${b}`} key={b}>
                  {b}
                </span>
              ))}
            </div>
          ) : null}
          <div className="section-title">About</div>
          <div className="desc">{repoAbout(selected, relationships)}</div>
          {(selected.language || selected.license || selected.url || githubUrl(selected)) && (
            <div className="meta">
              {selected.language && <span className="tag">{selected.language}</span>}
              {selected.license && <span className="tag">{selected.license}</span>}
              {githubUrl(selected) && (
                <a className="tag link" href={githubUrl(selected)!} target="_blank" rel="noreferrer">
                  ⌥ GitHub
                </a>
              )}
              {selected.url && selected.url !== githubUrl(selected) && (
                <a className="tag link" href={selected.url} target="_blank" rel="noreferrer">
                  ↗ site
                </a>
              )}
            </div>
          )}
          <div className="stats">
            <div className="stat">
              <div className="v">{selected.stars ? `${selected.stars}k` : "—"}</div>
              <div className="l">Stars</div>
            </div>
            <div className="stat">
              <div className="v">{selected.forks != null ? `${selected.forks}k` : "—"}</div>
              <div className="l">Forks</div>
            </div>
            <div className="stat">
              <div className="v">{selected.contributors != null ? fmt(selected.contributors) : "—"}</div>
              <div className="l">Contributors</div>
            </div>
            <div className="stat">
              <div className="v">{selected.openIssues != null ? fmt(selected.openIssues) : "—"}</div>
              <div className="l">Open issues</div>
            </div>
            <div className="stat">
              <div className="v">{selected.pagerank?.toFixed(2) ?? "—"}</div>
              <div className="l">Centrality</div>
            </div>
            <div className="stat">
              <div className="v">{selected.trendScore != null ? `${Math.round(selected.trendScore * 100)}` : "—"}</div>
              <div className="l">Trend</div>
            </div>
            <div className="stat">
              <div className="v">{selected.newScore != null ? `${Math.round(selected.newScore * 100)}` : "—"}</div>
              <div className="l">New</div>
            </div>
            <div className="stat">
              <div className="v">
                {selected.contributionScore != null ? `${Math.round(selected.contributionScore * 100)}` : "—"}
              </div>
              <div className="l">Contrib</div>
            </div>
            <div className="stat">
              <div className="v">{selected.createdAt}</div>
              <div className="l">Appeared</div>
            </div>
            <div className="stat">
              <div className="v">{selected.lastPush ?? "—"}</div>
              <div className="l">Last push</div>
            </div>
          </div>
          {relationships.length > 0 && (
            <div className="rel">
              <h4>Relationships</h4>
              {relationships.map((r, i) => (
                <div
                  className="item"
                  key={i}
                  style={{ opacity: r.born ? 1 : 0.35 }}
                >
                  <span className="via">{r.via} </span>
                  {r.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="hint">
        Nodes fade in as they appear in history — drag the timeline to replay the ecosystem.
      </div>

      <TimelineControl
        year={year}
        minYear={minYear}
        maxYear={maxYear}
        playing={playing}
        visibleCount={visibleCount}
        totalCount={data.nodes.length}
        live={Boolean(remote)}
        years={timelineYears}
        milestones={milestones}
        onPlay={() => setPlaying((p) => !p)}
        onYear={(next) => {
          setPlaying(false);
          setYear(next);
        }}
      />

      {modalDomain && (
        <SearchModal domain={modalDomain} source={source} onClose={() => setModalDomain(null)} />
      )}
    </div>
  );
}

function DomainSpotlight({
  stat,
  onExplore,
}: {
  stat: DomainStat;
  onExplore: () => void;
}) {
  const meta = DOMAIN_META[stat.domain];
  return (
    <aside className="insight-card domain-spotlight">
      <div className="spot-head">
        <span className="spot-icon" style={{ background: meta.color, color: meta.color }} />
        <div>
          <h3>{meta.label}</h3>
          <p>{fmt(stat.repos)} repositories</p>
        </div>
      </div>
      <p className="spot-copy">{DOMAIN_DESCRIPTIONS[stat.domain]}</p>
      <div className="spot-grid">
        <div>
          <span>Stars</span>
          <strong>{fmtStars(stat.stars)}</strong>
        </div>
        <div>
          <span>Contributors</span>
          <strong>{fmt(stat.contributors)}</strong>
        </div>
        <div>
          <span>New signals</span>
          <strong>{fmt(stat.fresh)}</strong>
        </div>
        <div>
          <span>Trend</span>
          <strong>{Math.round(stat.trend * 100)}</strong>
        </div>
      </div>
      <div className="top-repos">
        <h4>Top repositories</h4>
        {stat.topRepos.map((n) => (
          <a key={n.id} href={githubUrl(n) ?? "#"} target="_blank" rel="noreferrer">
            <span>{n.owner ? `${n.owner} / ${n.label}` : n.label}</span>
            <strong>{fmtStars(n.stars ?? 0)}</strong>
          </a>
        ))}
      </div>
      <button className="explore" onClick={onExplore}>
        {"Explore ecosystem ->"}
      </button>
    </aside>
  );
}

function UniverseInsights({
  stats,
}: {
  stats: UniverseStats;
}) {
  return (
    <aside className="insight-card universe-insights">
      <h3>Universe insights</h3>
      <div className="insight-row">
        <span>Total stars</span>
        <strong>{fmtStars(stats.stars)}</strong>
      </div>
      <div className="insight-row">
        <span>Active contributors</span>
        <strong>{fmt(stats.contributors)}</strong>
      </div>
      <div className="insight-row">
        <span>New repos</span>
        <strong>{fmt(stats.fresh)}</strong>
      </div>
      <div className="insight-row">
        <span>Open issues</span>
        <strong>{fmt(stats.openIssues)}</strong>
      </div>
    </aside>
  );
}

function TimelineControl({
  year,
  minYear,
  maxYear,
  playing,
  visibleCount,
  totalCount,
  live,
  years,
  milestones,
  onPlay,
  onYear,
}: {
  year: number;
  minYear: number;
  maxYear: number;
  playing: boolean;
  visibleCount: number;
  totalCount: number;
  live: boolean;
  years: number[];
  milestones: { year: number; title: string; sub: string }[];
  onPlay: () => void;
  onYear: (year: number) => void;
}) {
  return (
    <div className="timeline">
      <div className="timeline-head">
        <span>Timeline: the evolution of GitHub</span>
        <span className="live-pill">{live ? "Live" : "Sample"}</span>
      </div>
      <div className="timeline-main">
        <button className="play" onClick={onPlay}>
          {playing ? "Pause" : "Play"}
        </button>
        <div className="timeline-track">
          <div className="timeline-years">
            {years.map((y) => (
              <span key={y}>{y}</span>
            ))}
          </div>
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={year}
            onChange={(e) => onYear(Number(e.target.value))}
          />
        </div>
        <span className="year-pill">{year}</span>
      </div>
      <div className="timeline-foot">
        <span>
          {visibleCount} of {totalCount} nodes visible
        </span>
      </div>
      <div className="milestone-grid">
        {milestones.map((m) => (
          <button key={`${m.year}-${m.title}`} onClick={() => onYear(m.year)}>
            <strong>{m.year}</strong>
            <span>{m.title}</span>
            <small>{m.sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function NowPanel({
  domain,
  generatedAt,
  lists,
  domainStats,
  universeStats,
  onDomain,
  onPick,
}: {
  domain: DomainFilter;
  generatedAt?: string;
  lists: { trending: GVNode[]; fresh: GVNode[]; active: GVNode[] };
  domainStats: DomainStat[];
  universeStats: UniverseStats;
  onDomain: (d: DomainFilter) => void;
  onPick: (n: GVNode) => void;
}) {
  const stamp = generatedAt
    ? new Date(generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "sample";

  return (
    <aside className="now-panel">
      <nav className="side-nav" aria-label="GitVerse views">
        {SIDE_NAV.map((item, i) => (
          <button key={item} className={i === 0 ? "on" : ""}>
            <span className="nav-dot" />
            {item}
          </button>
        ))}
      </nav>

      <section className="side-section">
        <h4>Top domains</h4>
        {domainStats.map((d) => (
          <button
            className={`domain-stat ${domain === d.domain ? "on" : ""}`}
            key={d.domain}
            onClick={() => onDomain(d.domain)}
          >
            <span
              className="domain-dot"
              style={{ background: DOMAIN_META[d.domain].color, color: DOMAIN_META[d.domain].color }}
            />
            <span>{DOMAIN_META[d.domain].label}</span>
            <strong>{fmt(d.repos)}</strong>
          </button>
        ))}
      </section>

      <div className="now-head">
        <div>
          <div className="kind">Now on GitHub</div>
          <h3>{domain === "all" ? "All domains" : DOMAIN_META[domain].label}</h3>
        </div>
        <span className="stamp">{stamp}</span>
      </div>

      <div className="domain-tabs" aria-label="Filter now panel by domain">
        <button className={domain === "all" ? "on" : ""} onClick={() => onDomain("all")}>
          All
        </button>
        {DOMAIN_ORDER.map((d) => (
          <button
            key={d}
            className={domain === d ? "on" : ""}
            onClick={() => onDomain(d)}
            title={DOMAIN_META[d].label}
          >
            <span style={{ background: DOMAIN_META[d].color }} />
          </button>
        ))}
      </div>

      <NowList
        title="Trending"
        rows={lists.trending}
        value={(n) => `${Math.round((n.trendScore ?? n.momentum ?? 0) * 100)}`}
        onPick={onPick}
      />
      <NowList
        title="New"
        rows={lists.fresh}
        value={(n) => (n.newScore != null ? `${Math.round(n.newScore * 100)}` : `${n.createdAt}`)}
        onPick={onPick}
      />
      <NowList
        title="Most contributed"
        rows={lists.active}
        value={(n) =>
          n.contributionScore != null ? `${Math.round(n.contributionScore * 100)}` : fmt(n.activity ?? 0)
        }
        onPick={onPick}
      />

      <div className="side-total">
        <span>Total repositories</span>
        <strong>{fmt(universeStats.repos)}</strong>
        <small>{stamp}</small>
      </div>
    </aside>
  );
}

function NowList({
  title,
  rows,
  value,
  onPick,
}: {
  title: string;
  rows: GVNode[];
  value: (n: GVNode) => string;
  onPick: (n: GVNode) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="now-list">
      <h4>{title}</h4>
      {rows.map((n, i) => (
        <button key={`${title}-${n.id}`} onClick={() => onPick(n)}>
          <span className="rank">
            {title === "Trending"
              ? n.trendRank ?? i + 1
              : title === "New"
              ? n.newRank ?? i + 1
              : n.contributionRank ?? i + 1}
          </span>
          <span className="repo">
            <span>{n.label}</span>
            <small>{DOMAIN_META[n.domain].label}</small>
          </span>
          <span className="score">{value(n)}</span>
        </button>
      ))}
    </section>
  );
}

function MetricList({
  title,
  rows,
  value,
  unit,
  color,
  onPick,
}: {
  title: string;
  rows: GVNode[];
  value: (n: GVNode) => string;
  unit: string;
  color: string;
  onPick: (n: GVNode) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="metric">
      <h4>{title}</h4>
      {rows.map((n) => (
        <button className="mrow" key={n.id} onClick={() => onPick(n)}>
          <span className="mname">{n.label}</span>
          <span className="mval" style={{ color }}>
            {value(n)} <span className="munit">{unit}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Horizontal breakdown bars for a categorical field (languages, licenses).
function Distribution({
  title,
  rows,
  total,
  color,
}: {
  title: string;
  rows: [string, number][];
  total: number;
  color: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="metric">
      <h4>{title}</h4>
      {rows.map(([name, n]) => (
        <div className="drow" key={name}>
          <span className="dname">{name}</span>
          <span className="dbar">
            <span
              className="dfill"
              style={{ width: `${Math.max(6, (n / total) * 100)}%`, background: color }}
            />
          </span>
          <span className="dcount">{n}</span>
        </div>
      ))}
    </div>
  );
}

// Canonical github.com URL for a repo node. Prefers the ingested `github` field;
// otherwise derives it from owner + repo name (label is the repo name).
function githubUrl(n: GVNode): string | null {
  if (n.github) return n.github;
  if (!n.owner) return null;
  const name = n.label.includes("/") ? n.label.split("/").pop()! : n.label;
  return `https://github.com/${n.owner}/${name}`;
}

function repoAbout(n: GVNode, relationships: { label: string; via: string; born: boolean }[]): string {
  if (n.description?.trim()) return n.description;

  const bits: string[] = [];
  const owner = n.owner ? `${n.owner}/` : "";
  const lang = n.language ? `${n.language} repository` : "repository";
  bits.push(`${owner}${n.label} is a ${lang} mapped to ${DOMAIN_META[n.domain].label}.`);

  if (n.discoveredBy) {
    const source =
      n.discoveredBy === "search"
        ? "GitHub Search discovery"
        : n.discoveredBy === "dependency"
        ? "dependency expansion"
        : "the curated seed set";
    bits.push(`It entered GitVerse through ${source}.`);
  }

  if (n.badges?.length) {
    bits.push(`Current signals: ${n.badges.join(", ")}.`);
  }

  const liveRels = relationships.filter((r) => r.born).slice(0, 3);
  if (liveRels.length) {
    bits.push(`Visible links include ${liveRels.map((r) => `${r.via} ${r.label}`).join(", ")}.`);
  }

  return bits.join(" ");
}

function buildTimelineYears(minYear: number, maxYear: number): number[] {
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear) || minYear >= maxYear) {
    return [minYear].filter(Number.isFinite);
  }
  const span = maxYear - minYear;
  const step = span > 14 ? 3 : 2;
  const out: number[] = [];
  for (let y = minYear; y <= maxYear; y += step) out.push(y);
  if (out[out.length - 1] !== maxYear) out.push(maxYear);
  return out;
}

function buildMilestones(source: GVGraph, years: number[]): { year: number; title: string; sub: string }[] {
  const repos = source.nodes.filter((n) => n.kind === "repo");
  return years.slice(-6).map((year) => {
    const bornThisYear = repos
      .filter((n) => n.createdAt === year)
      .sort((a, b) => (b.trendScore ?? b.momentum ?? 0) - (a.trendScore ?? a.momentum ?? 0));
    const fallback = repos
      .filter((n) => n.createdAt <= year)
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
    const repo = bornThisYear[0] ?? fallback[0];
    return {
      year,
      title: repo ? repo.label : "GitVerse expands",
      sub: repo ? DOMAIN_META[repo.domain].label : "Repository map",
    };
  });
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

// stars in the sample are already expressed in thousands
function fmtStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}M` : `${n}k`;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// Search result modal — a one-domain "state of the ecosystem" report:
//   1) pie of the top-5 trending repos (click a slice → its one-liner)
//   2) year-wise bar of repos appearing in the domain
//   3) a data-driven list summary of what's happening
// ---------------------------------------------------------------------------
function SearchModal({
  domain,
  source,
  onClose,
}: {
  domain: DomainId;
  source: GVGraph;
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = DOMAIN_META[domain];
  const repos = source.nodes.filter((n) => n.kind === "repo" && n.domain === domain);
  const top5 = [...repos]
    .sort((a, b) => (b.trendScore ?? b.momentum ?? 0) - (a.trendScore ?? a.momentum ?? 0))
    .slice(0, 5);

  // year-wise counts
  const byYear = new Map<number, number>();
  for (const r of repos) byYear.set(r.createdAt, (byYear.get(r.createdAt) ?? 0) + 1);
  const yearBars = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, n]) => ({ label: String(y), value: n }));

  // ecosystem breakdown (from "contains" edges)
  const ecoNodes = source.nodes.filter((n) => n.kind === "ecosystem" && n.domain === domain);
  const ecoCounts = ecoNodes
    .map((e) => ({
      label: e.label,
      count: source.links.filter((l) => {
        const s = typeof l.source === "string" ? l.source : (l.source as any).id;
        return s === e.id && l.kind === "contains";
      }).length,
    }))
    .sort((a, b) => b.count - a.count);

  const totalStars = repos.reduce((s, n) => s + (n.stars ?? 0), 0);
  const foundational = [...repos].sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0))[0];
  const newest = [...repos].sort((a, b) => (b.newScore ?? 0) - (a.newScore ?? 0))[0];
  const mostActive = [...repos].sort((a, b) => (b.contributionScore ?? 0) - (a.contributionScore ?? 0))[0];
  const years = repos.map((r) => r.createdAt);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "—";

  const summary = [
    { icon: "Map", text: `${repos.length} repositories mapped, ${fmtStars(totalStars)} stars combined, spanning ${span}.` },
    ecoCounts[0] && { icon: "Eco", text: `Largest ecosystem: ${ecoCounts[0].label} (${ecoCounts[0].count} repos).` },
    top5[0] && { icon: "Hot", text: `Trending now: ${top5[0].label} — score ${Math.round((top5[0].trendScore ?? top5[0].momentum ?? 0) * 100)}.` },
    mostActive && { icon: "Act", text: `Most contributed: ${mostActive.label} — score ${Math.round((mostActive.contributionScore ?? 0) * 100)}.` },
    foundational && { icon: "Base", text: `Most foundational: ${foundational.label} (centrality ${(foundational.pagerank ?? 0).toFixed(2)}).` },
    newest && { icon: "New", text: `Freshest high-signal repo: ${newest.label}, appeared ${newest.createdAt}.` },
  ].filter(Boolean) as { icon: string; text: string }[];

  const slices = top5.map((n, i) => ({
    label: n.label,
    value: n.trendScore ?? n.momentum ?? 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const activeRepo = top5[active];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          ✕
        </button>
        <div className="kind">Galaxy report</div>
        <h2 style={{ color: meta.color }}>{meta.label}</h2>

        {repos.length === 0 ? (
          <p className="empty">No repositories mapped in this galaxy yet.</p>
        ) : (
          <div className="modal-grid">
            <section className="mcard">
              <h4>Top trending — score share</h4>
              <div className="pierow">
                <PieChart slices={slices} active={active} onSelect={setActive} />
                <div className="pielegend">
                  {slices.map((s, i) => (
                    <button
                      key={s.label}
                      className={`plrow ${i === active ? "on" : ""}`}
                      onClick={() => setActive(i)}
                    >
                      <span className="sdot" style={{ background: s.color }} />
                      <span className="slabel">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {activeRepo && (
                <div className="pieinfo">
                  <strong>{activeRepo.label}</strong>
                  <span className="oneliner">{activeRepo.description || "No description."}</span>
                  <span className="ostats">
                    {activeRepo.stars ? `${activeRepo.stars}k stars` : ""} · trend{" "}
                    {Math.round((activeRepo.trendScore ?? activeRepo.momentum ?? 0) * 100)}
                    {activeRepo.language ? ` · ${activeRepo.language}` : ""}
                  </span>
                  {githubUrl(activeRepo) && (
                    <a className="ghlink" href={githubUrl(activeRepo)!} target="_blank" rel="noreferrer">
                      ⌥ View on GitHub ↗
                    </a>
                  )}
                </div>
              )}
            </section>

            <section className="mcard">
              <h4>New repos by year</h4>
              <BarChart bars={yearBars} color={meta.color} />
            </section>

            <section className="mcard wide">
              <h4>What's happening on GitHub</h4>
              <ul className="summary">
                {summary.map((s, i) => (
                  <li key={i}>
                    <span className="sicon">{s.icon}</span>
                    {s.text}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// SVG pie. Slices are drawn in fixed order; the active slice pops out + others dim.
function PieChart({
  slices,
  active,
  onSelect,
}: {
  slices: { label: string; value: number; color: string }[];
  active: number;
  onSelect: (i: number) => void;
}) {
  const cx = 90;
  const cy = 90;
  const R = 82;
  const sum = slices.reduce((a, s) => a + s.value, 0);
  // if every value is 0/undefined, weight slices equally so the pie still reads
  const vals = slices.map((s) => (sum > 0 ? s.value : 1));
  const total = vals.reduce((a, v) => a + v, 0) || 1;

  if (slices.length === 1) {
    return (
      <svg viewBox="0 0 180 180" className="pie">
        <circle cx={cx} cy={cy} r={R} fill={slices[0].color} stroke="#05060d" strokeWidth={2} />
      </svg>
    );
  }

  let a0 = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const a1 = a0 + (vals[i] / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const mid = (a0 + a1) / 2;
    const d = `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large} 1 ${x1.toFixed(
      2
    )},${y1.toFixed(2)} Z`;
    a0 = a1;
    return { d, mid, pct: Math.round((vals[i] / total) * 100), ...s, i };
  });

  return (
    <svg viewBox="0 0 180 180" className="pie">
      {arcs.map((a) => {
        const off = a.i === active ? 6 : 0;
        const dx = Math.cos(a.mid) * off;
        const dy = Math.sin(a.mid) * off;
        return (
          <path
            key={a.i}
            d={a.d}
            fill={a.color}
            transform={`translate(${dx.toFixed(2)},${dy.toFixed(2)})`}
            opacity={a.i === active ? 1 : 0.55}
            stroke="#05060d"
            strokeWidth={2}
            style={{ cursor: "pointer", transition: "transform .15s, opacity .15s" }}
            onClick={() => onSelect(a.i)}
          >
            <title>
              {a.label}: {a.pct}%
            </title>
          </path>
        );
      })}
    </svg>
  );
}

// SVG single-series bar chart (repos per year). Hover reveals the value.
function BarChart({
  bars,
  color,
}: {
  bars: { label: string; value: number }[];
  color: string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  if (bars.length === 0) return <div className="empty">No dated repos.</div>;
  const max = Math.max(...bars.map((b) => b.value), 1);
  const bw = 26;
  const gap = 8;
  const padL = 4;
  const padB = 20;
  const padT = 16;
  const H = 156;
  const W = padL * 2 + bars.length * bw + (bars.length - 1) * gap;
  const plotH = H - padB - padT;

  return (
    <div className="barwrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="bars" style={{ minWidth: W }}>
        <line x1={0} y1={H - padB} x2={W} y2={H - padB} stroke="#2c2c2a" strokeWidth={1} />
        {bars.map((b, i) => {
          const h = (b.value / max) * plotH;
          const x = padL + i * (bw + gap);
          const y = H - padB - h;
          return (
            <g
              key={b.label}
              onMouseEnter={() => setHi(i)}
              onMouseLeave={() => setHi(null)}
            >
              <rect
                x={x}
                y={y}
                width={bw}
                height={Math.max(h, 1)}
                rx={4}
                fill={color}
                opacity={hi === null || hi === i ? 0.9 : 0.5}
              />
              <text x={x + bw / 2} y={H - padB + 12} textAnchor="middle" className="baraxis">
                {b.label}
              </text>
              {hi === i && (
                <text x={x + bw / 2} y={y - 4} textAnchor="middle" className="barval">
                  {b.value}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
