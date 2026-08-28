import { useState } from "react";
import { Sidebar, type PageId } from "./components/Sidebar";
import { useQuery } from "./hooks/useQuery";
import { api } from "./lib/api";
import Overview from "./pages/Overview";
import Graph from "./pages/Graph";
import Processes from "./pages/Processes";
import UseCases from "./pages/UseCases";
import Correlation from "./pages/Correlation";
import Coverage from "./pages/Coverage";
import Ask from "./pages/Ask";
import Traverse from "./pages/Traverse";
import Demo from "./pages/Demo";

const TITLES: Record<PageId, string> = {
  overview: "Portfolio Overview",
  graph: "Ontology Graph",
  traverse: "Graph Traversal",
  processes: "Business-Process Ontology",
  usecases: "Use Cases / Intelligent Applications",
  correlation: "Process Correlation",
  coverage: "Coverage & Scorecard",
  ask: "Ask the Ontology",
  demo: "Guided Demo",
};

export default function App() {
  const [page, setPage] = useState<PageId>("overview");
  const meta = useQuery(() => api.meta(), []);

  const render = () => {
    switch (page) {
      case "overview": return <Overview />;
      case "graph": return <Graph />;
      case "traverse": return <Traverse />;
      case "processes": return <Processes />;
      case "usecases": return <UseCases />;
      case "correlation": return <Correlation />;
      case "coverage": return <Coverage />;
      case "ask": return <Ask />;
      case "demo": return <Demo />;
    }
  };

  return (
    <div className="flex h-full">
      <Sidebar active={page} onNavigate={setPage}
        products={meta.data?.totals.products ?? 0}
        entities={meta.data?.totals.entities ?? 0} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
          <h1 className="text-lg font-bold text-slate-800">{TITLES[page]}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            SAP BDC supply-chain slice
          </span>
          {meta.error && <span className="ml-auto text-xs text-rose-500">{meta.error}</span>}
        </header>
        <main className="flex-1 overflow-auto bg-slate-50 p-6">{render()}</main>
      </div>
    </div>
  );
}
