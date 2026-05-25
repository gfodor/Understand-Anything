import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * Full-screen modal reader for a Walkthrough.
 *
 * Layout: scrolling prose on the left, sticky code pane on the right.
 * As scenes scroll past, the right pane cross-fades to the active
 * scene's code excerpt — same pattern as the standalone HTML
 * walkthroughs in ~/portal/vignettes/.
 *
 * Source is fetched live via /file-content.json (sliced to lineRange).
 * The fetch is cached per file path; we never re-fetch the same source.
 */

// Resolve the same access token the app uses for /knowledge-graph.json etc.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const SESSION_TOKEN_KEY = "understand-anything-token";

function tokenizedUrl(fileName: string, query: Record<string, string> = {}): string {
  if (DEMO_MODE) return `/${fileName}`;
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  const params = new URLSearchParams({ ...query, token });
  return `/${fileName}?${params.toString()}`;
}

interface SourceFile {
  path: string;
  language: string;
  content: string;
  lines: string[];
  sizeBytes: number;
}

interface FetchState {
  status: "loading" | "ok" | "error";
  file?: SourceFile;
  error?: string;
}

export function WalkthroughReader() {
  const open = useDashboardStore((s) => s.walkthroughOpen);
  const walkthrough = useDashboardStore((s) => s.activeWalkthrough);
  const close = useDashboardStore((s) => s.closeWalkthrough);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Reset scroll on each new walkthrough
  useEffect(() => {
    if (open && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
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
        ref={scrollContainerRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper, #f9f4e7)",
          color: "var(--ink, #1c1611)",
          width: "min(1280px, 100%)",
          height: "100%",
          borderRadius: "4px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
          overflowY: "auto",
          overflowX: "hidden",
          fontFamily:
            '"Source Serif 4", "Source Serif Pro", Georgia, serif',
          lineHeight: 1.62,
          position: "relative",
        }}
      >
        <CloseButton onClose={close} />
        <Masthead walkthrough={walkthrough} />
        <Opening walkthrough={walkthrough} />
        <ScenesWithStickyCode
          walkthrough={walkthrough}
          scrollContainer={scrollContainerRef}
        />
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
          lineHeight: 1.45,
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
        padding: "40px 64px 8px",
        maxWidth: "720px",
        fontSize: "1.1rem",
        lineHeight: 1.7,
      }}
    >
      <p
        style={{
          margin: "0 0 1.2em",
          textWrap: "pretty" as React.CSSProperties["textWrap"],
        }}
      >
        <span
          style={{
            float: "left",
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: "3.4em",
            lineHeight: 0.92,
            padding: "0.05em 0.12em 0 0",
            color: "var(--accent, #7a2519)",
          }}
        >
          {walkthrough.opening.problem.charAt(0)}
        </span>
        {walkthrough.opening.problem.slice(1)}
      </p>
      <p style={{ margin: "0 0 1.2em" }}>{walkthrough.opening.tease}</p>
      <p style={{ margin: 0 }}>{walkthrough.opening.concreteInstance}</p>
    </section>
  );
}

/**
 * Heart of the reader. Two columns:
 *   - left: scrolling prose for each scene
 *   - right: sticky pane with all unique code excerpts stacked
 *     absolutely. The one whose scene is currently in view fades in;
 *     others fade out.
 *
 * The fade is driven by an IntersectionObserver against the modal's
 * own scroll container.
 */
function ScenesWithStickyCode({
  walkthrough,
  scrollContainer,
}: {
  walkthrough: Walkthrough;
  scrollContainer: React.MutableRefObject<HTMLDivElement | null>;
}) {
  // Build the list of unique excerpts (so identical path+lineRange
  // sharing across scenes only appears once in the stack).
  const excerptKey = (e: NonNullable<WalkthroughScene["codeExcerpt"]>) =>
    `${e.path}::${e.lineRange[0]}-${e.lineRange[1]}`;

  const uniqueExcerpts = useMemo(() => {
    const seen = new Map<string, NonNullable<WalkthroughScene["codeExcerpt"]>>();
    for (const scene of walkthrough.scenes) {
      if (!scene.codeExcerpt) continue;
      const k = excerptKey(scene.codeExcerpt);
      if (!seen.has(k)) seen.set(k, scene.codeExcerpt);
    }
    return Array.from(seen.entries()).map(([k, excerpt]) => ({ key: k, excerpt }));
  }, [walkthrough]);

  // For each scene that has a code excerpt, which excerpt key does it map to?
  const sceneToExcerptKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const scene of walkthrough.scenes) {
      if (scene.codeExcerpt) {
        m.set(scene.id, excerptKey(scene.codeExcerpt));
      }
    }
    return m;
  }, [walkthrough]);

  // Fetch each unique source file once. Cache by path.
  const [files, setFiles] = useState<Record<string, FetchState>>({});
  useEffect(() => {
    const paths = Array.from(new Set(uniqueExcerpts.map((e) => e.excerpt.path)));
    let cancelled = false;
    for (const p of paths) {
      if (files[p]) continue; // already loading or loaded
      setFiles((prev) =>
        prev[p] ? prev : { ...prev, [p]: { status: "loading" } }
      );
      fetch(tokenizedUrl("file-content.json", { path: p }))
        .then(async (res) => {
          if (cancelled) return;
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            setFiles((prev) => ({
              ...prev,
              [p]: {
                status: "error",
                error: errBody.error || `HTTP ${res.status}`,
              },
            }));
            return;
          }
          const data = await res.json();
          if (cancelled) return;
          const content = typeof data.content === "string" ? data.content : "";
          setFiles((prev) => ({
            ...prev,
            [p]: {
              status: "ok",
              file: {
                path: data.path || p,
                language: data.language || "text",
                content,
                lines: content.split("\n"),
                sizeBytes: data.sizeBytes || 0,
              },
            },
          }));
        })
        .catch((err) => {
          if (cancelled) return;
          setFiles((prev) => ({
            ...prev,
            [p]: { status: "error", error: String(err) },
          }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueExcerpts]);

  // Track which scene is currently "active" — the topmost scene whose
  // top crosses our trigger band. We watch all scenes that have a code
  // excerpt (scenes without one keep the previous excerpt visible).
  const sceneRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const [activeExcerptKey, setActiveExcerptKey] = useState<string | null>(
    () => (uniqueExcerpts[0]?.key ?? null)
  );

  const observeScene = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sceneRefs.current.set(id, el);
    else sceneRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const root = scrollContainer.current;
    if (!root) return;
    const scenesWithCode = walkthrough.scenes.filter((s) => s.codeExcerpt);
    if (scenesWithCode.length === 0) return;

    // The "active" scene is whichever has its top closest to the upper
    // third of the scroll container. Using rootMargin pulls the trigger
    // band up so the active code reflects what the reader is *reading*,
    // not what's about to enter.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible.length === 0) return;
        const top = visible[0];
        const sceneId = (top.target as HTMLElement).dataset.sceneId;
        if (!sceneId) return;
        const key = sceneToExcerptKey.get(sceneId);
        if (key) setActiveExcerptKey(key);
      },
      {
        root,
        rootMargin: "-30% 0px -55% 0px",
        threshold: 0,
      }
    );

    for (const scene of scenesWithCode) {
      const el = sceneRefs.current.get(scene.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkthrough, sceneToExcerptKey, scrollContainer.current]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          uniqueExcerpts.length > 0
            ? "minmax(0, 1.05fr) minmax(0, 1fr)"
            : "1fr",
        gap: "32px",
        padding: "16px 64px 16px",
        alignItems: "start",
      }}
    >
      <div>
        {walkthrough.scenes.map((scene, i) => (
          <SceneProse
            key={scene.id}
            scene={scene}
            index={i + 1}
            pullQuote={walkthrough.pullQuote}
            registerRef={observeScene}
          />
        ))}
      </div>
      {uniqueExcerpts.length > 0 && (
        <StickyCodePane
          excerpts={uniqueExcerpts}
          activeExcerptKey={activeExcerptKey}
          files={files}
        />
      )}
    </div>
  );
}

function SceneProse({
  scene,
  index,
  pullQuote,
  registerRef,
}: {
  scene: WalkthroughScene;
  index: number;
  pullQuote?: string;
  registerRef: (id: string, el: HTMLElement | null) => void;
}) {
  return (
    <article
      ref={(el) => registerRef(scene.id, el)}
      data-scene-id={scene.id}
      style={{
        maxWidth: "44rem",
        marginBottom: "44px",
        padding: scene.isClimax ? "32px 0" : 0,
        borderTop: scene.isClimax
          ? "1px solid var(--accent, #7a2519)"
          : "none",
        borderBottom: scene.isClimax
          ? "1px solid var(--accent, #7a2519)"
          : "none",
        scrollMarginTop: "30vh",
      }}
    >
      <div
        style={{
          fontFamily:
            '"IBM Plex Mono", ui-monospace, Menlo, monospace',
          fontSize: "0.78rem",
          color: "var(--ink-faint, #978670)",
          marginBottom: "10px",
        }}
      >
        § {index}
      </div>
      <div
        className="walkthrough-prose"
        style={{ lineHeight: 1.65, fontSize: "1.05rem" }}
      >
        <ReactMarkdown>{scene.prose}</ReactMarkdown>
      </div>
      {scene.isClimax && pullQuote && (
        <blockquote
          style={{
            fontSize: "1.4rem",
            lineHeight: 1.4,
            fontWeight: 500,
            color: "var(--ink, #1c1611)",
            margin: "28px 0 8px",
            padding: "24px 0",
            borderTop: "1px solid var(--rule, #d5c7a4)",
            borderBottom: "1px solid var(--rule, #d5c7a4)",
            textWrap: "balance" as React.CSSProperties["textWrap"],
          }}
        >
          {pullQuote}
        </blockquote>
      )}
      {scene.embed && <EmbedCard embed={scene.embed} />}
    </article>
  );
}

function StickyCodePane({
  excerpts,
  activeExcerptKey,
  files,
}: {
  excerpts: { key: string; excerpt: NonNullable<WalkthroughScene["codeExcerpt"]> }[];
  activeExcerptKey: string | null;
  files: Record<string, FetchState>;
}) {
  return (
    <aside
      style={{
        position: "sticky",
        top: "12px",
        height: "calc(100vh - 96px)",
        minHeight: "32rem",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          background: "var(--paper-recess, #ebe2cb)",
          border: "1px solid var(--rule, #d5c7a4)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        {excerpts.map(({ key, excerpt }) => {
          const fileState = files[excerpt.path];
          const isActive = key === activeExcerptKey;
          return (
            <ExcerptStack
              key={key}
              excerpt={excerpt}
              fileState={fileState}
              isActive={isActive}
            />
          );
        })}
      </div>
    </aside>
  );
}

function ExcerptStack({
  excerpt,
  fileState,
  isActive,
}: {
  excerpt: NonNullable<WalkthroughScene["codeExcerpt"]>;
  fileState: FetchState | undefined;
  isActive: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: isActive ? 1 : 0,
        transform: isActive ? "translateY(0)" : "translateY(14px)",
        transition:
          "opacity 720ms cubic-bezier(0.16, 1, 0.3, 1), transform 720ms cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: isActive ? "auto" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid var(--rule, #d5c7a4)",
          background: "var(--bg-deep, #ecdfca)",
          fontFamily:
            '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif',
          fontSize: "0.7rem",
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-mute, #6a5a48)",
          flexShrink: 0,
        }}
      >
        <span>{excerpt.path}</span>
        <span
          style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
            letterSpacing: 0,
            textTransform: "none",
            color: "var(--ink-faint, #978670)",
          }}
        >
          {excerpt.lineRange[0]}–{excerpt.lineRange[1]}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <CodeContent excerpt={excerpt} fileState={fileState} />
      </div>
    </div>
  );
}

function CodeContent({
  excerpt,
  fileState,
}: {
  excerpt: NonNullable<WalkthroughScene["codeExcerpt"]>;
  fileState: FetchState | undefined;
}) {
  if (!fileState || fileState.status === "loading") {
    return (
      <div style={{ padding: "16px", color: "var(--ink-faint, #978670)", fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace', fontSize: "0.82rem" }}>
        Loading {excerpt.path}…
      </div>
    );
  }
  if (fileState.status === "error" || !fileState.file) {
    return (
      <div style={{ padding: "16px", color: "var(--accent, #7a2519)", fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace', fontSize: "0.82rem" }}>
        Could not load {excerpt.path}
        {fileState?.error ? ` — ${fileState.error}` : ""}
      </div>
    );
  }
  const { lines, language } = fileState.file;
  const [start, end] = excerpt.lineRange;
  // Clamp to file bounds (1-indexed line range from the schema)
  const clampStart = Math.max(1, Math.min(start, lines.length));
  const clampEnd = Math.max(clampStart, Math.min(end, lines.length));
  const slice = lines.slice(clampStart - 1, clampEnd);
  const code = slice.join("\n");
  const startLineForDisplay = clampStart;
  const highlightLine = excerpt.highlightLine;

  return (
    <Highlight
      theme={themes.vsLight}
      code={code}
      language={(excerpt.language || language || "javascript") as never}
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={className}
          style={{
            ...style,
            background: "transparent",
            margin: 0,
            padding: "12px 16px",
            fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
            fontSize: "0.82rem",
            lineHeight: 1.55,
          }}
        >
          {tokens.map((line, i) => {
            const absLine = startLineForDisplay + i;
            const isHighlight = highlightLine !== undefined && absLine === highlightLine;
            const lineProps = getLineProps({ line });
            return (
              <div
                key={i}
                {...lineProps}
                style={{
                  ...(lineProps.style as React.CSSProperties),
                  display: "flex",
                  background: isHighlight
                    ? "rgba(122, 37, 25, 0.10)"
                    : "transparent",
                  borderLeft: isHighlight
                    ? "2px solid var(--accent, #7a2519)"
                    : "2px solid transparent",
                  paddingLeft: "8px",
                  marginLeft: "-8px",
                }}
              >
                <span
                  style={{
                    width: "3em",
                    flexShrink: 0,
                    textAlign: "right",
                    paddingRight: "12px",
                    color: "var(--ink-faint, #978670)",
                    userSelect: "none",
                    opacity: 0.7,
                  }}
                >
                  {absLine}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}

function EmbedCard({ embed }: { embed: WalkthroughScene["embed"] }) {
  if (!embed) return null;
  if (embed.kind === "beat") return <BeatCard beat={embed} />;
  if (embed.kind === "focal") return <FocalCard focal={embed} />;
  return <SimCard sim={embed} />;
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
            '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif',
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

function BeatCard({ beat }: { beat: BeatPlaceholder }) {
  const accent = "var(--accent, #7a2519)";
  const accentSoft = "var(--accent-soft, #a04738)";
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
              background:
                i === beat.answerIndex ? "rgba(122, 37, 25, 0.08)" : "white",
              border:
                i === beat.answerIndex
                  ? `1px solid ${accent}`
                  : "1px solid var(--rule, #d5c7a4)",
              borderRadius: "2px",
              padding: "8px 12px",
              fontFamily:
                '"IBM Plex Mono", ui-monospace, Menlo, monospace',
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
            '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif',
          fontSize: "0.85rem",
          fontStyle: "italic",
          color: "var(--ink-mute, #6a5a48)",
        }}
      >
        <strong
          style={{ color: accentSoft, fontStyle: "normal", fontWeight: 600 }}
        >
          Reveal:
        </strong>{" "}
        {beat.reveal}
      </p>
    </CardShell>
  );
}

function FocalCard({ focal }: { focal: FocalPlaceholder }) {
  return (
    <CardShell label={`Focal · ${focal.template}`}>
      <p
        style={{
          margin: 0,
          fontStyle: "italic",
          color: "var(--ink-soft, #3a2e23)",
        }}
      >
        {focal.description}
      </p>
      {focal.parameters && <ParamsList params={focal.parameters} />}
    </CardShell>
  );
}

function SimCard({ sim }: { sim: SimPlaceholder }) {
  return (
    <CardShell label={`Simulation · ${sim.template}`}>
      <p
        style={{
          margin: 0,
          fontStyle: "italic",
          color: "var(--ink-soft, #3a2e23)",
        }}
      >
        {sim.description}
      </p>
      {sim.parameters && <ParamsList params={sim.parameters} />}
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
          '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif',
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
              fontFamily:
                '"IBM Plex Mono", ui-monospace, Menlo, monospace',
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
        padding: "8px 64px 64px",
        maxWidth: "880px",
      }}
    >
      <div
        style={{
          fontSize: "1.1rem",
          lineHeight: 1.65,
          margin: "32px 0 48px",
          maxWidth: "44rem",
          textWrap: "pretty" as React.CSSProperties["textWrap"],
        }}
      >
        <p style={{ margin: 0 }}>{walkthrough.coda.summary}</p>
      </div>
      {walkthrough.coda.prompts.length > 0 && (
        <>
          <div
            style={{
              fontFamily:
                '"IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif',
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--ink-mute, #6a5a48)",
              fontWeight: 600,
              borderTop: "1px solid var(--rule, #d5c7a4)",
              paddingTop: "20px",
              marginBottom: "16px",
            }}
          >
            Review · {walkthrough.coda.prompts.length} prompt
            {walkthrough.coda.prompts.length === 1 ? "" : "s"}
          </div>
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
                <p style={{ margin: 0, lineHeight: 1.5 }}>{p.question}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </footer>
  );
}
