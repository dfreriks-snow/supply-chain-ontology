import { useEffect, useMemo, useRef, useState } from "react";
import {
  edgeWidth, hopColor, money, severityColor, TYPE_COLOR,
} from "../lib/severity";
import type { AffectedFlow, ImpairedNode, Reroute, ScFlow, ScNode } from "../lib/api";

/**
 * Geographic view of the network and a disruption's ripple.
 *
 * Hand-rolled SVG rather than a mapping library: 19 pins and 27 arcs over a
 * static 68 KB land outline does not justify a tile layer, a projection library
 * or a WebGL context, and hand-rolling keeps the arc geometry under our control
 * for the reroute overlay.
 *
 * Flows are drawn as quadratic Bezier arcs with the control point pushed
 * perpendicular to the chord. Straight lines between 19 nodes overlap badly —
 * San Jose sits on three near-collinear lanes — and the perpendicular offset
 * separates them without changing which endpoints they connect.
 */

export interface MapProps {
  nodes: ScNode[];
  flows: ScFlow[];
  affected?: Map<string, AffectedFlow>;
  impaired?: Map<string, ImpairedNode>;
  reroutes?: Reroute[];
  /** Hops revealed so far; undefined means show everything. */
  revealHop?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  height?: number;
}

const W = 1000;
const H = 500;
/** Trim the poles: nothing in this network is above 60N and the empty band wastes half the frame. */
const LAT_TOP = 78;
const LAT_BOTTOM = -58;

/** Equirectangular. Adequate at world scale and trivially invertible for hit-testing. */
function project(lon: number, lat: number): [number, number] {
  const x = ((lon + 180) / 360) * W;
  const y = ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;
  return [x, y];
}

function arcPath(x1: number, y1: number, x2: number, y2: number, lift = 0.22): string {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular offset, scaled by chord length so short lanes stay flat
  const nx = -dy / len, ny = dx / len;
  const k = len * lift;
  return `M${x1},${y1} Q${mx + nx * k},${my + ny * k} ${x2},${y2}`;
}

export function WorldMap({
  nodes, flows, affected, impaired, reroutes,
  revealHop, selected, onSelect, height = 460,
}: MapProps) {
  const [land, setLand] = useState<number[][][][] | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    fetch(`${import.meta.env.BASE_URL}land.geo.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (dead || !g) return;
        setLand(g.features?.[0]?.geometry?.coordinates ?? null);
      })
      .catch(() => { /* graticule-only fallback is acceptable */ });
    return () => { dead = true; };
  }, []);

  const maxVol = useMemo(
    () => Math.max(1, ...flows.map((f) => f.monthly_volume)), [flows]);

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.node_id, n])), [nodes]);

  const landPath = useMemo(() => {
    if (!land) return "";
    const parts: string[] = [];
    for (const poly of land) {
      for (const ring of poly) {
        if (ring.length < 4) continue;
        const pts = ring.map(([lon, lat]) => project(lon, lat));
        parts.push("M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z");
      }
    }
    return parts.join(" ");
  }, [land]);

  const rerouteArcs = useMemo(() => {
    if (!reroutes?.length) return [];
    const byName = new Map(nodes.map((n) => [n.node_name, n]));
    return reroutes.map((r) => {
      const from = byName.get(r.toPlant);          // the plant taking the work
      const to = byName.get(r.customer);
      if (!from || !to) return null;
      const [x1, y1] = project(from.longitude, from.latitude);
      const [x2, y2] = project(to.longitude, to.latitude);
      return { r, d: arcPath(x1, y1, x2, y2, -0.3) };
    }).filter(Boolean) as { r: Reroute; d: string }[];
  }, [reroutes, nodes]);

  const show = (hop: number) => revealHop === undefined || hop <= revealHop;

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }}
           className="rounded-lg bg-slate-900">
        {/* graticule: cheap orientation cues, and the fallback if land fails to load */}
        <g stroke="#1e293b" strokeWidth={0.6}>
          {[-40, -20, 0, 20, 40, 60].map((lat) => {
            const [, y] = project(0, lat);
            return <line key={lat} x1={0} y1={y} x2={W} y2={y} />;
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const [x] = project(lon, 0);
            return <line key={lon} x1={x} y1={0} x2={x} y2={H} />;
          })}
        </g>

        {landPath && <path d={landPath} fill="#243244" stroke="#31445c" strokeWidth={0.5} />}

        {/* baseline flows: thickness = volume, so structural importance reads even
            where there is no disruption at all */}
        <g fill="none">
          {flows.map((f) => {
            const a = affected?.get(f.flow_id);
            const visible = !a || show(a.hop);
            const [x1, y1] = project(f.source_lon, f.source_lat);
            const [x2, y2] = project(f.target_lon, f.target_lat);
            const w = edgeWidth(f.monthly_volume, maxVol, 0.8, 5);
            const hit = a && visible;
            return (
              <path key={f.flow_id} d={arcPath(x1, y1, x2, y2)}
                stroke={hit ? severityColor(a!.impactFactor) : "#475569"}
                strokeWidth={hit ? w + 1.2 : w}
                strokeOpacity={hit ? 0.95 : 0.34}
                strokeDasharray={hit ? undefined : undefined}
                onMouseEnter={(e) => {
                  const r = wrapRef.current?.getBoundingClientRect();
                  setHover({
                    x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0),
                    lines: [
                      `${f.source_name} → ${f.target_name}`,
                      `${f.material_category} · ${f.monthly_volume} units/mo · ${money(f.monthly_value)}/mo`,
                      ...(hit ? [`${Math.round(a!.impactFactor * 100)}% lost · ${money(a!.valueAtRisk)} at risk · hop ${a!.hop}`] : []),
                    ],
                  });
                }}
                onMouseLeave={() => setHover(null)} />
            );
          })}
        </g>

        {/* reroute overlay: dashed and blue, so a proposed lane can never be
            mistaken for one that already exists */}
        <g fill="none">
          {rerouteArcs.map(({ r, d }) => (
            <path key={`rr-${r.flow_id}`} d={d} stroke="#38bdf8" strokeWidth={2.4}
              strokeDasharray="7 5" strokeOpacity={0.95}
              onMouseEnter={(e) => {
                const b = wrapRef.current?.getBoundingClientRect();
                setHover({
                  x: e.clientX - (b?.left ?? 0), y: e.clientY - (b?.top ?? 0),
                  lines: [
                    `REROUTE · ${r.material_category}`,
                    `${r.toPlant} → ${r.customer} (was ${r.fromPlant})`,
                    `${r.unitsMoved} units/mo · ${r.hrsRequired}h · protects ${money(r.valueProtected)}`,
                    ...(r.distanceDeltaKm != null
                      ? [`${r.distanceDeltaKm >= 0 ? "+" : ""}${r.distanceDeltaKm.toLocaleString()} km to ship`]
                      : []),
                  ],
                });
              }}
              onMouseLeave={() => setHover(null)} />
          ))}
        </g>

        {/* nodes */}
        <g>
          {nodes.map((n) => {
            const imp = impaired?.get(n.node_id);
            const visible = !imp || show(imp.hop);
            const [x, y] = project(n.longitude, n.latitude);
            const isPlant = n.node_type === "Plant";
            const r = isPlant ? 9 : 6.5;
            const sev = imp && visible ? imp.impairment : 0;
            const isSel = selected === n.node_id;
            return (
              <g key={n.node_id} style={{ cursor: "pointer" }}
                 onClick={() => onSelect?.(isSel ? null : n.node_id)}
                 onMouseEnter={(e) => {
                   const b = wrapRef.current?.getBoundingClientRect();
                   setHover({
                     x: e.clientX - (b?.left ?? 0), y: e.clientY - (b?.top ?? 0),
                     lines: [
                       `${n.node_name} · ${n.node_type}`,
                       `${n.city}, ${n.country}`,
                       ...(imp && visible
                         ? [`${Math.round(imp.impairment * 100)}% impaired · hop ${imp.hop}`,
                            imp.bufferDays != null
                              ? `${imp.bufferDays}d buffer · exposed ${imp.daysExposed}d` : "",
                            imp.causedBy ? `via ${imp.causedBy}` : ""].filter(Boolean)
                         : []),
                     ],
                   });
                 }}
                 onMouseLeave={() => setHover(null)}>
                {/* hop ring: pulses out from the origin so the cascade reads as
                    distance from the event, not just as colour */}
                {imp && visible && (
                  <circle cx={x} cy={y} r={r + 7 + imp.hop * 3}
                    fill="none" stroke={hopColor(imp.hop)} strokeWidth={1.6}
                    strokeOpacity={0.55} />
                )}
                {isSel && (
                  <circle cx={x} cy={y} r={r + 13} fill="none"
                          stroke="#e2e8f0" strokeWidth={1.2} strokeDasharray="3 3" />
                )}
                {isPlant ? (
                  <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2}
                    fill={sev > 0 ? severityColor(sev) : TYPE_COLOR.Plant}
                    stroke="#e2e8f0" strokeWidth={1.3} />
                ) : (
                  <circle cx={x} cy={y} r={r}
                    fill={sev > 0 ? severityColor(sev) : TYPE_COLOR[n.node_type]}
                    stroke="#e2e8f0" strokeWidth={1.2} />
                )}
                <text x={x} y={y - r - 5} textAnchor="middle"
                      fontSize={9.5} fill="#cbd5e1" style={{ pointerEvents: "none" }}>
                  {n.node_name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5" style={{ background: TYPE_COLOR.Plant }} /> plant
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR.Supplier }} /> supplier
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR.Customer }} /> customer
        </span>
        <span className="flex items-center gap-1">
          <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#38bdf8" strokeWidth="2.4" strokeDasharray="7 5" /></svg>
          reroute
        </span>
        <span>line thickness = monthly volume · colour = share lost</span>
      </div>

      {hover && (
        <div className="pointer-events-none absolute z-20 max-w-xs rounded bg-slate-900/95 px-2.5 py-1.5
                        text-[11px] leading-snug text-slate-100 shadow-lg ring-1 ring-white/10"
             style={{ left: Math.min(hover.x + 12, 620), top: hover.y + 12 }}>
          {hover.lines.map((l, i) => (
            <div key={i} className={i === 0 ? "font-semibold" : "text-slate-300"}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
