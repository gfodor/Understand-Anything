import { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { useDashboardStore } from "../store";

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  entryPoint?: string;
  entryType?: string;
  stepCount: number;
  flowId: string;
}

export type FlowFlowNode = Node<FlowNodeData, "flow-node">;

function FlowNode({ data }: NodeProps<FlowFlowNode>) {
  const selectNode = useDashboardStore((s) => s.selectNode);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const flowWalkthroughs = useDashboardStore((s) => s.flowWalkthroughs);
  const openWalkthrough = useDashboardStore((s) => s.openWalkthrough);
  const isSelected = selectedNodeId === data.flowId;

  const walkthrough = flowWalkthroughs.find(
    (w) => w.attachedTo?.kind === "flow" && w.attachedTo?.id === data.flowId,
  );

  const onReadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (walkthrough) openWalkthrough(walkthrough);
    },
    [walkthrough, openWalkthrough],
  );

  return (
    <div
      className={`rounded-lg border px-4 py-3 min-w-[240px] max-w-[320px] cursor-pointer transition-all ${
        isSelected
          ? "border-accent bg-accent/10"
          : "border-border-medium bg-surface hover:border-accent/50"
      }`}
      onClick={() => selectNode(data.flowId)}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent/60 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-accent/60 !w-2 !h-2" />

      {data.entryPoint && (
        <div className="text-[9px] font-mono text-accent/70 mb-1 truncate">
          {data.entryPoint}
        </div>
      )}
      <div className="text-xs font-semibold text-text-primary mb-1 truncate">
        {data.label}
      </div>
      <div className="text-[10px] text-text-secondary line-clamp-2">
        {data.summary}
      </div>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        <div className="text-[9px] text-text-muted">
          {data.stepCount} step{data.stepCount !== 1 ? "s" : ""}
        </div>
        {walkthrough && (
          <button
            type="button"
            onClick={onReadClick}
            className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-accent text-white hover:bg-accent/90"
            aria-label={`Open walkthrough: ${walkthrough.title}`}
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
        )}
      </div>
    </div>
  );
}

export default memo(FlowNode);
