# 6. References

What each source contributed, and where the boundary sits. All four repos below
are public.

---

## Parent project

### [`dfreriks-snow/sap-bdc-data-products`](https://github.com/dfreriks-snow/sap-bdc-data-products)

> Interactive explorer for the SAP Business Data Cloud data product portfolio,
> mined from the public SAP Business Accelerator Hub catalog.

**This project is a focused fork of it.** The parent covers the whole catalog —
334 data products, 2,243 CDS entities, 2,376 associations across 10 business
processes. This one narrows to the 36 supply-chain products and adds graph
traversal, a guided demo, and a supply-chain-scoped semantic view.

Directly reused, not copied:

- `ontology_builder.build_ontology()` — catalog parsing, semantic-role
  classification, association resolution, ODM overlay
- `ontology_builder.process_rollup / correlation / scorecard / insight_apps /
  semantic_roles / lens_summary` — re-run over the **filtered** dictionary rather
  than having their output copied, so the figures are the slice's own and cannot
  drift from the parent's logic
- The React page set, `GraphCanvas`, and the Express API shape
- `SAP_BDC_ONTOLOGY.CORE` — the Snowflake tables this project builds views over.
  **No copies are made**; there is one source of truth.

`tools/export_sc_ontology.py` imports `ontology_builder` from a sibling checkout.
That is a hard dependency for `npm run export-data`, though not for running the
app — `data/sc_ontology.json` is committed.

---

## Ontology and agent pattern

### [`sfc-gh-tjia/supplychain_ontology_agent`](https://github.com/sfc-gh-tjia/supplychain_ontology_agent)

An ontology-driven knowledge graph agent on Snowflake. Its README describes a
full deployable stack:

- 1 database (`DB_ONTOLOGY_CONTROL_PLANE`), 3 schemas
- 2 physical KG tables — **124 nodes, 109 edges**
- 8 ontology metadata tables, 27 views
- 4 semantic views, 6 graph-visualization UDFs
- 1 Cortex Agent with 5 tools, 2 Iceberg tables (IoT + risk)

**Taken:** the ontology-as-queryable-data argument, the polymorphic-query and
identity-resolution framing, and the interactive traversal concept — expansion
from a seed plus shortest path — which became `services/traverse.ts` and the
Graph Traversal page.

**Deliberately not taken:** its graph is a persisted `KG_NODE`/`KG_EDGE` pair
traversed with Snowflake UDFs. Here the whole graph is 338 nodes and 281 edges,
so traversal runs in-process; a warehouse round-trip per click would add latency
for nothing.

**The important difference — do not conflate the two.** That repo models real
supply-chain *objects*: suppliers, shipments, plants, purchase orders, contracts,
IoT telemetry, risk scores, with identity resolved across SAP and Ariba. This
project models *metadata about SAP data products*. Its graph can answer "what
happens if this supplier goes down"; this one cannot, and should not be presented
as if it could.

Its stack was evaluated as an alternative foundation and not deployed — see
[build steps, step 0](03-build-steps.md#step-0--decide-what-ontology-means-here).

---

## Application and publishing patterns

### [`dfreriks-snow/sap-bdc-supply-chain-360`](https://github.com/dfreriks-snow/sap-bdc-supply-chain-360)

> A reference implementation showing how to turn SAP BDC Standard Data Products
> into a live, AI-powered supply-chain analytics app on Snowflake — using a
> medallion architecture, a governed semantic view, a Cortex Agent, and a
> self-contained Snowflake Native App (React + Express on Snowpark Container
> Services), deployable across multiple regions.

**Taken:** the React + Express split, the governed-semantic-view-plus-agent
pattern, and its documentation structure (`ARCHITECTURE` / `DEMO_GUIDE` /
`INSTALL`), which shaped this `docs/` set.

**Not taken:** the SPCS Native App packaging — `manifest.yml`,
`service_spec.yml`, `setup.sql`, org listings. This project runs locally or as a
static site; it is not packaged as a Native App.

**Complements rather than overlaps.** That app does transactional supply-chain
analytics on real SAP data — production planning, BOM, work-center capacity,
inventory, delivery performance. It is the right place to go for questions this
ontology cannot answer. On the same Snowflake account it corresponds to
`SAP_SUPPLY_CHAIN` and the `SAP_SUPPLY_CHAIN_360` semantic view (16 data
products, 177 entities).

### [`dfreriks-snow/supply-chain-360-public`](https://github.com/dfreriks-snow/supply-chain-360-public)

> A static, no-login public build of the SAP BDC Supply Chain 360 dashboard,
> deployed to GitHub Pages. Dashboards render from a point-in-time data snapshot
> (no Snowflake connection, no credentials in the browser).

**The public static build here follows this pattern closely:**

| Borrowed | Applied as |
|---|---|
`VITE_STATIC=1` switches the client from `/api` to pre-baked JSON | same flag, same purpose |
Pre-baked snapshots under `public/data/`, keyed by filter combination | 93 snapshots keyed by query string |
`base: process.env.BASE_PATH \|\| '/'` for Pages subdirectories | same |
GitHub Actions Pages workflow | plus a guard that fails the build under 20 snapshots |
Optional live agent via `VITE_AGENT_URL` | not adopted — Ask is disabled in the public build instead |

Two additions this project needed:

- **The snapshot-count guard.** Without snapshots the site builds green and
  renders every page empty, which is worse than a red build.
- **Filename sanitization.** Entity IDs contain `::`; percent-escaped filenames
  are decoded by the web server and never match on disk. See
  [findings](05-findings.md#percent-escapes-cannot-be-filenames).

---

## Narrative

### AI309 Summit deck — *Enterprise Supply Chain Ontology Agent*

`Copy of Copy of AI309_FINAL_SUMMIT_0602_ExternalShare.pptx` plus
`supply_chain_ontology_agent_demo_slide.html`. Not public; held locally.

Supplied the five-step structure of the Guided Demo page: the problem
("same supplier, three systems, three different IDs, no links between them"),
the solution, why ontology (polymorphic queries, graph traversal, identity
resolution), and "not a chatbot — a reasoning engine".

The argument is kept. The **figures are read live** from `/api/demo` rather than
transcribed, so the walkthrough cannot quote numbers that have drifted from the
ontology being served.

---

## Snowflake platform

- **Cortex Analyst** — natural-language querying over the semantic view. Its
  SQL-generation behaviour drove the most consequential design decision here; see
  [findings](05-findings.md#the-semantic-view-trap).
- **`cortex agent-studio` CLI** — `sv-generate`, `sv-write`, `sv-edit`,
  `sv-deploy`. The `.sv.yaml` is never hand-edited.
- **Snowflake semantic views** — facts, dimensions, metrics, relationships,
  verified queries.

## Upstream data

- **[SAP Business Accelerator Hub](https://api.sap.com/DataProducts)** — the
  public catalog of BDC data products and their CSN Interop definitions. The
  origin of every figure in this project. Mined by the parent, not by this repo.
- **SAP One Domain Model** — the canonical objects behind the ODM overlay. In
  this slice, `Plant` is the only one linking products.

---

## Boundaries in one table

| Question | Repo |
|---|---|
Which SAP data products exist and how do they relate? | **this repo** (supply chain) / the parent (all 334) |
Which supplier is late, and what is at risk? | `supplychain_ontology_agent` |
What is my production, inventory and delivery performance? | `sap-bdc-supply-chain-360` |
Can I show that dashboard without credentials? | `supply-chain-360-public` |
