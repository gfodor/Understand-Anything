import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Highlight, themes } from "prism-react-renderer";
import { useDashboardStore } from "../store";
import type {
  Walkthrough,
  WalkthroughScene,
  BeatPlaceholder,
  FocalPlaceholder,
  SimPlaceholder,
} from "@understand-anything/core/types";

/**
 * Full-screen modal reader for a Walkthrough. Distinct from the
 * sidebar-mounted LearnPanel (which shows breadth-first Tours). This
 * surface is wide enough for Ciechanowski-style prose+code reading.
 *
 * Layout: two-column (prose left, code right). On narrow viewports the
 * columns stack. Closes on Escape or backdrop click.
 */
export function WalkthroughReader() {
  const open = useDashboardStore((s) => s.walkthroughOpen);
  const walkthrough = useDashboardStore((s) => s.activeWalkthrough);
  const close = useDashboardStore((s) => s.closeWalkthrough);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Restore scroll position to top when a new walkthrough opens
  useEffect(() => {
    if (open && modalRef.current) {
      modalRef.current.scrollTop = 0;
    }
  }, [open, walkthrough?.attachedTo.id]);

  if (!open || !walkthrough) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Walkthrough: ${walkthrough.title}`}
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 18, 22, 0.78)",
        zIndex: 1000,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper, #f9f4e7)",
          color: "var(--ink, #1c1611)",
          width: "min(1280px, 100%)",
          height: "100%",
          borderRadius: "4px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
          overflowY: "auto",
          fontFamily:
            '"Source Serif 4", "Source Serif Pro", Georgia, serif',
          lineHeight: 1.62,
          position: "relative",
        }}
      >
        <CloseButton onClose={close} />
        <Masthead walkthrough={walkthrough} />
        <Opening walkthrough={walkthrough} />
        <ScenesList scenes={walkthrough.scenes} pullQuote={walkthrough.pullQuote} />
        <Coda walkthrough={walkthrough} />
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Close walkthrough"
      style={{
        position: "sticky",
        top: "12px",
        left: "calc(100% - 60px)",
        marginLeft: "auto",
        marginRight: "12px",
        zIndex: 10,
        background: "rgba(28, 22, 17, 0.85)",
        color: "#f9f4e7",
        border: "none",
        borderRadius: "20px",
        width: "36px",
        height: "36px",
        cursor: "pointer",
        fontSize: "18px",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      ×
    </button>
  );
}

function Masthead({ walkthrough }: { walkthrough: Walkthrough }) {
  return (
    <header
      style={{
        padding: "48px 64px 24px",
        borderBottom: "1px solid var(--rule, #d5c7a4)",
        maxWidth: "880px",
      }}
    >
      <div
        style={{
          fontFamily:
            '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif',
          fontSize: "0.72rem",
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--accent, #7a2519)",
          marginBottom: "12px",
        }}
      >
        Walkthrough · {walkthrough.attachedTo.kind} ·{" "}
        {walkthrough.shape === "recognition" ? "recognition" : "process"}
      </div>
      <h1
        style={{
          fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
          lineHeight: 0.98,
          letterSpacing: "-0.02em",
          fontWeight: 600,
          margin: "0 0 16px",
        }}
      >
        {walkthrough.title}
      </h1>
      <p
        style={{
          fontStyle: "italic",
          fontSize: "1.2rem",
          color: "var(--ink-soft, #3a2e23)",
          maxWidth: "44rem",
          margin: 0,
        }}
      >
        {walkthrough.subtitle}
      </p>
    </header>
  );
}

function Opening({ walkthrough }: { walkthrough: Walkthrough }) {
  return (
    <section
      style={{
        padding: "32px 64px",
        maxWidth: "720px",
        fontSize: "1.05rem",
      }}
    >
      <SectionLabel>The problem</SectionLabel>
      <p style={{ marginTop: 0 }}>{walkthrough.opening.problem}</p>
      <SectionLabel>The tease</SectionLabel>
      <p>{walkthrough.opening.tease}</p>
      <SectionLabel>The concrete instance</SectionLabel>
      <p style={{ marginBottom: 0 }}>{walkthrough.opening.concreteInstance}</p>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily:
          '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif',
        fontSize: "0.72rem",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink-mute, #6a5a48)",
        fontWeight: 600,
        marginTop: "24px",
        marginBottom: "8px",
      }}
    >
      {children}
    </div>
  );
}

function ScenesList({
  scenes,
  pullQuote,
}: {
  scenes: WalkthroughScene[];
  pullQuote?: string;
}) {
  return (
    <section style={{ padding: "16px 64px 32px" }}>
      {scenes.map((scene, i) => (
        <SceneBlock
          key={scene.id}
          scene={scene}
          index={i + 1}
          pullQuote={pullQuote}
        />
      ))}
    </section>
  );
}

function SceneBlock({
  scene,
  index,
  pullQuote,
}: {
  scene: WalkthroughScene;
  index: number;
  pullQuote?: string;
}) {
  const hasCode = !!scene.codeExcerpt;
  return (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: hasCode ? "minmax(0, 1.05fr) minmax(0, 1fr)" : "1fr",
        gap: "32px",
        marginBottom: "40px",
        padding: scene.isClimax ? "32px 0" : 0,
        borderTop: scene.isClimax ? "1px solid var(--accent, #7a2519)" : "none",
        borderBottom: scene.isClimax ? "1px solid var(--accent, #7a2519)" : "none",
      }}
    >
      <div style={{ maxWidth: "44rem" }}>
        <SectionLabel>
          § {index}
          {scene.isClimax ? " · climax" : ""}
        </SectionLabel>
        <div
          className="walkthrough-prose"
          style={{ marginTop: "8px", lineHeight: 1.65 }}
        >
          <ReactMarkdown>{scene.prose}</ReactMarkdown>
        </div>
        {scene.isClimax && pullQuote && (
          <blockquote
            style={{
              fontSize: "1.3rem",
              lineHeight: 1.4,
              fontWeight: 500,
              color: "var(--ink, #1c1611)",
              margin: "24px 0",
              padding: "20px 0",
              borderTop: "1px solid var(--rule, #d5c7a4)",
              borderBottom: "1px solid var(--rule, #d5c7a4)",
            }}
          >
            {pullQuote}
          </blockquote>
        )}
        {scene.embed && <EmbedCard embed={scene.embed} />}
      </div>
      {hasCode && scene.codeExcerpt && (
        <CodeBlock codeExcerpt={scene.codeExcerpt} />
      )}
    </article>
  );
}

function CodeBlock({
  codeExcerpt,
}: {
  codeExcerpt: NonNullable<WalkthroughScene["codeExcerpt"]>;
}) {
  // The actual source is not delivered with the walkthrough in v1 — the
  // path + line range will be resolved by the dashboard against the
  // /file-content.json endpoint in a future revision. For now we show a
  // labeled placeholder card so the layout is correct.
  return (
    <aside
      style={{
        background: "var(--bg-deep, #ecdfca)",
        border: "1px solid var(--rule, #d5c7a4)",
        borderRadius: "2px",
        padding: "12px 16px",
        fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
        fontSize: "0.82rem",
        color: "var(--ink-soft, #3a2e23)",
        position: "sticky",
        top: "12px",
        alignSelf: "start",
      }}
    >
      <div
        style={{
          fontFamily:
            '"IBM Plex Sans Condensed", system-ui, sans-serif',
          fontSize: "0.7rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-mute, #6a5a48)",
          marginBottom: "8px",
        }}
      >
        {codeExcerpt.path}:{codeExcerpt.lineRange[0]}–{codeExcerpt.lineRange[1]}
      </div>
      <Highlight
        theme={themes.vsLight}
        code={`// Source from ${codeExcerpt.path}\n// Lines ${codeExcerpt.lineRange[0]}–${codeExcerpt.lineRange[1]}\n// (Full source will be fetched via /file-content.json in a later revision.)`}
        language={codeExcerpt.language || "javascript"}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={className}
            style={{ ...style, background: "transparent", margin: 0 }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </aside>
  );
}

function EmbedCard({ embed }: { embed: WalkthroughScene["embed"] }) {
  if (!embed) return null;
  const accent = "var(--accent, #7a2519)";
  const accentSoft = "var(--accent-soft, #a04738)";
  if (embed.kind === "beat") {
    return <BeatCard beat={embed} accent={accent} accentSoft={accentSoft} />;
  }
  if (embed.kind === "focal") {
    return <FocalCard focal={embed} accent={accent} />;
  }
  return <SimCard sim={embed} accent={accent} />;
}

function CardShell({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      style={{
        margin: "20px 0",
        background: "var(--paper, #f9f4e7)",
        border: "1px dashed var(--rule, #d5c7a4)",
        borderRadius: "2px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px dashed var(--rule, #d5c7a4)",
          fontFamily:
            '"IBM Plex Sans Condensed", system-ui, sans-serif',
          fontSize: "0.7rem",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--accent, #7a2519)" }}>
          {label}
        </span>
        {detail && <span style={{ color: "var(--ink-faint, #978670)" }}>{detail}</span>}
      </div>
      <div style={{ padding: "12px 16px" }}>{children}</div>
    </aside>
  );
}

function BeatCard({
  beat,
  accent,
  accentSoft,
}: {
  beat: BeatPlaceholder;
  accent: string;
  accentSoft: string;
}) {
  return (
    <CardShell
      label={`Beat · ${beat.beatType}`}
      detail={beat.windowSeconds ? `${beat.windowSeconds}s window` : undefined}
    >
      <p style={{ fontStyle: "italic", margin: "0 0 12px" }}>{beat.question}</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "8px",
        }}
      >
        {beat.candidates.map((c, i) => (
          <div
            key={i}
            style={{
              background: i === beat.answerIndex ? "rgba(122, 37, 25, 0.08)" : "white",
              border:
                i === beat.answerIndex
                  ? `1px solid ${accent}`
                  : "1px solid var(--rule, #d5c7a4)",
              borderRadius: "2px",
              padding: "8px 12px",
              fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
              fontSize: "0.82rem",
              color: i === beat.answerIndex ? accent : "var(--ink-soft, #3a2e23)",
              textAlign: "center",
            }}
          >
            {c}
          </div>
        ))}
      </div>
      <p
        style={{
          marginTop: "12px",
          fontFamily:
            '"IBM Plex Sans Condensed", system-ui, sans-serif',
          fontSize: "0.85rem",
          fontStyle: "italic",
          color: "var(--ink-mute, #6a5a48)",
        }}
      >
        <strong style={{ color: accentSoft, fontStyle: "normal", fontWeight: 600 }}>
          Reveal:
        </strong>{" "}
        {beat.reveal}
      </p>
    </CardShell>
  );
}

function FocalCard({ focal, accent }: { focal: FocalPlaceholder; accent: string }) {
  return (
    <CardShell label={`Focal · ${focal.template}`}>
      <p style={{ margin: 0, fontStyle: "italic", color: "var(--ink-soft, #3a2e23)" }}>
        {focal.description}
      </p>
      {focal.parameters && (
        <ParamsList params={focal.parameters} />
      )}
    </CardShell>
  );
}

function SimCard({ sim, accent }: { sim: SimPlaceholder; accent: string }) {
  return (
    <CardShell label={`Simulation · ${sim.template}`}>
      <p style={{ margin: 0, fontStyle: "italic", color: "var(--ink-soft, #3a2e23)" }}>
        {sim.description}
      </p>
      {sim.parameters && (
        <ParamsList params={sim.parameters} />
      )}
    </CardShell>
  );
}

function ParamsList({ params }: { params: Record<string, string> }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "max-content 1fr",
        gap: "4px 16px",
        marginTop: "8px",
        fontSize: "0.78rem",
        fontFamily:
          '"IBM Plex Sans Condensed", system-ui, sans-serif',
        color: "var(--ink-soft, #3a2e23)",
      }}
    >
      {Object.entries(params).map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: "0.7rem",
              color: "var(--ink-faint, #978670)",
              fontWeight: 500,
            }}
          >
            {k}
          </dt>
          <dd
            style={{
              margin: 0,
              fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
            }}
          >
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Coda({ walkthrough }: { walkthrough: Walkthrough }) {
  return (
    <footer
      style={{
        padding: "32px 64px 64px",
        borderTop: "1px solid var(--rule, #d5c7a4)",
        maxWidth: "880px",
      }}
    >
      <SectionLabel>In summary</SectionLabel>
      <p style={{ marginTop: 0 }}>{walkthrough.coda.summary}</p>
      <SectionLabel>Review prompts</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "16px",
          marginTop: "8px",
        }}
      >
        {walkthrough.coda.prompts.map((p, i) => (
          <article
            key={i}
            style={{
              background: "var(--paper, #f9f4e7)",
              border: "1px solid var(--rule, #d5c7a4)",
              borderRadius: "2px",
              padding: "12px 16px",
            }}
          >
            <div
              style={{
                fontFamily:
                  '"IBM Plex Sans Condensed", system-ui, sans-serif',
                fontSize: "0.66rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--accent-soft, #a04738)",
                fontWeight: 600,
                marginBottom: "6px",
              }}
            >
              {p.type}
            </div>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{p.question}</p>
          </article>
        ))}
      </div>
    </footer>
  );
}
