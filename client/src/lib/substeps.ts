import type { AffectedFlow, ImpairedNode, ScenarioResult } from "./api";

/**
 * Decompose a scenario into individually narrated beats.
 *
 * A hop reveals every flow at that distance simultaneously, which is faithful to
 * the model but hard to follow: three arcs light up at once and the viewer cannot
 * tell which one causes the next hop. Splitting each hop into lettered sub-steps
 * (1a, 1b, 1c) makes the chain legible, and lets the camera frame one lane at a
 * time.
 *
 * Ordering inside a hop is deliberate. Customer-facing flows come first, biggest
 * first, because those are the immediate revenue losses. Inter-plant flows come
 * LAST, because they are the bridge to the next hop — ending a hop on the flow
 * that causes the next one makes the cascade tell itself.
 */

export interface SubStep {
  /** "0", "1a", "1b", "2a" … */
  id: string;
  hop: number;
  /** undefined on the origin step. */
  letter?: string;
  kind: "origin" | "customer" | "interplant" | "supplier" | "summary";
  title: string;
  /** What is happening, in one sentence. */
  what: string;
  /** What this causes, when it causes something. */
  consequence?: string;
  flowIds: string[];
  /** Node ids the camera should frame for this beat. */
  focusNodes: string[];
  valueAtRisk: number;
  /** Cumulative value revealed up to and including this beat. */
  cumulative: number;
  /** The node this beat impairs, if any. */
  impairs?: ImpairedNode;
}

const money = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

export function buildSubSteps(res: ScenarioResult | null): SubStep[] {
  if (!res) return [];

  const impairedById = new Map(
    [...res.origin, ...res.impaired].map((n) => [n.node_id, n]));
  const steps: SubStep[] = [];
  let cumulative = 0;

  // ---- the origin -----------------------------------------------------------
  const originNodes = res.origin.map((o) => o.node_id);
  if (res.origin.length) {
    const o = res.origin[0];
    const d = res.disruption;
    steps.push({
      id: "0", hop: 0, kind: "origin",
      title: `${o.node_name} is disrupted`,
      what: d.kind === "demand"
        ? `${o.node_name} increases demand by ${Math.round(d.severity * 100)}% for ${d.durationDays} days.`
        : `${o.node_name} loses ${Math.round(d.severity * 100)}% of throughput for ${d.durationDays} days.`,
      consequence: o.bufferDays != null
        ? `It holds ${o.bufferDays} days of stock, so downstream sites are shielded for a while.`
        : undefined,
      flowIds: [], focusNodes: originNodes, valueAtRisk: 0, cumulative: 0,
      impairs: o,
    });
  } else {
    // Lane closures have no origin node — the cut lane is the first beat instead.
    const first = res.flows.filter((f) => f.hop === 1);
    if (first.length) {
      const f = first[0];
      steps.push({
        id: "0", hop: 0, kind: "origin",
        title: `The ${f.material_category} lane closes`,
        what: `${f.source_name} to ${f.target_name} stops. Both sites keep operating; only the lane between them is cut.`,
        flowIds: [f.flow_id], focusNodes: [f.source_id, f.target_id],
        valueAtRisk: 0, cumulative: 0,
      });
    }
  }

  // ---- one beat per flow, hop by hop ---------------------------------------
  const hops = [...new Set(res.flows.map((f) => f.hop))].sort((a, b) => a - b);
  const LETTERS = "abcdefghijklmnopqrstuvwxyz";

  for (const hop of hops) {
    const inHop = res.flows.filter((f) => f.hop === hop);

    const customers = inHop
      .filter((f) => f.target_type === "Customer")
      .sort((a, b) => b.valueAtRisk - a.valueAtRisk);
    // bridges last: they set up the next hop
    const bridges = inHop
      .filter((f) => f.target_type !== "Customer")
      .sort((a, b) => b.valueAtRisk - a.valueAtRisk);

    const ordered = [...customers, ...bridges];
    ordered.forEach((f, i) => {
      cumulative += f.valueAtRisk;
      const isBridge = f.target_type !== "Customer";
      const downstream = isBridge ? impairedById.get(f.target_id) : undefined;

      steps.push({
        id: `${hop}${LETTERS[i]}`,
        hop,
        letter: LETTERS[i],
        kind: isBridge ? "interplant" : "customer",
        title: `${f.source_name} → ${f.target_name}`,
        what: isBridge
          ? `${f.source_name} can no longer ship ${f.material_category.toLowerCase()} to ${f.target_name}. `
            + `${Math.round(f.impactFactor * 100)}% of that lane is lost — ${money(f.valueAtRisk)}.`
          : `${f.target_name} stops receiving ${f.material_category.toLowerCase()}. `
            + `${Math.round(f.impactFactor * 100)}% of the lane is lost, putting ${money(f.valueAtRisk)} of revenue at risk.`,
        consequence: downstream
          ? `${downstream.node_name} now depends on that flow for `
            + `${Math.round(downstream.impairment * 100)}% of its inbound volume. `
            + (downstream.bufferDays != null
                ? `Its ${downstream.bufferDays}-day buffer absorbs the first ${downstream.bufferDays} days, `
                  + `so it runs normally until day ${downstream.bufferDays + 1} and is then exposed for `
                  + `${downstream.daysExposed} days.`
                : "")
          : isBridge ? undefined
          : "This is a direct customer loss — no further sites are affected by this lane.",
        flowIds: [f.flow_id],
        focusNodes: [f.source_id, f.target_id],
        valueAtRisk: f.valueAtRisk,
        cumulative,
        impairs: downstream,
      });
    });
  }

  // ---- pull back out ------------------------------------------------------
  if (steps.length > 1) {
    steps.push({
      id: "sum", hop: res.totals.maxHop, kind: "summary",
      title: "The full picture",
      what: `${res.flows.length} flows affected across ${res.totals.maxHop} `
          + `hop${res.totals.maxHop === 1 ? "" : "s"}, `
          + `${money(res.totals.valueAtRisk)} at risk — `
          + `${res.totals.pctOfNetwork}% of monthly network value.`,
      consequence: res.totals.customersAffected > 0
        ? `${res.totals.customersAffected} customers are affected, `
          + `${res.impaired.filter((n) => n.node_type === "Plant").length} plants impaired.`
        : undefined,
      flowIds: res.flows.map((f) => f.flow_id),
      focusNodes: [],                        // zoom back to the whole world
      valueAtRisk: 0,
      cumulative,
    });
  }

  return steps;
}

/** Group beats by hop, for the stepper rail. */
export function groupByHop(steps: SubStep[]): { hop: number; steps: SubStep[] }[] {
  const m = new Map<number, SubStep[]>();
  for (const s of steps) {
    if (s.kind === "summary") continue;
    (m.get(s.hop) ?? m.set(s.hop, []).get(s.hop)!).push(s);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([hop, ss]) => ({ hop, steps: ss }));
}

/** Every flow revealed up to and including a beat index — what the map should show. */
export function revealedFlows(steps: SubStep[], upto: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i <= Math.min(upto, steps.length - 1); i++) {
    for (const f of steps[i].flowIds) s.add(f);
  }
  return s;
}

/** Highest hop revealed so far, so nodes appear in step with their flows. */
export function revealedHop(steps: SubStep[], upto: number): number {
  let h = 0;
  for (let i = 0; i <= Math.min(upto, steps.length - 1); i++) {
    h = Math.max(h, steps[i].hop);
  }
  return h;
}

export type { AffectedFlow };
