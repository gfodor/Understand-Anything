import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { useDashboardStore } from "../store";
import type { Structure } from "@understand-anything/core/types";

export interface StructureNodeData extends Record<string, unknown> {
  structure: Structure;
}

export type StructureFlowNode = Node<StructureNodeData, "structure-node">;

// Structures use a single warm palette across the board — they share a
// mood (motivated organization) rather than splitting by kind the way
// mechanisms do. Single accent variant keeps the view calm.
const PALETTE = {
  fill: "rgba(212, 165, 116, 0.05)",
  border: "rgba(212, 165, 116, 0.4)",
  text: "var(--color-accent)",
  textBright: "var(--color-accent-bright)",
};

function StructureNode({ data }: NodeProps<StructureFlowNode>) {
  const selectNode = useDashboardStore((s) => s.selectNode);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const openWalkthrough = useDashboardStore((s) => s.openWalkthrough);
  const { structure } = data;
  const isSelected = selectedNodeId === structure.id;

  const onReadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (structure.walkthrough) openWalkthrough(structure.walkthrough);
    },
    [structure, openWalkthrough],
  );

  return (
    <div
      className="cursor-pointer transition-all"
      onClick={() => selectNode(structure.id)}
      style={{
        minWidth: "260px",
        maxWidth: "340px",
        padding: "14px 16px",
        background: PALETTE.fill,
        border: `1.5px solid ${isSelected ? "var(--color-accent)" : PALETTE.border}`,
        borderRadius: "6px",
        boxShadow: isSelected
          ? `0 0 0 3px ${PALETTE.fill}`
          : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />

      <div
        className="font-mono text-[9px] uppercase tracking-wider mb-1.5"
        style={{ color: PALETTE.text, opacity: 0.85 }}
      >
        structure
      </div>
      <div className="text-sm font-semibold text-text-primary mb-1.5 leading-tight">
        {structure.name}
      </div>
      <div className="text-[11px] text-text-secondary leading-snug line-clamp-3 mb-2 italic">
        {structure.motivation}
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        <div className="text-[9px] text-text-muted font-mono">
          {structure.participantNodeIds.length} node
          {structure.participantNodeIds.length !== 1 ? "s" : ""}
        </div>
        {structure.walkthrough ? (
          <button
            type="button"
            onClick={onReadClick}
            className="inline-flex items-center gap-1 cursor-pointer text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md text-white hover:opacity-90 transition-opacity"
            style={{ background: "var(--color-accent)" }}
            aria-label={`Open walkthrough: ${structure.walkthrough.title}`}
          >
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="20" y1="20" x2="16.5" y2="16.5" />
            </svg>
            Walkthrough
          </button>
        ) : (
          <span className="text-[9px] text-text-muted italic">
            no walkthrough yet
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(StructureNode);
