import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { forceCollide, forceX, forceY } from "d3-force";
import { sampleGraph, DOMAIN_META } from "./data/sample";
import type { GVNode, GVEdge, GVGraph, DomainId } from "./types";

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

export default function App() {
  const fgRef = useRef<ForceGraphMethods>();
  const [year, setYear] = useState(MAX_YEAR);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<GVNode | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

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

  // Persistent starfield.
  const stars = useRef(
    Array.from({ length: 320 }, () => ({
      x: (Math.random() - 0.5) * 2600,
      y: (Math.random() - 0.5) * 2600,
      r: Math.random() * 1.1 + 0.2,
      a: Math.random() * 0.5 + 0.1,
    }))
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

    return {
      count: repos.length,
      totalStars: repos.reduce((s, n) => s + (n.stars ?? 0), 0),
      totalContributors: repos.reduce((s, n) => s + (n.contributors ?? 0), 0),
      trending: top((n) => n.momentum ?? 0),
      newest: top((n) => n.createdAt),
      mostWorkedOn: top((n) => n.activity ?? 0),
      foundational: top((n) => n.pagerank ?? 0),
    };
  }, [selected, born, source]);

  const visibleCount = data.nodes.filter((n) => born(n.createdAt)).length;

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
        backgroundColor="#05060d"
        cooldownTime={5000}
        onEngineStop={() => fgRef.current?.zoomToFit(500, 120)}
        d3VelocityDecay={0.28}
        nodeRelSize={1}
        onNodeClick={(n: any) => born(n.createdAt) && setSelected(n)}
        onNodeHover={(n: any) => setHoverId(n?.id ?? null)}
        onBackgroundClick={() => setSelected(null)}
        linkColor={(l: any) => {
          const alpha = born(l.createdAt) ? (l.kind === "contains" ? 0.22 : 0.5) : 0.03;
          return `rgba(${EDGE_COLOR[l.kind as GVEdge["kind"]]},${alpha})`;
        }}
        linkWidth={(l: any) => (l.kind === "contains" ? 0.6 : 1.1)}
        linkDirectionalParticles={(l: any) =>
          l.kind === "depends_on" && born(l.createdAt) ? 2 : 0
        }
        linkDirectionalParticleWidth={1.6}
        linkDirectionalParticleSpeed={0.006}
        onRenderFramePre={(ctx: CanvasRenderingContext2D) => {
          for (const s of stars.current) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(200,210,255,${s.a})`;
            ctx.fill();
          }
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

          // glow
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 2.6);
          glow.addColorStop(0, hexToRgba(color, 0.55));
          glow.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 2.6, 0, 2 * Math.PI);
          ctx.fill();

          // core
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
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
          </div>

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
            {selected.kind} · {DOMAIN_META[selected.domain].label}
          </div>
          <h2>{selected.label}</h2>
          {selected.description && <div className="desc">{selected.description}</div>}
          <div className="stats">
            <div className="stat">
              <div className="v">{selected.stars ? `${selected.stars}k` : "—"}</div>
              <div className="l">Stars</div>
            </div>
            <div className="stat">
              <div className="v">{selected.pagerank?.toFixed(2) ?? "—"}</div>
              <div className="l">Centrality</div>
            </div>
            <div className="stat">
              <div className="v">{selected.createdAt}</div>
              <div className="l">Appeared</div>
            </div>
            <div className="stat">
              <div className="v">{selected.momentum != null ? `${Math.round(selected.momentum * 100)}` : "—"}</div>
              <div className="l">Momentum</div>
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
