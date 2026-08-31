# 7. Scenario modelling

Disruption ripple analysis and AI-assisted mitigation, over a real geospatial
supply-chain network.

---

## Why this needed a different data foundation

The BDC catalog ontology in the rest of this app is **metadata about data
products** — 36 products, 338 CDS entities. It has no plant instances, no
material flows, no inventory. It cannot answer "a hurricane hits Austin, what
happens", and pretending otherwise would be dishonest.

Scenario modelling therefore runs on `SAP_SUPPLY_CHAIN`, which does have a
network:

| | |
|---|---|
Nodes | **19** with real lat/lon — 5 plants, 6 suppliers, 8 customers |
Flows | **27** — 12 inbound, 4 inter-plant, 11 outbound, **$56.7M/month** |
Constraints | work-center capacity, inventory days, observed substitutability |

The ontology still earns its place: it explains *what* these objects are and
which SAP data products describe them. The scenario engine says what happens to
them.

---

## The network

```
 SUPPLIERS                PLANTS                    CUSTOMERS
 Hamamatsu   (JP) ──┐   San Jose HQ    (US) ──┬──▶ TSMC          (TW)
 Teledyne    (CA) ──┼──▶ Austin Fab     (US) ──┼──▶ Samsung       (KR)
 Aerotech    (US) ──┤   Dresden Fab    (DE) ──┼──▶ Intel         (US)
 TRUMPF      (DE) ──┤   Singapore Hub  (SG) ──┼──▶ GlobalFoundries(US)
 Festo       (DE) ──┤   Penang Assy    (MY) ──┼──▶ Micron        (US)
 Coherent    (US) ──┘         ▲   │            ├──▶ SK Hynix      (KR)
                              └───┘            ├──▶ Infineon      (AT)
                          inter-plant          └──▶ Texas Instr.  (US)
```

### What makes it interesting to disrupt

**Substitutability is uneven**, which is what turns mitigation into a real
decision rather than a lookup:

| Category | Made at | Reroutable |
|---|---|---|
Inspection Systems | San Jose, Dresden, Austin | yes, two alternatives |
Metrology | San Jose, Austin | yes, one alternative |
Die Sorting | Penang only | **no** |
Surface Analysis | Singapore only | **no** |
E-Beam Review | Dresden only | **no** |
Sub-assemblies / Optics / Test Fixtures | one plant each | **no** |

**Capacity is tight.** Spare units per month:

| Plant | Free hrs | Hrs/unit | Spare units |
|---|---|---|---|
San Jose | 282 | 49.2 | 5 |
Penang | 238 | 74.0 | 3 |
Austin | 259 | 87.2 | 2 |
Dresden | 62 | 61.0 | **1** |
Singapore | 115 | 121.0 | **0** |

**Inventory decides timing.** Minimum buffer days: Penang **12**, San Jose 15,
Dresden 35, Singapore 40, Austin 42. Penang breaks before Austin does.

---

## The model

Three rules, stated on screen as well as here:

1. A disrupted node loses `severity` of its throughput.
2. Impact travels along outbound flows, **scaled by dependency share** — the
   flow's share of the receiver's total inbound volume. Austin supplies 8 of the
   58 units Penang receives, so Austin going dark impairs Penang by 14%, not 100%.
3. **Inventory defers impact at the receiver.** A plant with 12 days of buffer
   absorbs the first 12 days. This is why duration is the control that changes the
   answer most.

Deliberately not modelled: multi-level BOM explosion, lead times, in-transit
stock, qualification time for a plant change. The BOM is available
(`A_BOM_ITEM`, 30 items) if this is taken further.

### The headline case

Austin Fab offline 60 days:

```
hop 0  Austin Fab                                      100% down
hop 1  GlobalFoundries  Inspection Systems   $8.4M
       Micron           Metrology            $5.4M
       Penang Assembly  Test Fixtures        $960K   → 11% impaired
                                                       (12d buffer, exposed 48d)
hop 2  TSMC             Die Sorting          $794K
       Texas Instr.     Die Sorting          $497K

$16.05M at risk = 28.3% of the monthly network
```

Mitigation, inside real limits:

```
REROUTE  Inspection Systems → San Jose   2 u/mo   98.3h of 282   $8.4M
REROUTE  Metrology          → San Jose   3 u/mo  147.5h of 184   $5.4M
                                                  ↳ last spare unit
BLOCKED  Die Sorting (TSMC)              $794K   Penang is sole source
BLOCKED  Die Sorting (TI)                $497K   Penang is sole source

$13.8M protected of $15.1M = 91.4%
San Jose 89.1% → 98.6% utilisation, 0 spare units left
```

Inspection (2) plus Metrology (3) is **exactly** San Jose's 5 spare units, and
San Jose becomes the new single point of failure. That tightness is in the data,
not contrived.

---

## Disruption types

| Kind | Models | Notes |
|---|---|---|
`weather` | Hurricane, typhoon, flood on a site | Duration vs downstream buffers |
`supplier` | A supplier fails | Hamamatsu feeds two plants, so wide but shallow |
`capacity` | Partial output loss | Severity below 1.0 |
`lane` | Port, canal or airspace closure | Both endpoints keep running |
`demand` | A customer surges | Tests headroom upward; reports shortfall, not reroutes |

---

## Mitigation optimizer

Greedy by value at risk: sort lost customer flows most-valuable first, allocate
the alternative plant with the most room. Greedy rather than exact **on purpose**
— every decision can be read off the table in one line, which matters more here
than the last few percent of optimality. The plan says it is greedy.

Three kinds of "cannot be saved" are distinguished, because each needs a
different response:

- **no alternative plant makes this category** — qualification or tooling
- **the only alternative is also disrupted** — a different scenario response
- **alternatives have no spare capacity** — overtime or displacing lower-value work

Capacity is compared **as a monthly rate**. An early version compared units
needed over 60 days against one month of spare capacity and wrongly rejected
feasible reroutes; see [findings](05-findings.md#the-rate-mismatch).

---

## AI reasoning

`AI_COMPLETE` with `claude-4-sonnet`, not Cortex Analyst.

Analyst answers questions about data in tables. A scenario is a hypothetical the
engine just computed in memory — the ripple and the reroutes are nowhere in
Snowflake to query, so Analyst would dutifully query the *undisrupted* network
and answer the wrong question.

So the computed scenario is passed as facts and the model interprets rather than
calculates. Every figure comes from the deterministic engine; the model
contributes judgement, ranking and prose. **If the model did the arithmetic the
numbers would stop being auditable.**

Two endpoints: a four-section briefing, and a follow-up channel for what-ifs that
is told to flag inference versus simulated output.

---

## Visualization

Techniques drawn from Cambridge Intelligence, Creately, Ventagium and PuppyGraph
guidance:

| Technique | Where |
|---|---|
Geographic map with Bezier flow arcs | Ripple Map, left |
Hop-distance rings, colour by distance from the event | both views |
Edge thickness = volume, colour = severity (separate encodings) | both views |
One shared severity scale across both views | `lib/severity.ts` |
Left-to-right role tiers (supplier → plant → customer) | Ripple Map, right |
Single-point-of-failure halo | topology view |
Dashed overlay for reroutes as *new* lanes | both views |
Staged action pipeline by required response | Scenario Studio |
Bullet charts for capacity and buffer | Studio, Mitigation |
Before/after flow comparison | Mitigation |
Step animation of the cascade | Ripple Map, "Play ripple"; auto-plays in the Guided Demo |
Annotation pins on click targets | Guided Demo |

**Gauges and pie charts are avoided deliberately** — the Ventagium guidance is
explicit that radial angle encoding is read less accurately than length, and
capacity headroom must not be misread. Bullet charts everywhere instead.

The map is hand-rolled SVG over a committed 68 KB land outline. Nineteen pins and
27 arcs do not justify a tile layer or a projection library, and hand-rolling
keeps the arc geometry under control for the reroute overlay.

---

## Running it

```bash
npm run deploy-scenario   # create SAP_SUPPLY_CHAIN.SCENARIO views
npm run export-network    # export to data/sc_network.json
npm run build-land        # fetch and convert the land outline (once)
npm run verify-scenario   # 20 assertions across all 5 disruption kinds
npm run dev
```

Pages: **Scenario Studio** (build and run), **Ripple Map** (both views, synced
selection, step animation), **Mitigation** (plan, before/after, AI), and the
**Guided Demo**, which walks the hurricane end to end in seven annotated steps.

The Guided Demo embeds the real components with numbered pins on the click targets,
a per-step action list, the one number each step should leave behind, and a button
that navigates to the live page. It uses live components rather than screenshots
because every figure changes when the network is re-exported — a capture would be
wrong within a release and nobody would notice.

The engine runs in-process — 19 nodes and 27 flows simulate in microseconds, so
the UI re-runs on every slider movement. A warehouse round-trip per keystroke
would add latency for nothing.

Only the AI needs credentials. Everything else works from the committed JSON.

---

## Snowflake objects

```
SAP_SUPPLY_CHAIN.SCENARIO          (views only, no copies)
  V_NODE              19    V_PLANT_CAPACITY     5
  V_FLOW              27    V_PLANT_INVENTORY    5
  V_SUBSTITUTION      11
```

`V_PLANT_CAPACITY.HRS_PER_UNIT` is **derived** — used hours divided by units
shipped, blended across work centers and products. Planning-grade, and the UI
says so rather than presenting unit counts as exact.
