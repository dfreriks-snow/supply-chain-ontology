import { useState } from "react";
import { useQuery } from "../hooks/useQuery";
import { api } from "../lib/api";

/**
 * Guided walkthrough adapted from the AI309 Summit deck
 * ("Enterprise Supply Chain Ontology Agent").
 *
 * The deck's argument is kept — fragmented source systems, an ontology that
 * unifies them, then agent reasoning on top. The figures are read live from
 * /api/demo rather than transcribed from the slides, so the walkthrough cannot
 * quote numbers that have drifted from the ontology the app is serving.
 */

interface Step {
  id: string;
  kicker: string;
  title: string;
  body: string;
  bullets?: { head: string; text: string }[];
  // rendered as the "before" panel on the problem step
  systems?: { name: string; tables: string }[];
  punch?: string;
}

const STEPS: Step[] = [
  {
    id: "problem",
    kicker: "The problem",
    title: "Same object. Many systems. No links between them.",
    body:
      "A supply chain does not live in one place. The material master sits in S/4HANA, " +
      "the supplier profile in Ariba, the sensor feed and risk score outside SAP entirely. " +
      "Each system names the same real-world object differently, and nothing declares how " +
      "they relate.",
    systems: [
      { name: "SAP S/4HANA", tables: "Material, Bill of Material, Plant, Production Order" },
      { name: "SAP Ariba", tables: "Supplier Profiles, Contracts, Sourcing Events" },
      { name: "Third party", tables: "Risk Scores, IoT Telemetry" },
    ],
    punch: "Same supplier. Three systems. Three different IDs. No links between them.",
  },
  {
    id: "products",
    kicker: "Step 1 — the catalog",
    title: "SAP BDC publishes the supply chain as governed data products",
    body:
      "Business Data Cloud ships the supply chain as data products, each one a set of CDS " +
      "entities with declared associations and semantic annotations. That declaration is the " +
      "raw material for an ontology: the relationships are already in the metadata, not " +
      "reverse-engineered from column names.",
    bullets: [
      { head: "Design to Operate", text: "the core plan-make-deliver chain" },
      { head: "Source to Pay", text: "supplier, contract and procurement context" },
      { head: "Lead to Cash", text: "the demand signal that drives the chain" },
    ],
  },
  {
    id: "ontology",
    kicker: "Step 2 — the ontology",
    title: "Entities, associations and semantic roles become queryable data",
    body:
      "Every CDS entity is classified by the role it plays — fact, dimension, text, hierarchy, " +
      "value help — and every association becomes an edge. Associations that cross a data " +
      "product boundary matter most: those are the joins nobody documented, and they are what " +
      "makes the catalog a graph rather than a list.",
    bullets: [
      { head: "Semantic roles", text: "what each entity is for, not just what it contains" },
      { head: "Cross-product edges", text: "the undocumented joins between data products" },
      { head: "Canonical objects", text: "the shared master-data spine (ODM)" },
    ],
  },
  {
    id: "traverse",
    kicker: "Step 3 — traversal",
    title: "Follow the graph instead of hard-coding joins",
    body:
      "Once relationships are data, you can walk them. Expand an entity to see its " +
      "neighbourhood, or ask for the shortest association path between two entities and watch " +
      "it cross data product boundaries. A flat table cannot answer \"what is connected to " +
      "this, and how far away\".",
    bullets: [
      { head: "Expansion", text: "breadth-first from any entity, one to four hops" },
      { head: "Shortest path", text: "how two entities connect, and through which products" },
      { head: "Components", text: "where the graph is genuinely disconnected" },
    ],
  },
  {
    id: "agent",
    kicker: "Step 4 — the agent",
    title: "Not a chatbot — a reasoning layer over the ontology",
    body:
      "The same ontology is exposed to Cortex Analyst as a semantic view. Questions are " +
      "answered in SQL against governed metrics, and the generated SQL is shown, so the " +
      "answer is auditable rather than asserted.",
    bullets: [
      { head: "Governed metrics", text: "counts and coverage defined once, not per question" },
      { head: "SQL you can read", text: "every answer shows the query that produced it" },
      { head: "Scoped", text: "the model only sees the supply-chain slice" },
    ],
  },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

export default function Demo() {
  const [i, setI] = useState(0);
  const d = useQuery(() => api.demo(), []);
  const s = STEPS[i];
  const st = d.data?.stats;

  return (
    <div className="space-y-5">
      {/* live figures, straight from the ontology being served */}
      <div className="grid grid-cols-6 gap-3">
        <Stat label="Data products" value={st?.products ?? "—"} />
        <Stat label="CDS entities" value={st?.entities ?? "—"} />
        <Stat label="Associations" value={st?.associations ?? "—"} />
        <Stat label="Cross-product assoc" value={st?.crossProduct ?? "—"} />
        <Stat label="Linked pairs" value={st?.linkedPairs ?? "—"} />
        <Stat label="Readiness" value={st?.scorecard != null ? `${st.scorecard}%` : "—"} />
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((x, n) => (
          <button key={x.id} onClick={() => setI(n)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition
              ${n === i ? "bg-sky-600 text-white"
                        : n < i ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
            {x.kicker}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-600">
          {s.kicker}
        </div>
        <h2 className="mt-1 text-xl font-bold text-slate-800">{s.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{s.body}</p>

        {s.systems && (
          <div className="mt-5 grid grid-cols-3 gap-3">
            {s.systems.map((x) => (
              <div key={x.name} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-700">{x.name}</div>
                <div className="mt-1 text-xs text-slate-500">{x.tables}</div>
              </div>
            ))}
          </div>
        )}
        {s.punch && (
          <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {s.punch}
          </div>
        )}

        {s.bullets && (
          <div className="mt-5 grid grid-cols-3 gap-4">
            {s.bullets.map((b) => (
              <div key={b.head} className="rounded-lg bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-700">{b.head}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500">{b.text}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4">
          <button disabled={i === 0} onClick={() => setI(i - 1)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-slate-600
                       disabled:opacity-40 hover:bg-slate-50">
            Back
          </button>
          <button disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white
                       disabled:opacity-40 hover:bg-sky-700">
            Next
          </button>
          <span className="ml-auto text-xs text-slate-400">
            {i + 1} of {STEPS.length}
          </span>
        </div>
      </div>

      {/* scope note: this app is a slice, and saying so avoids the impression
          that 36 products is the whole BDC catalog */}
      {d.data?.scope && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Scope.</span>{" "}
          {st?.products} of {d.data.scope.parent_products} SAP BDC data products and{" "}
          {st?.entities} of {d.data.scope.parent_entities} CDS entities are in scope here.
          Selection rule: {d.data.scope.rule}.
          {d.data.semanticView && (
            <> Cortex Analyst is grounded on <code className="text-slate-600">{d.data.semanticView}</code>.</>
          )}
        </div>
      )}
    </div>
  );
}
