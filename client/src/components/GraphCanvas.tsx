import { useEffect, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

export function GraphCanvas({
  elements, onSelectNode, height = 640,
}: {
  elements: any[];
  onSelectNode?: (data: any | null) => void;
  height?: number;
}) {
  const cyRef = useRef<cytoscape.Core | null>(null);

  const runLayout = (cy: cytoscape.Core) => {
    cy.layout({
      name: "fcose", quality: "default", animate: false, randomize: true,
      nodeSeparation: 110, nodeRepulsion: 8000, gravity: 0.3, numIter: 1800,
      packComponents: true,
      idealEdgeLength: (e: any) => (e.data("kind") === "contain" ? 60 : 150),
    } as any).run();
  };

  useEffect(() => {
    const cy = cyRef.current;
    if (cy) runLayout(cy);
  }, [elements]);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-slate-50"
      style={{ height }}>
      <CytoscapeComponent
        elements={elements}
        className="h-full w-full"
        wheelSensitivity={0.2}
        cy={(cy: cytoscape.Core) => {
          cyRef.current = cy;
          cy.removeAllListeners();
          cy.on("tap", "node", (e) => {
            cy.elements().removeClass("faded highlighted");
            const hood = e.target.closedNeighborhood();
            cy.elements().not(hood).addClass("faded");
            hood.addClass("highlighted");
            onSelectNode?.(e.target.data());
          });
          cy.on("tap", (e) => {
            if (e.target === cy) {
              cy.elements().removeClass("faded highlighted");
              onSelectNode?.(null);
            }
          });
          runLayout(cy);
        }}
        stylesheet={[
          {
            selector: "node",
            style: {
              "background-color": "data(processColor)",
              label: "data(label)", "font-size": 8, color: "#0f172a",
              "text-valign": "center", "text-halign": "center",
              "text-wrap": "ellipsis", "text-max-width": 80,
              "min-zoomed-font-size": 7,
              width: "data(size)", height: "data(size)",
              "border-width": 0, "overlay-opacity": 0,
            },
          },
          {
            selector: 'node[kind = "process"]',
            style: {
              shape: "round-rectangle", "font-size": 12, "font-weight": 700,
              color: "#ffffff", "text-max-width": 110,
            },
          },
          {
            selector: 'node[kind = "product"]',
            style: { shape: "ellipse", "border-width": 2, "border-color": "#ffffff" },
          },
          { selector: 'node[?mapped]', style: { "border-width": 2, "border-color": "#16a34a" } },
          { selector: 'node[kind = "entity"]', style: { shape: "ellipse", "font-size": 7 } },
          {
            selector: 'edge[kind = "contain"]',
            style: { width: 1, "line-color": "#d8dee8", "line-style": "dashed", "curve-style": "bezier", opacity: 0.4 },
          },
          {
            selector: 'edge[kind = "assoc"]',
            style: { width: 1, "line-color": "#a5b4fc", "curve-style": "bezier", opacity: 0.55 },
          },
          {
            selector: 'edge[kind = "cross"]',
            style: {
              width: "mapData(weight, 1, 6, 1.5, 5)", "line-color": "#ef4444",
              "target-arrow-shape": "triangle", "target-arrow-color": "#ef4444",
              "curve-style": "bezier", opacity: 0.7,
            },
          },
          { selector: ".faded", style: { opacity: 0.08, "text-opacity": 0.05 } },
          { selector: ".highlighted", style: { opacity: 1 } },
          { selector: "node.highlighted", style: { "border-color": "#29B5E8", "border-width": 3 } },
        ]}
      />
    </div>
  );
}
