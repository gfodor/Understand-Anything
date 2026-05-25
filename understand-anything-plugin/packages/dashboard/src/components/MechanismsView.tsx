import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import { useDashboardStore } from "../store";
import MechanismNode from "./MechanismNode";
import type { MechanismFlowNode } from "./MechanismNode";
import type { Mechanism, MechanismKind } from "@understand-anything/core/types";

/**
 * Top-level view rendering each Mechanism as a graph node. Grouped
 * spatially by kind (algorithmic / data-structure / protocol /
 * architectural / architectural-elision). Each node carries a "Read"
 * affordance if its walkthrough has been generated.
 *
 * No edges between mechanisms in v1 — the visual grouping by kind
 * provides enough structure. A future iteration could draw edges
 * where mechanisms share participant nodes ("these two clever bits
 * touch the same code").
 */

const nodeTypes = {
  "mechanism-node": MechanismNode,
};

const KIND_ORDER: MechanismKind[] = [
  "algorithmic",
  "data-structure",
  "protocol",
  "architectural",
  "architectural-elision",
];

const KIND_LABEL: Record<MechanismKind, string> = {
  algorithmic: "Algorithmic spines",
  "data-structure": "Data-structure cleverness",
  protocol: "Cross-process protocols",
  architectural: "Architectural mechanisms",
  "architectural-elision": "Architectural elisions",
};

// Grid layout: each kind is a row, mechanisms in that kind sit side by side.
const NODE_WIDTH = 320;
const NODE_HEIGHT = 160;
const COL_GAP = 32;
const ROW_GAP = 80;
const HEADER_OFFSET = 60;

function buildLayout(mechanisms: Mechanism[]): {
  nodes: MechanismFlowNode[];
  edges: Edge[];
  headers: { kind: MechanismKind; y: number }[];
} {
  const byKind = new Map<MechanismKind, Mechanism[]>();
  for (const m of mechanisms) {
    if (!byKind.has(m.kind)) byKind.set(m.kind, []);
    byKind.get(m.kind)!.push(m);
  }

  const nodes: MechanismFlowNode[] = [];
  const headers: { kind: MechanismKind; y: number }[] = [];
  let y = HEADER_OFFSET;
  for (const kind of KIND_ORDER) {
    const items = byKind.get(kind);
    if (!items || items.length === 0) continue;
    headers.push({ kind, y });
    let x = 40;
    for (const m of items) {
      nodes.push({
        id: m.id,
        type: "mechanism-node",
        position: { x, y: y + 28 },
        data: { mechanism: m },
      });
      x += NODE_WIDTH + COL_GAP;
    }
    y += NODE_HEIGHT + ROW_GAP;
  }
  return { nodes, edges: [], headers };
}

export function MechanismsView() {
  const mechanismGraph = useDashboardStore((s) => s.mechanismGraph);

  const { nodes, edges, headers } = useMemo(
    () => buildLayout(mechanismGraph?.mechanisms ?? []),
    [mechanismGraph],
  );

  if (!mechanismGraph) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-12 text-center">
        <div>
          <p className="mb-2">No mechanism graph available.</p>
          <p className="text-xs text-text-faint">
            Run <code>/understand-mechanisms</code> to discover pieces of
            code worth recognizing on their own terms.
          </p>
        </div>
      </div>
    );
  }
  if (mechanismGraph.mechanisms.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-12 text-center max-w-xl mx-auto">
        <div>
          <p className="mb-2">
            No mechanisms surfaced in <strong>{mechanismGraph.project.name}</strong>.
          </p>
          <p className="text-xs text-text-faint leading-relaxed">
            This is a valid result — not every codebase has algorithmic
            spines, architectural elisions, or data-structure cleverness
            worth highlighting. The structural graph and the business-domain
            view remain available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {/* Section headers floating over the ReactFlow canvas */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 5 }}
      >
        {headers.map((h) => (
          <div
            key={h.kind}
            className="absolute font-mono uppercase tracking-wider text-[10px] font-semibold"
            style={{
              left: 40,
              top: h.y,
              color: "var(--color-text-muted)",
              opacity: 0.85,
            }}
          >
            {KIND_LABEL[h.kind]}
          </div>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        panOnScroll
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border-subtle)" />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
