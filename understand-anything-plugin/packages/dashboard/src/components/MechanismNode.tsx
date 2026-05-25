import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { useDashboardStore } from "../store";
import type { Mechanism, MechanismKind } from "@understand-anything/core/types";

export interface MechanismNodeData extends Record<string, unknown> {
  mechanism: Mechanism;
}

export type MechanismFlowNode = Node<MechanismNodeData, "mechanism-node">;

const KIND_COLOR: Record<MechanismKind, { fill: string; border: string; text: string }> = {
  algorithmic: { fill: "rgba(122, 37, 25, 0.05)", border: "rgba(122, 37, 25, 0.4)", text: "#7a2519" },
  "data-structure": { fill: "rgba(45, 90, 130, 0.06)", border: "rgba(45, 90, 130, 0.4)", text: "#2d5a82" },
  protocol: { fill: "rgba(70, 110, 70, 0.06)", border: "rgba(70, 110, 70, 0.4)", text: "#466e46" },
  architectural: { fill: "rgba(130, 90, 35, 0.06)", border: "rgba(130, 90, 35, 0.4)", text: "#825a23" },
  "architectural-elision": { fill: "rgba(100, 60, 110, 0.06)", border: "rgba(100, 60, 110, 0.4)", text: "#643c6e" },
};

const KIND_LABEL: Record<MechanismKind, string> = {
  algorithmic: "algorithmic",
  "data-structure": "data structure",
  protocol: "protocol",
  architectural: "architectural",
  "architectural-elision": "elision",
};

function MechanismNode({ data }: NodeProps<MechanismFlowNode>) {
  const selectNode = useDashboardStore((s) => s.selectNode);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const openWalkthrough = useDashboardStore((s) => s.openWalkthrough);
  const { mechanism } = data;
  const isSelected = selectedNodeId === mechanism.id;
  const palette = KIND_COLOR[mechanism.kind];

  const onReadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (mechanism.walkthrough) openWalkthrough(mechanism.walkthrough);
    },
    [mechanism, openWalkthrough],
  );

  return (
    <div
      className={`cursor-pointer transition-all`}
      onClick={() => selectNode(mechanism.id)}
      style={{
        minWidth: "260px",
        maxWidth: "340px",
        padding: "14px 16px",
        background: palette.fill,
        border: `1.5px solid ${isSelected ? palette.text : palette.border}`,
        borderRadius: "6px",
        boxShadow: isSelected
          ? `0 0 0 3px ${palette.fill}`
          : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />

      <div
        className="font-mono text-[9px] uppercase tracking-wider mb-1.5"
        style={{ color: palette.text, opacity: 0.85 }}
      >
        {KIND_LABEL[mechanism.kind]}
      </div>
      <div className="text-sm font-semibold text-text-primary mb-1.5 leading-tight">
        {mechanism.name}
      </div>
      <div className="text-[11px] text-text-secondary leading-snug line-clamp-3 mb-2">
        {mechanism.candidateRecognition}
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        <div className="text-[9px] text-text-muted font-mono">
          {mechanism.participantNodeIds.length} node
          {mechanism.participantNodeIds.length !== 1 ? "s" : ""}
        </div>
        {mechanism.walkthrough ? (
          <button
            type="button"
            onClick={onReadClick}
            className="inline-flex items-center gap-1 cursor-pointer text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md text-white hover:opacity-90 transition-opacity"
            style={{ background: palette.text }}
            aria-label={`Open walkthrough: ${mechanism.walkthrough.title}`}
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

export default memo(MechanismNode);
