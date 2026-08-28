import { useQuery } from "../hooks/useQuery";
import { api } from "../lib/api";
import { MetricCard, ChartCard, ProcessBadge, Bar } from "../components/Cards";

export default function Overview() {
  const meta = useQuery(() => api.meta(), []);
  const sc = useQuery(() => api.scorecard(), []);
  const proc = useQuery(() => api.processes(), []);
  const lenses = useQuery(() => api.lenses(), []);

  if (meta.error) return <Err msg={meta.error} />;
  if (!meta.data || !sc.data || !proc.data) return <Loading />;

  const t = meta.data.totals;
  const overall = sc.data.overall as number;
  const gaugeColor = overall >= 80 ? "#16a34a" : overall >= 60 ? "#f59e0b" : "#ef4444";
  const roles = meta.data.roles.filter((r) => r.count > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard label="Business processes" value={meta.data.processes.filter((p) => p.products > 0).length}
          accent="from-cyan-50 to-sky-50 border-cyan-200" />
        <MetricCard label="Data products" value={t.products}
          accent="from-violet-50 to-indigo-50 border-violet-200" />
        <MetricCard label="CDS entities" value={t.entities.toLocaleString()}
          accent="from-emerald-50 to-teal-50 border-emerald-200" />
        <MetricCard label="Associations" value={t.associations.toLocaleString()}
          accent="from-amber-50 to-orange-50 border-amber-200" />
        <MetricCard label="Cross-process links" value={t.cross_products}
          accent="from-rose-50 to-pink-50 border-rose-200" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="Ontology completeness" subtitle="scored across six criteria" className="lg:col-span-1">
          <div className="flex flex-col items-center justify-center py-4">
            <div className="text-6xl font-extrabold" style={{ color: gaugeColor }}>{overall}</div>
            <div className="text-xs text-slate-400">out of 100</div>
            <div className="mt-4 w-full space-y-2">
              {sc.data.items.map((it: any) => (
                <div key={it.id} className="flex items-center gap-2">
                  <div className="w-40 truncate text-xs text-slate-600" title={it.label}>{it.label}</div>
                  <div className="flex-1"><Bar pct={it.score} /></div>
                  <div className="w-8 text-right text-xs font-semibold text-slate-700">{it.score}</div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="SAP value chain" subtitle="products & coverage by business process" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            {proc.data.filter((r: any) => r.code !== "NONE").map((r: any) => (
              <div key={r.code} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <ProcessBadge code={r.code} color={r.color} name={r.name} />
                  <span className="text-xs text-slate-400">{r.products} products</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{r.entities.toLocaleString()}</span> entities
                  <span className="ml-auto">{r.coverage_pct}% mapped</span>
                </div>
                <div className="mt-1"><Bar pct={r.coverage_pct} color={r.color} /></div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Entity semantic roles" subtitle="CDS entities typed from @ObjectModel.modelingPattern">
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.role} className="flex items-center gap-3">
                <div className="w-28 text-xs text-slate-600">{r.label}</div>
                <div className="flex-1"><Bar pct={r.pct} color={r.color} /></div>
                <div className="w-20 text-right text-xs text-slate-500">{r.count.toLocaleString()} · {r.pct}%</div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Source systems & provenance" subtitle="where each data product originates">
          {lenses.data ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Source system</div>
                {lenses.data.source_systems.map(([name, n]: [string, number]) => (
                  <div key={name} className="flex items-center gap-3">
                    <div className="w-40 truncate text-xs text-slate-600">{name}</div>
                    <div className="flex-1"><Bar pct={(100 * n) / t.products} /></div>
                    <div className="w-8 text-right text-xs text-slate-500">{n}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Provenance</div>
                {lenses.data.provenance.map(([name, n]: [string, number]) => (
                  <div key={name} className="flex items-center gap-3">
                    <div className="w-40 truncate text-xs capitalize text-slate-600">{name}</div>
                    <div className="flex-1"><Bar pct={(100 * n) / t.products} color="#8b5cf6" /></div>
                    <div className="w-8 text-right text-xs text-slate-500">{n}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="text-xs text-slate-400">Loading…</div>}
        </ChartCard>
      </div>
    </div>
  );
}

function Loading() { return <div className="text-sm text-slate-400">Loading…</div>; }
function Err({ msg }: { msg: string }) {
  return <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-600">{msg}<div className="mt-1 text-xs text-rose-400">If data is missing, run <code>npm run export-data</code>.</div></div>;
}
