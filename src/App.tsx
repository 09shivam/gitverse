import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { forceCollide, forceX, forceY } from "d3-force";
import { sampleGraph, DOMAIN_META } from "./data/sample";
import type { GVNode, GVEdge, GVGraph, DomainId, NodeKind } from "./types";

// Anchor each domain to a point on a ring so galaxies settle into distinct
// regions instead of collapsing into one ball.
const DOMAIN_ORDER: DomainId[] = ["ai", "web", "devops", "databases", "security"];
const DOMAIN_ANCHOR: Record<DomainId, { x: number; y: number }> = Object.fromEntries(
  DOMAIN_ORDER.map((d, i) => {
    const a = (i / DOMAIN_ORDER.length) * Math.PI * 2 - Math.PI / 2;
    return [d, { x: Math.cos(a) * 260, y: Math.sin(a) * 260 }];
  })
) as Record<DomainId, { x: number; y: number }>;

const MIN_YEAR = 2008;
const MAX_YEAR = 2024;

const EDGE_COLOR: Record<GVEdge["kind"], string> = {
  contains: "160,170,210",
  depends_on: "255,138,76",
  shares_tech: "34,193,166",
  similar_to: "124,92,255",
};

const EDGE_LABEL: Record<GVEdge["kind"], string> = {
  contains: "contains",
  depends_on: "depends on",
  shares_tech: "shares tech with",
  similar_to: "similar to",
};

function nodeRadius(n: GVNode): number {
  if (n.kind === "domain") return 16;
  if (n.kind === "ecosystem") return 9;
  return 3 + Math.sqrt(n.stars ?? 10) * 0.7;
}

// Extra keywords so "machine learning", "frontend", "infra" etc. resolve to a galaxy.
const DOMAIN_SYN: Record<DomainId, string> = {
  ai: "artificial intelligence machine learning ml llm deep neural model data science",
  web: "web frontend backend javascript typescript react node http framework",
  devops: "devops cloud infrastructure kubernetes docker container ci cd deploy",
  databases: "database data sql storage query vector cache warehouse",
  security: "security auth vulnerability scanning crypto appsec",
};

// Validated dark-mode categorical palette (dataviz skill) — fixed order, not cycled.
const CHART_COLORS = ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70"];

interface Suggestion {
  kind: NodeKind;
  domain: DomainId;
  label: string;
  sub: string;
}

export default function App() {
  const fgRef = useRef<ForceGraphMethods>();
  const [year, setYear] = useState(MAX_YEAR);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<GVNode | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modalDomain, setModalDomain] = useState<DomainId | null>(null);

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
    const nodes = source.nodes.map((n) => {
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
  }, [source]);

  // Persistent starfield — mostly faint white dust, a few bright tinted stars
  // that slowly twinkle. `tw`/`ph` drive the per-star shimmer.
  const stars = useRef(
    Array.from({ length: 680 }, () => {
      const bright = Math.random() < 0.07;
      const tint = Math.random();
      return {
        x: (Math.random() - 0.5) * 3400,
        y: (Math.random() - 0.5) * 3400,
        r: bright ? Math.random() * 1.5 + 0.9 : Math.random() * 0.85 + 0.15,
        a: bright ? Math.random() * 0.45 + 0.5 : Math.random() * 0.32 + 0.06,
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
    fg.d3Force("charge")?.strength(-90).distanceMax(220);
    const link = fg.d3Force("link");
    // @ts-ignore - d3 link force distance/strength
    link?.distance((l: any) => (l.kind === "contains" ? 24 : 100));
    // @ts-ignore - weaken cross-domain pull so galaxies don't merge
    link?.strength((l: any) => (l.kind === "contains" ? 0.8 : 0.03));
    // keep nodes from overlapping
    fg.d3Force("collide", forceCollide((n: any) => nodeRadius(n) + 4).strength(1));
    // hold repos near their galaxy (domain centers are already pinned via fx/fy)
    fg.d3Force("x", forceX((n: any) => DOMAIN_ANCHOR[n.domain as DomainId].x).strength(0.25));
    fg.d3Force("y", forceY((n: any) => DOMAIN_ANCHOR[n.domain as DomainId].y).strength(0.25));
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
      trending: top((n) => n.momentum ?? 0),
      newest: top((n) => n.createdAt),
      mostWorkedOn: top((n) => n.activity ?? 0),
      foundational: top((n) => n.pagerank ?? 0),
    };
  }, [selected, born, source]);

  const visibleCount = data.nodes.filter((n) => born(n.createdAt)).length;

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

  return (
    <div className="app">
      <div className="header">
        <h1>
          <span className="brand">Git</span>Verse
        </h1>
        <p>
          A software observatory — exploring GitHub as one connected universe.
          Scroll to zoom, drag to pan, click a node.{" "}
          {remote ? "Live GitHub data." : "Sample data."}
        </p>
      </div>

      <div className="searchbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions[0]) openModal(suggestions[0]);
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="🔍  Search a domain, ecosystem, or repo…"
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

      <div className="legend">
        <h3>Domains</h3>
        {(Object.keys(DOMAIN_META) as DomainId[]).map((d) => (
          <div className="row" key={d}>
            <span
              className="dot"
              style={{ background: DOMAIN_META[d].color, color: DOMAIN_META[d].color }}
            />
            {DOMAIN_META[d].label}
          </div>
        ))}
      </div>

      <ForceGraph2D
        ref={fgRef as any}
        graphData={data}
        backgroundColor="#03040a"
        cooldownTime={5000}
        onEngineStop={() => fgRef.current?.zoomToFit(500, 120)}
        d3VelocityDecay={0.28}
        nodeRelSize={1}
        onNodeClick={(n: any) => born(n.createdAt) && setSelected(n)}
        onNodeHover={(n: any) => setHoverId(n?.id ?? null)}
        onBackgroundClick={() => setSelected(null)}
        linkColor={(l: any) => {
          const alpha = born(l.createdAt) ? (l.kind === "contains" ? 0.14 : 0.32) : 0.025;
          return `rgba(${EDGE_COLOR[l.kind as GVEdge["kind"]]},${alpha})`;
        }}
        linkWidth={(l: any) => (l.kind === "contains" ? 0.5 : 0.9)}
        linkCurvature={(l: any) => (l.kind === "contains" ? 0 : 0.18)}
        linkDirectionalParticles={(l: any) =>
          l.kind === "depends_on" && born(l.createdAt) ? 2 : 0
        }
        linkDirectionalParticleWidth={1.6}
        linkDirectionalParticleSpeed={0.005}
        onRenderFramePre={(ctx: CanvasRenderingContext2D) => {
          const t = performance.now() / 1000;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";

          // Nebula clouds: each galaxy sits in a soft luminous haze of its hue,
          // with a fainter offset lobe so the cloud reads as billowy, not a disc.
          for (const d of DOMAIN_ORDER) {
            const a = DOMAIN_ANCHOR[d];
            const col = DOMAIN_META[d].color;
            const drift = Math.sin(t * 0.15 + a.x) * 14;
            const lobes: [number, number, number, number][] = [
              [a.x, a.y, 360, 0.14],
              [a.x + drift + 60, a.y - 40, 240, 0.1],
              [a.x - drift - 50, a.y + 60, 200, 0.08],
            ];
            for (const [cx, cy, R, peak] of lobes) {
              const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
              g.addColorStop(0, hexToRgba(col, peak));
              g.addColorStop(0.45, hexToRgba(col, peak * 0.32));
              g.addColorStop(1, hexToRgba(col, 0));
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(cx, cy, R, 0, 2 * Math.PI);
              ctx.fill();
            }
          }

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
          ctx.arc(node.x, node.y, nodeRadius(node) + 2, 0, 2 * Math.PI);
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

          ctx.globalAlpha = alpha;

          // additive bloom halo — makes each node read as a luminous star
          const bloom = isSel || isHover ? 4.2 : 3.2;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * bloom);
          glow.addColorStop(0, hexToRgba(color, 0.7));
          glow.addColorStop(0.35, hexToRgba(color, 0.28));
          glow.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * bloom, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();

          // core with a hot white center for that "burning star" look
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          const hot = ctx.createRadialGradient(
            node.x - r * 0.3,
            node.y - r * 0.3,
            0,
            node.x,
            node.y,
            r
          );
          hot.addColorStop(0, "rgba(255,255,255,0.85)");
          hot.addColorStop(0.5, hexToRgba(color, 0.2));
          hot.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = hot;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fill();
          if (isSel || isHover) {
            ctx.lineWidth = 1.5 / globalScale;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          }

          // semantic-zoom labels: domains always; ecosystems mid-zoom; repos when zoomed in
          const show =
            n.kind === "domain" ||
            (n.kind === "ecosystem" && globalScale > 1.3) ||
            (n.kind === "repo" && (globalScale > 2.4 || isSel || isHover));
          if (isBorn && show) {
            const fontSize = (n.kind === "domain" ? 13 : 11) / globalScale;
            ctx.font = `${n.kind === "domain" ? 700 : 500} ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(231,236,255,0.92)";
            ctx.fillText(n.label, node.x, node.y + r + fontSize * 0.9);
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
            title="🔥 Trending"
            rows={analytics.trending}
            value={(n) => `${Math.round((n.momentum ?? 0) * 100)}`}
            unit="momentum"
            color={DOMAIN_META[selected.domain].color}
            onPick={setSelected}
          />
          <MetricList
            title="✨ New arrivals"
            rows={analytics.newest}
            value={(n) => `${n.createdAt}`}
            unit=""
            color={DOMAIN_META[selected.domain].color}
            onPick={setSelected}
          />
          <MetricList
            title="🛠️ Most worked on"
            rows={analytics.mostWorkedOn}
            value={(n) => fmt(n.activity ?? 0)}
            unit="commits/90d"
            color={DOMAIN_META[selected.domain].color}
            onPick={setSelected}
          />
          <MetricList
            title="🏛️ Foundational"
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
          {selected.description && <div className="desc">{selected.description}</div>}
          {(selected.language || selected.license || selected.url) && (
            <div className="meta">
              {selected.language && <span className="tag">{selected.language}</span>}
              {selected.license && <span className="tag">{selected.license}</span>}
              {selected.url && (
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
              <div className="v">{selected.momentum != null ? `${Math.round(selected.momentum * 100)}` : "—"}</div>
              <div className="l">Momentum</div>
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

      <div className="timeline">
        <div className="row">
          <button className="play" onClick={() => setPlaying((p) => !p)}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <span className="year">{year}</span>
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={year}
            onChange={(e) => {
              setPlaying(false);
              setYear(Number(e.target.value));
            }}
          />
        </div>
        <div className="caption">
          <span>{minYear}</span>
          <span>
            {visibleCount} of {data.nodes.length} nodes visible
            {remote ? " · live GitHub data" : " · sample data"}
          </span>
          <span>{maxYear}</span>
        </div>
      </div>

      {modalDomain && (
        <SearchModal domain={modalDomain} source={source} onClose={() => setModalDomain(null)} />
      )}
    </div>
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
  const top5 = [...repos].sort((a, b) => (b.momentum ?? 0) - (a.momentum ?? 0)).slice(0, 5);

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
  const newest = [...repos].sort((a, b) => b.createdAt - a.createdAt)[0];
  const years = repos.map((r) => r.createdAt);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "—";

  const summary = [
    { icon: "📦", text: `${repos.length} repositories mapped, ${fmtStars(totalStars)}★ combined, spanning ${span}.` },
    ecoCounts[0] && { icon: "🌐", text: `Largest ecosystem: ${ecoCounts[0].label} (${ecoCounts[0].count} repos).` },
    top5[0] && { icon: "🔥", text: `Fastest rising: ${top5[0].label} — momentum ${Math.round((top5[0].momentum ?? 0) * 100)}.` },
    foundational && { icon: "🏛️", text: `Most foundational: ${foundational.label} (centrality ${(foundational.pagerank ?? 0).toFixed(2)}).` },
    newest && { icon: "✨", text: `Newest arrival: ${newest.label}, appeared ${newest.createdAt}.` },
  ].filter(Boolean) as { icon: string; text: string }[];

  const slices = top5.map((n, i) => ({
    label: n.label,
    value: n.momentum ?? 0,
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
            {/* 1 — pie of top-5 trending */}
            <section className="mcard">
              <h4>🔥 Top trending — share of momentum</h4>
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
                    {activeRepo.stars ? `${activeRepo.stars}k★` : ""} · momentum{" "}
                    {Math.round((activeRepo.momentum ?? 0) * 100)}
                    {activeRepo.language ? ` · ${activeRepo.language}` : ""}
                  </span>
                </div>
              )}
            </section>

            {/* 2 — year-wise bar */}
            <section className="mcard">
              <h4>📈 New repos by year</h4>
              <BarChart bars={yearBars} color={meta.color} />
            </section>

            {/* 3 — list summary */}
            <section className="mcard wide">
              <h4>📋 What's happening on GitHub</h4>
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
