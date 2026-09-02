import { useEffect, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

export function GraphCanvas({
  elements, onSelectNode, height = 640, layout = "fcose",
}: {
  elements: any[];
  onSelectNode?: (data: any | null) => void;
  height?: number;
  // A class hierarchy reads as a tree. The server ships explicit positions for
  // it, so the canvas honours them rather than running a layout that would
  // scatter what was deliberately arranged.
  layout?: "fcose" | "tree";
}) {
  const cyRef = useRef<cytoscape.Core | null>(null);

  const runLayout = (cy: cytoscape.Core) => {
    if (layout === "tree") {
      // preset: positions come from the elements themselves
      cy.layout({ name: "preset", animate: false, fit: true, padding: 40 } as any).run();
      // Re-fit on the next frame. The layout's own fit can run before the
      // container has its final height, which left the lower branches of the
      // tree cropped below the fold.
      requestAnimationFrame(() => {
        cy.resize();
        cy.fit(undefined, 30);
      });
      return;
    }
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
  }, [elements, layout]);

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

          // ---- ontology class graph -------------------------------------
          // Two lines per node: the class name and its count. A node has exactly
          // one label in Cytoscape, so the server joins both with a newline and
          // text-wrap:wrap honours it. (source-label is edge-only and does not
          // apply to nodes.)
          {
            selector: 'node[kind = "class"]',
            style: {
              shape: "round-rectangle",
              width: "data(w)",
              height: "data(h)",
              label: "data(label)",
              "font-size": 12,
              "font-weight": 600,
              "text-wrap": "wrap",
              "text-max-width": "data(tw)",
              "text-valign": "center",
              "text-halign": "center",
              "line-height": 1.35,
              "min-zoomed-font-size": 5,
              "border-width": 2,
              "font-family": "system-ui, -apple-system, sans-serif",
            },
          },
          // Abstract: white fill, dashed branch border, dark branch text. No rows
          // of its own, so a solid fill would imply substance it does not have.
          {
            selector: 'node[kind = "class"][?abstract]',
            style: {
              "background-color": "#ffffff",
              "background-opacity": 1,
              "border-color": "data(processColor)",
              "border-style": "dashed",
              "border-width": 2.5,
              color: "data(processColor)",
            },
          },
          // Concrete: solid branch fill, white label. Palette clears 4.5:1.
          {
            selector: 'node[kind = "class"][!abstract]',
            style: {
              "background-color": "data(processColor)",
              "background-opacity": 1,
              "border-color": "#ffffff",
              color: "#ffffff",
            },
          },
          {
            selector: 'edge[kind = "subClassOf"]',
            style: {
              width: 2,
              "line-color": "#94a3b8",
              "curve-style": "taxi",
              "taxi-direction": "leftward",
              "taxi-turn": "50%",
              "target-arrow-shape": "triangle",
              "target-arrow-color": "#94a3b8",
              "arrow-scale": 0.9,
              opacity: 0.85,
            },
          },
          {
            selector: 'edge[kind = "relation"]',
            style: {
              width: 1.5, "line-color": "#29B5E8", "curve-style": "bezier",
              "target-arrow-shape": "triangle", "target-arrow-color": "#29B5E8",
              label: "data(label)", "font-size": 7, color: "#0369a1",
              "text-rotation": "autorotate", "text-background-color": "#ffffff",
              "text-background-opacity": 0.85, "text-background-padding": 2,
              opacity: 0.8,
            },
          },
          // Inferred relations are dashed — nothing stores them, they are
          // derived by rule, and the graph should not claim otherwise.
          {
            selector: 'edge[kind = "relation"][?inferred]',
            style: {
              "line-style": "dashed", "line-color": "#a855f7",
              "target-arrow-color": "#a855f7", color: "#7e22ce",
            },
          },
          {
            selector: 'edge[kind = "relation"][?abstract]',
            style: {
              "line-style": "dotted", "line-color": "#94a3b8",
              "target-arrow-color": "#94a3b8", color: "#475569",
            },
          },

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
