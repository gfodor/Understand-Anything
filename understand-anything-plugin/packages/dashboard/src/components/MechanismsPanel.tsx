import { useMemo } from "react";
import { useDashboardStore } from "../store";
import type { Mechanism, MechanismKind } from "@understand-anything/core/types";

/**
 * Sidebar panel listing the codebase's mechanisms grouped by kind. Each
 * mechanism shows premise + candidate recognition. If the mechanism has
 * a walkthrough attached, a "Read walkthrough" button opens it in the
 * full-screen modal; otherwise it shows the generation hint.
 *
 * Compatible with both desktop and mobile layouts.
 */
export function MechanismsPanel() {
  const mechanismGraph = useDashboardStore((s) => s.mechanismGraph);
  const openWalkthrough = useDashboardStore((s) => s.openWalkthrough);

  const grouped = useMemo(() => {
    if (!mechanismGraph) return new Map<MechanismKind, Mechanism[]>();
    const g = new Map<MechanismKind, Mechanism[]>();
    for (const m of mechanismGraph.mechanisms) {
      if (!g.has(m.kind)) g.set(m.kind, []);
      g.get(m.kind)!.push(m);
    }
    return g;
  }, [mechanismGraph]);

  if (!mechanismGraph) {
    return (
      <div style={panelStyle}>
        <h2 style={headerStyle}>Mechanisms</h2>
        <p style={emptyStyle}>
          No mechanism graph found. Run <code>/understand-mechanisms</code> to
          discover pieces of code worth recognizing on their own terms.
        </p>
      </div>
    );
  }

  if (mechanismGraph.mechanisms.length === 0) {
    return (
      <div style={panelStyle}>
        <h2 style={headerStyle}>Mechanisms</h2>
        <p style={emptyStyle}>
          No mechanisms surfaced in this codebase. This is a valid result —
          not every codebase has algorithmic spines, architectural elisions,
          or data-structure cleverness worth highlighting. The structural
          graph and the business-domain view remain available.
        </p>
      </div>
    );
  }

  const orderedKinds: MechanismKind[] = [
    "algorithmic",
    "data-structure",
    "protocol",
    "architectural",
    "architectural-elision",
  ];

  return (
    <div style={panelStyle}>
      <h2 style={headerStyle}>Mechanisms</h2>
      <p style={subtitleStyle}>
        {mechanismGraph.mechanisms.length} mechanism
        {mechanismGraph.mechanisms.length === 1 ? "" : "s"} discovered in{" "}
        {mechanismGraph.project.name}.
      </p>
      {orderedKinds.map((kind) => {
        const items = grouped.get(kind);
        if (!items || items.length === 0) return null;
        return (
          <section key={kind} style={{ marginBottom: 24 }}>
            <h3 style={kindHeaderStyle}>{kindLabel(kind)}</h3>
            {items.map((m) => (
              <MechanismCard key={m.id} mechanism={m} onOpen={openWalkthrough} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function MechanismCard({
  mechanism,
  onOpen,
}: {
  mechanism: Mechanism;
  onOpen: (w: NonNullable<Mechanism["walkthrough"]>) => void;
}) {
  return (
    <article style={cardStyle}>
      <h4 style={cardTitleStyle}>{mechanism.name}</h4>
      <p style={cardPremiseStyle}>{mechanism.premise}</p>
      <p style={cardRecognitionStyle}>
        <em>{mechanism.candidateRecognition}</em>
      </p>
      <div style={cardFooterStyle}>
        <code style={cardIdStyle}>{mechanism.id}</code>
        {mechanism.walkthrough ? (
          <button
            onClick={() => onOpen(mechanism.walkthrough!)}
            style={readButtonStyle}
          >
            Read walkthrough →
          </button>
        ) : (
          <span style={hintStyle}>
            <code>/understand-walkthrough {mechanism.id}</code>
          </span>
        )}
      </div>
    </article>
  );
}

function kindLabel(kind: MechanismKind): string {
  return (
    {
      algorithmic: "Algorithmic spines",
      architectural: "Architectural mechanisms",
      "architectural-elision": "Architectural elisions",
      protocol: "Cross-process protocols",
      "data-structure": "Data-structure cleverness",
    } as Record<MechanismKind, string>
  )[kind];
}

const panelStyle: React.CSSProperties = {
  padding: "16px",
  overflowY: "auto",
  height: "100%",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
const headerStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "1.2rem",
  fontWeight: 600,
};
const subtitleStyle: React.CSSProperties = {
  margin: "0 0 20px",
  fontSize: "0.85rem",
  color: "var(--ink-mute, #6a5a48)",
  fontStyle: "italic",
};
const emptyStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  color: "var(--ink-mute, #6a5a48)",
  lineHeight: 1.5,
};
const kindHeaderStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  color: "var(--accent, #7a2519)",
  fontWeight: 600,
};
const cardStyle: React.CSSProperties = {
  padding: "12px 16px",
  marginBottom: 12,
  background: "var(--paper, #f9f4e7)",
  border: "1px solid var(--rule, #d5c7a4)",
  borderRadius: 3,
};
const cardTitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: "1.05rem",
  fontWeight: 600,
};
const cardPremiseStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: "0.88rem",
  lineHeight: 1.5,
  color: "var(--ink, #1c1611)",
};
const cardRecognitionStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: "0.85rem",
  lineHeight: 1.45,
  color: "var(--ink-soft, #3a2e23)",
};
const cardFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
const cardIdStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--ink-faint, #978670)",
  fontFamily: 'ui-monospace, Menlo, monospace',
};
const readButtonStyle: React.CSSProperties = {
  background: "var(--accent, #7a2519)",
  color: "#f9f4e7",
  border: "none",
  borderRadius: 2,
  padding: "5px 10px",
  fontSize: "0.78rem",
  fontWeight: 500,
  cursor: "pointer",
  letterSpacing: "0.04em",
};
const hintStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--ink-faint, #978670)",
  fontStyle: "italic",
};
