import { useEffect, useMemo, useState } from "react";
import { RippleGraph } from "../components/RippleGraph";
import { WorldMap } from "../components/WorldMap";
import { useNetwork, useScenario, useScenarioMaps } from "../hooks/useScenario";
import { hopColor, money } from "../lib/severity";

/**
 * The ripple, geographically and topologically, side by side.
 *
 * Selection is shared: clicking a node in either view highlights it in the other.
 * That is the whole reason for showing both — the reader can ask "where is this"
 * and "how far from the event is this" about the same node without losing it.
 */
export default function RippleMap() {
  const { net, spof } = useNetwork();
  const { disruption, result, plan, running, error } = useScenario();
  const { affected, impaired } = useScenarioMaps(result);

  const [selected, setSelected] = useState<string | null>(null);
  const [revealHop, setRevealHop] = useState<number | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [showReroutes, setShowReroutes] = useState(true);

  const maxHop = result?.totals.maxHop ?? 0;

  /**
   * Step the reveal outward one hop at a time. Showing the whole cascade at once
   * makes it look like a single simultaneous event; stepping it is what makes the
   * word "ripple" mean anything, and it also makes clear that later hops are
   * consequences rather than independent failures.
   */
  useEffect(() => {
    if (!playing) return;
    if (revealHop === undefined) { setRevealHop(0); return; }
    if (revealHop >= maxHop) { setPlaying(false); return; }
    const t = setTimeout(() => setRevealHop((h) => (h === undefined ? 0 : h + 1)), 1100);
    return () => clearTimeout(t);
  }, [playing, revealHop, maxHop]);

  const play = () => { setRevealHop(0); setPlaying(true); };
  const showAll = () => { setPlaying(false); setRevealHop(undefined); };

  const selectedDetail = useMemo(() => {
    if (!selected || !net) return null;
    const node = net.nodes.find((n) => n.node_id === selected);
    if (!node) return null;
    const imp = impaired.get(selected);
    const inbound = net.flows.filter((f) => f.target_id === selected);
    const outbound = net.flows.filter((f) => f.source_id === selected);
    const cap = net.capacity.find((c) => c.plant === node.plant);
    const inv = net.inventory.find((i) => i.plant === node.plant);
    return { node, imp, inbound, outbound, cap, inv };
  }, [selected, net, impaired]);

  if (!net) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-slate-500">
      Loading the network…
    </div>;
  }

  if (!result) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-sm font-semibold text-slate-800">No scenario has been run yet</div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Open <b>Scenario Studio</b>, pick a disruption and run it. The ripple appears here
          on both views at once — geography on the left, network topology on the right —
          and selecting a node in one highlights it in the other.
        </p>
        {running && <div className="mt-3 text-sm text-slate-500">Simulating…</div>}
        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-800">
          {disruption?.label ?? "Scenario"}
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {disruption?.durationDays}d · {Math.round((disruption?.severity ?? 0) * 100)}%
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={play} disabled={playing}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white
                       hover:bg-sky-700 disabled:opacity-50">
            {playing ? "Playing…" : "Play ripple"}
          </button>
          <button onClick={showAll}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            Show all hops
          </button>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showReroutes}
                   onChange={(e) => setShowReroutes(e.target.checked)} />
            reroutes
          </label>
        </div>
      </div>

      {/* hop stepper: doubles as a legend for the ring colours */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <span className="text-xs text-slate-500">Reveal</span>
        {result.hops.map((h) => {
          const active = revealHop === undefined || revealHop >= h.hop;
          return (
            <button key={h.hop}
              onClick={() => { setPlaying(false); setRevealHop(h.hop); }}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition
                ${revealHop === h.hop ? "border-slate-800 bg-slate-800 text-white"
                  : active ? "border-gray-300 bg-white text-slate-700" : "border-gray-200 bg-slate-50 text-slate-400"}`}>
              <span className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: hopColor(h.hop) }} />
              hop {h.hop}
              <span className="text-slate-400">{h.flows}f</span>
              {h.valueAtRisk > 0 && <span className="font-semibold">{money(h.valueAtRisk)}</span>}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-slate-400">
          {revealHop === undefined
            ? "showing the full cascade"
            : `showing hops 0–${revealHop} of ${maxHop}`}
        </span>
      </div>

      {/* the two synced views */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Geography — where it happens
          </div>
          <WorldMap nodes={net.nodes} flows={net.flows}
            affected={affected} impaired={impaired}
            reroutes={showReroutes ? plan?.reroutes : []}
            revealHop={revealHop}
            selected={selected} onSelect={setSelected} height={430} />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Topology — how far from the event
          </div>
          <RippleGraph nodes={net.nodes} flows={net.flows}
            affected={affected} impaired={impaired}
            reroutes={showReroutes ? plan?.reroutes : []}
            revealHop={revealHop} spof={spof}
            selected={selected} onSelect={setSelected} height={430} />
        </div>
      </div>

      {/* selection detail, driven by whichever view was clicked */}
      {selectedDetail && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {selectedDetail.node.node_name}
            </span>
            <span className="text-xs text-slate-500">
              {selectedDetail.node.node_type} · {selectedDetail.node.city}, {selectedDetail.node.country}
            </span>
            {selectedDetail.imp && (
              <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                {Math.round(selectedDetail.imp.impairment * 100)}% impaired · hop {selectedDetail.imp.hop}
              </span>
            )}
            <button onClick={() => setSelected(null)}
                    className="ml-auto text-xs text-slate-500 hover:text-slate-800">clear</button>
          </div>

          {selectedDetail.imp?.causedBy && (
            <div className="mt-1 text-xs text-slate-600">
              Reached via {selectedDetail.imp.causedBy}
              {selectedDetail.imp.bufferDays != null &&
                ` · ${selectedDetail.imp.bufferDays}d buffer absorbed the first part, exposed ${selectedDetail.imp.daysExposed}d`}
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="font-semibold text-slate-600">Inbound ({selectedDetail.inbound.length})</div>
              {selectedDetail.inbound.map((f) => {
                const a = affected.get(f.flow_id);
                return (
                  <div key={f.flow_id} className="mt-1 flex justify-between gap-2">
                    <span className="truncate text-slate-600">{f.source_name}</span>
                    <span className={a ? "font-medium text-rose-700" : "text-slate-400"}>
                      {a ? money(a.valueAtRisk) : money(f.monthly_value)}
                    </span>
                  </div>
                );
              })}
              {!selectedDetail.inbound.length && <div className="mt-1 text-slate-400">none</div>}
            </div>
            <div>
              <div className="font-semibold text-slate-600">Outbound ({selectedDetail.outbound.length})</div>
              {selectedDetail.outbound.map((f) => {
                const a = affected.get(f.flow_id);
                return (
                  <div key={f.flow_id} className="mt-1 flex justify-between gap-2">
                    <span className="truncate text-slate-600">{f.target_name}</span>
                    <span className={a ? "font-medium text-rose-700" : "text-slate-400"}>
                      {a ? money(a.valueAtRisk) : money(f.monthly_value)}
                    </span>
                  </div>
                );
              })}
              {!selectedDetail.outbound.length && <div className="mt-1 text-slate-400">none</div>}
            </div>
            <div>
              <div className="font-semibold text-slate-600">State</div>
              {selectedDetail.cap ? (
                <>
                  <div className="mt-1 flex justify-between"><span className="text-slate-500">utilisation</span>
                    <span className="text-slate-700">{selectedDetail.cap.utilization_pct}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">free hours</span>
                    <span className="text-slate-700">{selectedDetail.cap.free_hrs}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">spare units</span>
                    <span className="text-slate-700">{selectedDetail.cap.spare_units}</span></div>
                </>
              ) : <div className="mt-1 text-slate-400">not a plant — no capacity or stock held</div>}
              {selectedDetail.inv && (
                <div className="flex justify-between"><span className="text-slate-500">min buffer</span>
                  <span className="text-slate-700">{selectedDetail.inv.min_days_of_inventory}d</span></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* flows at risk */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Flows at risk ({result.flows.length})
        </div>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr className="border-b border-gray-200">
              <th className="py-1.5">Hop</th><th>Flow</th><th>Category</th>
              <th className="text-right">Lost</th><th className="text-right">Days</th>
              <th className="text-right">Units</th><th className="text-right">At risk</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {result.flows.map((f) => (
              <tr key={f.flow_id}
                  className={`border-b border-gray-100 ${revealHop !== undefined && f.hop > revealHop ? "opacity-30" : ""}`}>
                <td className="py-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: hopColor(f.hop) }} /> {f.hop}
                </td>
                <td className="text-slate-700">{f.source_name} → {f.target_name}</td>
                <td className="text-slate-500">{f.material_category}</td>
                <td className="text-right font-medium text-slate-800">{Math.round(f.impactFactor * 100)}%</td>
                <td className="text-right text-slate-500">{f.daysAtRisk}</td>
                <td className="text-right text-slate-500">{f.unitsAtRisk}</td>
                <td className="text-right font-semibold text-rose-700">{money(f.valueAtRisk)}</td>
                <td className="text-slate-500">{f.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
