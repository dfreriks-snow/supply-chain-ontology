/**
 * The ontology SCHEMA layer: classes and relations, not instances.
 *
 * This is deliberately separate from ontology.ts, which serves the SAP BDC
 * catalog (data products and CDS entities). The two answer different questions:
 *
 *   ontology.ts        what data exists          -> Process, Product, CDSEntity
 *   ontologySchema.ts  what kinds of thing exist -> Party, Facility, MaterialFlow
 *
 * Conflating them is the problem this module exists to fix. A catalog cannot
 * tell you that a Supplier and a Customer are both Parties, so it cannot answer
 * "which parties are affected" in one pass. The class layer can.
 *
 * Source: SAP_SUPPLY_CHAIN.ONTOLOGY, exported by tools/export_ontology_schema.py.
 * Read from JSON rather than queried live because tools/bake_static.py builds a
 * credential-free static site.
 */

import fs from "fs";
import path from "path";

export interface ClassSource {
  database: string; schema: string; table: string;
  filter_col: string | null; filter_val: string | null;
}

export interface OntClass {
  name: string;
  parent: string | null;
  is_abstract: boolean;
  description: string | null;
  depth: number | null;
  descendants: number | null;
  instances: number;
  source: ClassSource | null;
}

export interface OntRelation {
  name: string;
  domain: string;
  range: string;
  cardinality: string | null;
  is_hierarchical: boolean;
  is_transitive: boolean;
  inverse: string | null;
  description: string | null;
  is_stored: boolean;
  is_inferred: boolean;
  is_abstract: boolean;
  rule: { id: string; kind: string; enabled: boolean; edges: number } | null;
}

export interface AbstractRollup {
  view: string;
  total: number;
  breakdown: { type: string; count: number }[];
}

export interface StackLayer {
  layer: string; name: string; detail: string; note: string; objects: number;
}

export interface OntologySchema {
  ontology: string;
  source: string;
  stack: StackLayer[];
  classes: OntClass[];
  relations: OntRelation[];
  subclass_of: { child: string; parent: string }[];
  abstract_rollup: Record<string, AbstractRollup>;
  descendants: { root: string; descendant: string; depth: number; path: string }[];
  ancestors: { start: string; ancestor: string; depth: number }[];
  properties: Record<string, { name: string; type: string; required: boolean }[]>;
  counts: Record<string, number>;
}

const DATA_FILE = path.resolve(import.meta.dirname, "../../../data/sc_ontology_schema.json");

let _cache: OntologySchema | null = null;

export function loadSchema(): OntologySchema {
  if (_cache) return _cache;
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(
      `Ontology schema not found at ${DATA_FILE}. Run: python3 tools/export_ontology_schema.py`,
    );
  }
  _cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as OntologySchema;
  return _cache;
}

export type ClassMode = "abstract" | "concrete" | "both";

/** Colour by branch, so the two halves of the ontology read apart at a glance. */
function branchColor(sch: OntologySchema, name: string): string {
  // Walk up to the branch directly beneath Entity.
  const byName = new Map(sch.classes.map((c) => [c.name, c]));
  let cur = byName.get(name);
  const seen = new Set<string>();
  while (cur?.parent && cur.parent !== "Entity" && !seen.has(cur.name)) {
    seen.add(cur.name);
    cur = byName.get(cur.parent);
  }
  const branch = cur?.parent === "Entity" ? cur.name : name;
  switch (branch) {
    case "Party":            return "#29B5E8";  // Snowflake blue
    case "Facility":         return "#1B3A57";  // SAP navy
    case "MaterialFlow":     return "#0ea5e9";
    case "MaterialCategory": return "#14b8a6";
    case "CatalogObject":    return "#94a3b8";  // grey: metadata, not domain
    default:                 return "#475569";  // Entity itself
  }
}

/**
 * Size a class node. Abstract classes have no instances of their own, so they
 * are sized by the subtree beneath them; concrete classes by their own count.
 * Both go through sqrt because CDSEntity (2,243) would otherwise dwarf
 * everything else into invisibility.
 */
function csize(sch: OntologySchema, c: OntClass): number {
  const n = c.is_abstract
    ? (sch.abstract_rollup[c.name]?.total ?? c.descendants ?? 1)
    : c.instances;
  return Math.round(Math.min(78, 34 + Math.sqrt(Math.max(n, 1)) * 1.1) * 10) / 10;
}

export function buildClassGraph(sch: OntologySchema, mode: ClassMode): any[] {
  const keep = (c: OntClass) =>
    mode === "both" || (mode === "abstract" ? c.is_abstract : !c.is_abstract);

  const kept = sch.classes.filter(keep);
  const keptNames = new Set(kept.map((c) => c.name));

  const nodes = kept.map((c) => {
    const rollup = sch.abstract_rollup[c.name];
    const sub: string[] = [];
    sub.push(c.is_abstract ? "Abstract class" : "Concrete class");
    if (c.description) sub.push(c.description);
    if (c.is_abstract && rollup) {
      sub.push(
        `${rollup.total} instances across ${rollup.breakdown.length} type(s):<br>` +
        rollup.breakdown.map((b) => `&nbsp;&nbsp;${b.type} ${b.count}`).join("<br>"),
      );
    } else if (!c.is_abstract) {
      sub.push(`${c.instances} instances`);
      if (c.source) {
        sub.push(
          `source: ${c.source.table}` +
          (c.source.filter_col ? ` where ${c.source.filter_col} = ${c.source.filter_val}` : ""),
        );
      }
    }
    const props = sch.properties[c.name];
    if (props?.length) sub.push(`${props.length} declared propert${props.length === 1 ? "y" : "ies"}`);

    return {
      data: {
        id: `cls::${c.name}`,
        label: c.name,
        processColor: branchColor(sch, c.name),
        size: csize(sch, c),
        kind: "class",
        abstract: c.is_abstract,
        instances: c.instances,
        depth: c.depth,
        sub: sub.join("<br>"),
      },
    };
  });

  const edges: any[] = [];

  // subClassOf spine. In "concrete" mode the abstract parents are filtered out,
  // which would leave the concrete classes as disconnected islands; that is the
  // honest picture, since without the abstract layer there is nothing joining
  // a Supplier to a Customer.
  for (const e of sch.subclass_of) {
    if (!keptNames.has(e.child) || !keptNames.has(e.parent)) continue;
    edges.push({
      data: {
        id: `sub::${e.child}->${e.parent}`,
        source: `cls::${e.child}`, target: `cls::${e.parent}`,
        kind: "subClassOf", weight: 2,
      },
    });
  }

  // Relations between kept classes.
  for (const r of sch.relations) {
    if (!keptNames.has(r.domain) || !keptNames.has(r.range)) continue;
    edges.push({
      data: {
        id: `rel::${r.name}::${r.domain}->${r.range}`,
        source: `cls::${r.domain}`, target: `cls::${r.range}`,
        label: r.name, kind: "relation", weight: 1,
        inferred: r.is_inferred, abstract: r.is_abstract,
      },
    });
  }

  return [...nodes, ...edges];
}

export interface ClassDetail {
  cls: OntClass;
  children: OntClass[];
  ancestors: { ancestor: string; depth: number }[];
  descendants: { descendant: string; depth: number; path: string }[];
  properties: { name: string; type: string; required: boolean }[];
  relations_out: OntRelation[];
  relations_in: OntRelation[];
  rollup: AbstractRollup | null;
}

export function classDetail(sch: OntologySchema, name: string): ClassDetail | null {
  const cls = sch.classes.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!cls) return null;
  return {
    cls,
    children: sch.classes.filter((c) => c.parent === cls.name),
    ancestors: sch.ancestors
      .filter((a) => a.start === cls.name)
      .map(({ ancestor, depth }) => ({ ancestor, depth }))
      .sort((a, b) => a.depth - b.depth),
    descendants: sch.descendants
      .filter((d) => d.root === cls.name && d.descendant !== cls.name)
      .map(({ descendant, depth, path }) => ({ descendant, depth, path }))
      .sort((a, b) => a.depth - b.depth || a.descendant.localeCompare(b.descendant)),
    properties: sch.properties[cls.name] ?? [],
    relations_out: sch.relations.filter((r) => r.domain === cls.name),
    relations_in: sch.relations.filter((r) => r.range === cls.name),
    rollup: sch.abstract_rollup[cls.name] ?? null,
  };
}
