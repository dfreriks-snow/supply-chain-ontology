import { Router } from "express";
import { loadOntology, buildGraph } from "../services/ontology.js";
import { ask, askConfigured, semanticView } from "../services/analyst.js";
import { traverse, shortestPath, hubs, topology } from "../services/traverse.js";

export const apiRouter = Router();

// the sync `wrap` below cannot catch a rejected promise, so async handlers need
// their own wrapper or a Cortex failure surfaces as an unhandled rejection and
// the request hangs instead of returning an error
function wrapAsync(handler: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any) => {
    handler(req, res).catch((e: any) =>
      res.status(500).json({
        error: String(e?.message || e),
        // present when Cortex Analyst produced SQL that failed to execute
        sql: e?.generatedSql ?? null,
      })
    );
  };
}

function wrap(handler: (req: any, res: any) => void) {
  return (req: any, res: any) => {
    try {
      handler(req, res);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  };
}

apiRouter.get("/api/health", (_req, res) => res.json({ ok: true }));

apiRouter.get("/api/meta", wrap((_req, res) => {
  const ont = loadOntology();
  const procCounts = ont.processes.map((p) => ({
    ...p,
    products: Object.values(ont.products).filter((x) => x.process === p.code).length,
  }));
  res.json({
    processes: procCounts,
    lobs: Array.from(new Set(Object.values(ont.products).map((p) => p.lob))).sort(),
    industries: ont.lens_summary.industries.map(([n]) => n),
    sources: ont.lens_summary.source_systems.map(([n]) => n),
    provenance: ont.lens_summary.provenance.map(([n]) => n),
    roles: ont.semantic_roles,
    role_label: ont.role_label,
    role_color: ont.role_color,
    totals: ont.scorecard.totals,
    overall: ont.scorecard.overall,
  });
}));

apiRouter.get("/api/graph", wrap((req, res) => {
  const ont = loadOntology();
  const q = req.query;
  const processes = q.processes ? String(q.processes).split(",").filter(Boolean) : undefined;
  const elements = buildGraph(ont, {
    processes,
    lob: q.lob ? String(q.lob) : undefined,
    search: q.search ? String(q.search) : undefined,
    expand: q.expand ? String(q.expand) : null,
    cross: q.cross !== "false",
    industry: q.industry ? String(q.industry) : undefined,
    source: q.source ? String(q.source) : undefined,
    provenance: q.provenance ? String(q.provenance) : undefined,
  });
  res.json({ elements });
}));

apiRouter.get("/api/products", wrap((req, res) => {
  const ont = loadOntology();
  const q = req.query;
  const procSet = q.processes ? new Set(String(q.processes).split(",").filter(Boolean)) : null;
  const lob = q.lob && q.lob !== "All" ? String(q.lob) : null;
  const industry = q.industry && q.industry !== "All" ? String(q.industry) : null;
  const source = q.source && q.source !== "All" ? String(q.source) : null;
  const provenance = q.provenance && q.provenance !== "All" ? String(q.provenance) : null;
  const search = q.search ? String(q.search).toLowerCase() : "";
  const rows = Object.entries(ont.products)
    .filter(([tech, p]) =>
      (!procSet || procSet.has(p.process)) &&
      (!lob || p.lob === lob) &&
      (!industry || p.industries.includes(industry)) &&
      (!source || p.source_systems.includes(source)) &&
      (!provenance || p.provenance === provenance) &&
      (!search || p.label.toLowerCase().includes(search) || tech.toLowerCase().includes(search)))
    .map(([tech, p]) => ({ tech, label: p.label, process: p.process, entity_count: p.entity_count }))
    .sort((a, b) => a.label.localeCompare(b.label));
  res.json(rows);
}));

apiRouter.get("/api/processes", wrap((_req, res) => res.json(loadOntology().rollup)));

apiRouter.get("/api/correlation", wrap((_req, res) => {
  const ont = loadOntology();
  res.json({
    ...ont.correlation,
    product_pairs: Object.keys(ont.product_pairs).length,
    odm_links: ont.odm_edges.length,
    process_name: Object.fromEntries(ont.processes.map((p) => [p.code, p.name])),
    process_color: Object.fromEntries(ont.processes.map((p) => [p.code, p.color])),
  });
}));

apiRouter.get("/api/scorecard", wrap((_req, res) => {
  const ont = loadOntology();
  res.json({ ...ont.scorecard, rollup: ont.rollup, processes: ont.processes });
}));

apiRouter.get("/api/coverage", wrap((_req, res) => {
  const ont = loadOntology();
  const gaps = Object.values(ont.products)
    .filter((p) => !p.has_semantic)
    .sort((a, b) => b.entity_count - a.entity_count)
    .map((p) => ({ label: p.label, process: p.process, lob: p.lob, entity_count: p.entity_count }));
  res.json({
    rollup: ont.rollup, gaps,
    process_name: Object.fromEntries(ont.processes.map((p) => [p.code, p.name])),
    totals: ont.scorecard.totals,
  });
}));

apiRouter.get("/api/insight-apps", wrap((_req, res) => res.json(loadOntology().insight_apps)));

apiRouter.get("/api/semantic-roles", wrap((_req, res) => {
  const ont = loadOntology();
  // role distribution per process for a small stacked view
  const byProcess: Record<string, Record<string, number>> = {};
  for (const e of Object.values(ont.entities)) {
    (byProcess[e.process] ??= {});
    byProcess[e.process][e.role] = (byProcess[e.process][e.role] || 0) + 1;
  }
  res.json({ roles: ont.semantic_roles, byProcess,
    role_label: ont.role_label, role_color: ont.role_color,
    process_name: Object.fromEntries(ont.processes.map((p) => [p.code, p.name])) });
}));

apiRouter.get("/api/lenses", wrap((_req, res) => res.json(loadOntology().lens_summary)));

// --------------------------------------------------------------------------
// Cortex Analyst — ask questions of the ontology in natural language
// --------------------------------------------------------------------------
apiRouter.get("/api/ask/status", wrap((_req, res) => {
  const cfg = askConfigured();
  res.json({ ...cfg, semantic_view: semanticView });
}));

apiRouter.post("/api/ask", wrapAsync(async (req, res) => {
  const cfg = askConfigured();
  if (!cfg.ok) {
    res.status(503).json({
      error: `Cortex Analyst is not configured. Missing: ${cfg.missing.join(", ")}`,
    });
    return;
  }
  const body = req.body ?? {};
  // accept either a single question or a full turn history for follow-ups
  const history = Array.isArray(body.history) && body.history.length
    ? body.history
    : [{ role: "user", text: String(body.question ?? "").trim() }];
  if (!history[history.length - 1]?.text) {
    res.status(400).json({ error: "question is required" });
    return;
  }
  res.json(await ask(history));
}));

apiRouter.get("/api/ask/examples", wrap((_req, res) => {
  // Supply-chain phrasing, and only questions this model can actually answer.
  // The parent app offered "how many associations cross data product
  // boundaries?" — here that is always 0, so asking it teaches the wrong thing.
  res.json([
    "How many supply chain data products are in each business process?",
    "How many supply chain data products per line of business?",
    "Which supply chain data products have the most entities?",
    "What entities are in the Bill of Material data product?",
    "What is the breakdown of supply chain entities by semantic role?",
    "Which canonical objects link supply chain data products together?",
    "Give me the supply chain coverage summary by process",
    "Which supply chain products relate to manufacturing?",
    "Which data products belong to Design to Operate?",
    "What is the average number of elements per entity by process?",
    "Which supply chain products have the most cross-product associations?",
    "How many supply chain products come from S/4HANA?",
  ]);
}));

// ---- graph traversal -------------------------------------------------------

// Entities ranked by association degree: the useful entry points, since picking
// a random entity in a 338-node graph usually lands on a leaf with one edge.
apiRouter.get("/api/hubs", wrap((req, res) => {
  res.json(hubs(Math.min(Number(req.query.limit) || 25, 100)));
}));

apiRouter.get("/api/topology", wrap((_req, res) => res.json(topology())));

apiRouter.get("/api/traverse", wrap((req, res) => {
  const seed = String(req.query.seed || "");
  if (!seed) return res.status(400).json({ error: "seed is required" });
  const out = traverse(
    seed,
    Math.min(Math.max(Number(req.query.depth) || 1, 1), 4),
    Math.min(Math.max(Number(req.query.limit) || 60, 5), 300),
  );
  if ((out as any).error) return res.status(404).json(out);
  res.json(out);
}));

apiRouter.get("/api/path", wrap((req, res) => {
  const from = String(req.query.from || ""), to = String(req.query.to || "");
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });
  const out = shortestPath(from, to);
  if ((out as any).error) return res.status(404).json(out);
  res.json(out);
}));

// Flat entity list for the traversal pickers.
apiRouter.get("/api/entities", wrap((req, res) => {
  const ont = loadOntology();
  const q = String(req.query.q || "").toLowerCase();
  const rows = Object.entries(ont.entities as any).map(([id, e]: any) => ({
    id, label: e.label || e.name, name: e.name, product: e.tech,
    productLabel: (ont.products as any)[e.tech]?.label || e.tech,
    role: e.role, elements: e.element_count ?? 0,
  }));
  const hit = q
    ? rows.filter((r) => r.label?.toLowerCase().includes(q) ||
                         r.name?.toLowerCase().includes(q) ||
                         r.productLabel?.toLowerCase().includes(q))
    : rows;
  res.json(hit.slice(0, Number(req.query.limit) || 400));
}));

// Narrative + live figures for the guided demo page. Counts come from the
// ontology rather than the deck so the walkthrough cannot quote stale numbers.
apiRouter.get("/api/demo", wrap((_req, res) => {
  const ont = loadOntology();
  const products = Object.values(ont.products as any);
  res.json({
    stats: {
      products: products.length,
      entities: Object.keys(ont.entities as any).length,
      associations: ont.entity_edges.length,
      // EntityEdge.cross_product is never set true in the source ontology, so
      // the cross-product signal comes from the per-product counter and the
      // ODM overlay instead
      crossProduct: products.reduce(
        (n: number, p: any) => n + (p.cross_product_assoc || 0), 0),
      linkedPairs: Object.keys(ont.product_pairs).length,
      processes: ont.processes.length,
      odmLinks: ont.odm_edges.length,
      scorecard: (ont as any).scorecard?.overall ?? null,
    },
    scope: (ont as any).scope ?? null,
    semanticView,
  });
}));
