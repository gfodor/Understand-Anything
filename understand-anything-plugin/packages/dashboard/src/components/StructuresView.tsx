import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
} from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import { useDashboardStore } from "../store";
import StructureNode from "./StructureNode";
import type { StructureFlowNode } from "./StructureNode";
import type { Structure } from "@understand-anything/core/types";

/**
 * Top-level view for the structure-graph artifact. One card per structure,
 * laid out in a simple grid. Each card carries the motivation prominently
 * (the reader's eye reaches it before everything else), the participant
 * node count, and a Walkthrough button when one has been generated.
 *
 * Unlike mechanisms, structures don't split by kind — they share a single
 * register (motivated organization), so the layout is a flat grid rather
 * than kind-grouped rows.
 */

const nodeTypes = {
  "structure-node": StructureNode,
};

const NODE_WIDTH = 320;
const NODE_HEIGHT = 180;
const COL_GAP = 32;
const ROW_GAP = 48;
const TOP_OFFSET = 40;
const COLS = 3;

function buildLayout(structures: Structure[]): {
  nodes: StructureFlowNode[];
  edges: Edge[];
} {
  const nodes: StructureFlowNode[] = [];
  structures.forEach((s, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    nodes.push({
      id: s.id,
      type: "structure-node",
      position: {
        x: 40 + col * (NODE_WIDTH + COL_GAP),
        y: TOP_OFFSET + row * (NODE_HEIGHT + ROW_GAP),
      },
      data: { structure: s },
    });
  });
  return { nodes, edges: [] };
}

export function StructuresView() {
  const structureGraph = useDashboardStore((s) => s.structureGraph);

  const { nodes, edges } = useMemo(
    () => buildLayout(structureGraph?.structures ?? []),
    [structureGraph],
  );

  if (!structureGraph) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-12 text-center">
        <div>
          <p className="mb-2">No structure graph available.</p>
          <p className="text-xs text-text-faint">
            Run <code>/understand-structures</code> to discover the motivated
            structural responses in this codebase.
          </p>
        </div>
      </div>
    );
  }
  if (structureGraph.structures.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-12 text-center max-w-xl mx-auto">
        <div>
          <p className="mb-2">
            No structures surfaced in <strong>{structureGraph.project.name}</strong>.
          </p>
          <p className="text-xs text-text-faint leading-relaxed">
            This is a valid result — small or single-purpose codebases often
            don't have load-bearing structures worth surfacing. The structural
            graph, the business-domain view, and the mechanisms view remain
            available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
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
