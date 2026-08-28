// Typed API client for the Supply Chain Ontology server.
//
// Two modes:
//   - live (default): call the Express API on /api
//   - static (VITE_STATIC=1): read pre-baked JSON written by tools/bake_static.py,
//     for the public GitHub Pages build where there is no server and no Snowflake
//     credentials. Query strings are folded into the filename by the baker, so
//     the same call signatures work in both modes.
export const STATIC = import.meta.env.VITE_STATIC === "1";
const BASE = "/api";
const SNAP = `${import.meta.env.BASE_URL}data`;

/**
 * Mirror of the baker's filename rule: /products?a=1 -> products__a=1.json
 *
 * Percent-escapes are folded to "-": a literal "%3A" in a filename is decoded
 * back to ":" by the web server on the way in, so the request would never match
 * the file on disk. tools/bake_static.py applies the identical substitution.
 */
function snapshotName(pathname: string): string {
  const [p, q] = pathname.split("?");
  const stem = p.replace(/^\//, "").replace(/\//g, "_");
  if (!q) return `${stem}.json`;
  return `${stem}__${q.replace(/[^A-Za-z0-9=&._-]/g, "-")}.json`;
}

async function get<T>(pathname: string): Promise<T> {
  if (STATIC) {
    const res = await fetch(`${SNAP}/${snapshotName(pathname)}`);
    if (!res.ok) {
      throw new Error(
        "not in this snapshot — the public build ships a fixed set of views");
    }
    return res.json() as Promise<T>;
  }
  const res = await fetch(`${BASE}${pathname}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ProcessDef { code: string; name: string; color: string; products: number; }
export interface RoleDef { role: string; label: string; color: string; count: number; pct: number; }
export interface Meta {
  processes: ProcessDef[];
  lobs: string[];
  industries: string[];
  sources: string[];
  provenance: string[];
  roles: RoleDef[];
  role_label: Record<string, string>;
  role_color: Record<string, string>;
  totals: { products: number; mapped: number; entities: number; associations: number; cross_products: number; odm_links: number };
  overall: number;
}
export interface GraphOpts {
  processes?: string[]; lob?: string; search?: string; expand?: string | null; cross?: boolean;
  industry?: string; source?: string; provenance?: string;
}
export interface ProductRow { tech: string; label: string; process: string; entity_count: number; }

function gq(o: GraphOpts): string {
  const p = new URLSearchParams();
  if (o.processes && o.processes.length) p.set("processes", o.processes.join(","));
  if (o.lob && o.lob !== "All") p.set("lob", o.lob);
  if (o.industry && o.industry !== "All") p.set("industry", o.industry);
  if (o.source && o.source !== "All") p.set("source", o.source);
  if (o.provenance && o.provenance !== "All") p.set("provenance", o.provenance);
  if (o.search) p.set("search", o.search);
  if (o.expand) p.set("expand", o.expand);
  if (o.cross === false) p.set("cross", "false");
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function post<T>(pathname: string, body: unknown): Promise<T> {
  if (STATIC) {
    throw new Error(
      "Ask needs a live Snowflake connection and is disabled in the public build");
  }
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AskTurn { role: "user" | "analyst"; text: string; }
export interface AskResult {
  answer: string;
  sql: string | null;
  columns: string[];
  rows: unknown[][];
  suggestions: string[];
  rowCount: number;
  truncated: boolean;
}
export interface AskStatus { ok: boolean; missing: string[]; semantic_view: string; }


export interface TraverseNode {
  id: string; label: string; product: string; productLabel: string;
  process: string; role: string; elements: number; depth: number;
}
export interface TraverseEdge { source: string; target: string; crossProduct: boolean; }
export interface TraverseResult {
  seed: string; depth: number; nodes: TraverseNode[]; edges: TraverseEdge[];
  truncated: boolean; reachable: number;
}
export interface PathResult {
  from: string; to: string; hops: number | null;
  path: TraverseNode[]; edges: TraverseEdge[];
  crossesProducts?: number; reason?: string;
}
export interface HubRow extends TraverseNode { degree: number; }
export interface EntityRow {
  id: string; label: string; name: string; product: string;
  productLabel: string; role: string; elements: number;
}
export interface DemoInfo {
  stats: { products: number; entities: number; associations: number;
           crossProduct: number; linkedPairs: number; processes: number; odmLinks: number;
           scorecard: number | null };
  scope: { rule: string; parent_products: number; parent_entities: number } | null;
  semanticView: string;
}

export interface Topology {
  entities: { total: number; connected: number; isolated: number; components: number;
              largestComponent: number; componentSizes: number[];
              crossProductEdges: number; totalEdges: number };
  products: { total: number; inOdmGraph: number;
              hubs: { tech: string; label: string; degree: number }[];
              canonicalObjects: { canonical: string; links: number }[] };
}

export const api = {
  meta: () => get<Meta>("/meta"),
  graph: (o: GraphOpts) => get<{ elements: any[] }>(`/graph${gq(o)}`),
  products: (o: GraphOpts) => get<ProductRow[]>(`/products${gq({ ...o, expand: null, cross: undefined })}`),
  processes: () => get<any[]>("/processes"),
  correlation: () => get<any>("/correlation"),
  scorecard: () => get<any>("/scorecard"),
  coverage: () => get<any>("/coverage"),
  insightApps: () => get<any[]>("/insight-apps"),
  semanticRoles: () => get<any>("/semantic-roles"),
  lenses: () => get<any>("/lenses"),
  askStatus: () => get<AskStatus>("/ask/status"),
  askExamples: () => get<string[]>("/ask/examples"),
  ask: (history: AskTurn[]) => post<AskResult>("/ask", { history }),
  hubs: (limit = 25) => get<HubRow[]>(`/hubs?limit=${limit}`),
  entities: (q = "", limit = 400) =>
    get<EntityRow[]>(`/entities?q=${encodeURIComponent(q)}&limit=${limit}`),
  traverse: (seed: string, depth = 1, limit = 60) =>
    get<TraverseResult>(`/traverse?seed=${encodeURIComponent(seed)}&depth=${depth}&limit=${limit}`),
  path: (from: string, to: string) =>
    get<PathResult>(`/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  demo: () => get<DemoInfo>("/demo"),
  topology: () => get<Topology>("/topology"),
};
