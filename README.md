# Supply Chain Ontology

An ontology explorer for the **supply-chain slice of the SAP Business Data Cloud
catalog**: 36 data products, 338 CDS entities and 281 declared associations
across Design to Operate, Source to Pay and Lead to Cash.

Explore the graph, traverse associations, review coverage, and ask questions in
natural language through Cortex Analyst.

```
 36 data products   338 CDS entities   281 associations
  3 processes        19 ODM links       96% readiness
```

---

## Quick start

```bash
npm install
npm run dev          # API :3009, client :5179
```

Open <http://localhost:5179>. Eight of the nine pages work immediately from the
committed `data/sc_ontology.json` — **no Snowflake connection required**.

Only *Ask the Ontology* needs credentials:

```bash
cp server/.env.example server/.env    # fill in account, user, key path
```

---

## Documentation

| | |
|---|---|
[1. Concepts](docs/01-concepts.md) | What an ontology is here, semantic roles, the ODM overlay, the scope rule |
[2. Architecture](docs/02-architecture.md) | Data flow, Snowflake objects, the app, the two run modes |
[3. Build steps](docs/03-build-steps.md) | The sequence actually followed, with verification at each checkpoint |
[4. Execution](docs/04-execution.md) | Running, refreshing, publishing, troubleshooting |
[5. Findings](docs/05-findings.md) | What was not obvious and cost real time — **read before editing the semantic view** |
[6. References](docs/06-references.md) | What each source repo contributed, and where the boundaries sit |

---

## Pages

| Page | Shows |
|---|---|
Overview | Portfolio totals; lenses by source system, industry, provenance |
Ontology Graph | Process → data product → entity, filterable and expandable |
Graph Traversal | Breadth-first expansion and shortest association path |
Business Processes | Per-process rollups and members |
Use Cases | Mapping to BDC Intelligent Applications |
Correlation | Process coupling via the ODM overlay |
Coverage & Scorecard | Readiness scoring across the slice |
Ask the Ontology | Cortex Analyst over the supply-chain semantic view |
Guided Demo | Five-step walkthrough, figures read live from the ontology |

---

## What this is, and is not

This models **metadata about SAP data products** — which entities exist, how they
are annotated, how they associate.

It is **not transactional supply chain data**. There are no shipments, inventory
levels, purchase orders or supplier risk scores. "Which supplier is late" cannot
be answered here, and the semantic view says so explicitly so Cortex Analyst does
not try. See [references](docs/06-references.md#boundaries-in-one-table) for
which repo answers which question.

---

## Two things worth knowing before demoing

Both are measured, and both are stated on screen rather than hidden:

**The association graph does not cross product boundaries.** All 281 associations
stay inside their own data product, so an entity-level path never leaves the
product it starts in. The 269 connected entities form **94 separate components**
(largest: 14) and **69 entities declare no associations at all**. "No path found"
is a correct answer.

**Cross-product linkage is a star centred on `Plant`.** At the product level,
20 of 36 products connect through the ODM overlay — entirely through the single
canonical object `Plant`, at degree 19, with every other product at degree 1.
`Plant` is the master-data spine of the SAP supply chain.

Full measurements in [findings](docs/05-findings.md#the-graph-is-not-what-it-looks-like).

---

## Snowflake objects

Views over the parent ontology's `CORE` tables — no copies, one source of truth:

```
SAP_BDC_ONTOLOGY.SUPPLY_CHAIN
  V_PRODUCT           36     V_ENTITY_EDGE     281
  V_ENTITY           338     V_ODM_EDGE         19
  V_PROCESS            3     V_PROCESS_ROLLUP    3
  SUPPLY_CHAIN_ONTOLOGY_MODEL    2 facts · 12 metrics · 9 verified queries
```

Deploy and verify:

```bash
npm run deploy-views
```

This asserts the Snowflake views and the app's JSON agree on all five counts, and
**fails if they drift** — otherwise Ask would answer over a different population
than the pages display.

> Before changing the semantic view, read
> [findings](docs/05-findings.md#the-semantic-view-trap). Numeric columns must
> stay dimensions with aggregates exposed as metrics; promoting them to facts
> produces a model that validates, deploys, and then fails every query.

---

## Public static build

A credential-free snapshot for sharing, following the
[`supply-chain-360-public`](https://github.com/dfreriks-snow/supply-chain-360-public)
pattern.

```bash
npm run dev            # one shell — the baker reads the live API
npm run bake           # 93 snapshots → client/public/data/
npm run build:static
npm run preview:static # http://localhost:8899
```

Commit `client/public/data/*.json`; the Pages workflow builds from them and
refuses to deploy with fewer than 20. Ask and shortest path are disabled in the
public build, each with an on-screen explanation.

---

## Scope rule

A data product is in scope when **either** its business process is Design to
Operate, **or** its line of business names Supply Chain, Manufacturing, Sourcing
and Procurement, or R&D Engineering.

Line of business is a delimited multi-value string
(`"Manufacturing,Supply Chain"`), so it is matched **per token** — matching the
whole string would drop most of the cross-functional products.

This narrows the parent catalog from 334 products / 2,243 entities to 36 / 338.

---

## Built on

- [`sap-bdc-data-products`](https://github.com/dfreriks-snow/sap-bdc-data-products) — parent explorer; this is a focused fork
- [`supplychain_ontology_agent`](https://github.com/sfc-gh-tjia/supplychain_ontology_agent) — ontology-as-data argument and traversal concept
- [`sap-bdc-supply-chain-360`](https://github.com/dfreriks-snow/sap-bdc-supply-chain-360) — app pattern and docs structure
- [`supply-chain-360-public`](https://github.com/dfreriks-snow/supply-chain-360-public) — static publishing pattern
- AI309 Summit deck, *Enterprise Supply Chain Ontology Agent* — demo narrative
- [SAP Business Accelerator Hub](https://api.sap.com/DataProducts) — upstream catalog

Attribution in detail: [references](docs/06-references.md).
