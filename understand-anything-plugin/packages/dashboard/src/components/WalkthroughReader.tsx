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
 * Styled to the Understand-Anything theme: deep matte ink with a single
 * warm-tan accent (--color-accent #d4a574). DM Serif Display headings,
 * Inter body, JetBrains Mono code. The active scene is marked by a tan
 * left rule + a faint accent overlay; the climactic scene gets tan
 * hairlines above and below the pull-quote.
 *
 * Layout: scrolling prose on the left, sticky code pane on the right.
 * The active scene is hoverSceneId ?? scrollSceneId; the active excerpt
 * is the scene's codeExcerpt or, for prose-only scenes, the nearest
 * preceding scene's. Excerpts cross-fade in the right pane.
 *
 * Source is fetched live via /file-content.json and sliced to lineRange.
 */

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

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
      className="walkthrough-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 5, 5, 0.86)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        ref={scrollContainerRef}
        onClick={(e) => e.stopPropagation()}
        className="walkthrough-modal"
        style={{
          background: "var(--color-root)",
          color: "var(--color-text-primary)",
          width: "min(1680px, calc(100vw - 32px))",
          height: "100%",
          borderRadius: "8px",
          border: "1px solid var(--color-border-subtle)",
          boxShadow:
            "0 32px 96px rgba(0,0,0,0.6), 0 0 0 1px rgba(212, 165, 116, 0.04)",
          overflowY: "auto",
          overflowX: "hidden",
          fontFamily: "var(--font-sans)",
          lineHeight: 1.6,
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
        top: "16px",
        left: "calc(100% - 56px)",
        marginLeft: "auto",
        marginRight: "16px",
        zIndex: 10,
        background: "var(--glass-bg-heavy)",
        color: "var(--color-text-secondary)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "999px",
        width: "32px",
        height: "32px",
        cursor: "pointer",
        fontSize: "16px",
        fontFamily: "var(--font-mono)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(8px)",
        transition: "color 160ms ease, border-color 160ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-medium)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-subtle)";
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
        padding: "56px 56px 32px",
        borderBottom: "1px solid var(--color-border-subtle)",
        maxWidth: "1020px",
        position: "relative",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "clamp(2.6rem, 5vw, 4rem)",
          lineHeight: 1.02,
          letterSpacing: "-0.015em",
          fontWeight: 400,
          margin: "0 0 20px",
          color: "var(--color-text-primary)",
        }}
      >
        {walkthrough.title}
      </h1>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "1.15rem",
          lineHeight: 1.5,
          fontStyle: "italic",
          color: "var(--color-text-secondary)",
          maxWidth: "44rem",
          margin: 0,
          fontWeight: 300,
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
        padding: "44px 56px 12px",
        maxWidth: "720px",
        fontSize: "1.05rem",
        lineHeight: 1.72,
        color: "var(--color-text-primary)",
      }}
    >
      <p
        style={{
          margin: "0 0 1.2em",
          textWrap: "pretty" as React.CSSProperties["textWrap"],
        }}
      >
        {walkthrough.opening.problem}
      </p>
      <p style={{ margin: "0 0 1.2em", color: "var(--color-text-primary)" }}>
        {walkthrough.opening.tease}
      </p>
      <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
        {walkthrough.opening.concreteInstance}
      </p>
    </section>
  );
}

function ScenesWithStickyCode({
  walkthrough,
  scrollContainer,
}: {
  walkthrough: Walkthrough;
  scrollContainer: React.MutableRefObject<HTMLDivElement | null>;
}) {
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

  const sceneToExcerptKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const scene of walkthrough.scenes) {
      if (scene.codeExcerpt) m.set(scene.id, excerptKey(scene.codeExcerpt));
    }
    return m;
  }, [walkthrough]);

  const resolveExcerptForScene = useCallback(
    (sceneId: string | null): string | null => {
      if (!sceneId) return null;
      const direct = sceneToExcerptKey.get(sceneId);
      if (direct) return direct;
      const scenes = walkthrough.scenes;
      const idx = scenes.findIndex((s) => s.id === sceneId);
      for (let i = idx - 1; i >= 0; i--) {
        const k = sceneToExcerptKey.get(scenes[i].id);
        if (k) return k;
      }
      return uniqueExcerpts[0]?.key ?? null;
    },
    [sceneToExcerptKey, walkthrough.scenes, uniqueExcerpts]
  );

  const [files, setFiles] = useState<Record<string, FetchState>>({});
  useEffect(() => {
    const paths = Array.from(new Set(uniqueExcerpts.map((e) => e.excerpt.path)));
    let cancelled = false;
    for (const p of paths) {
      if (files[p]) continue;
      setFiles((prev) => (prev[p] ? prev : { ...prev, [p]: { status: "loading" } }));
      fetch(tokenizedUrl("file-content.json", { path: p }))
        .then(async (res) => {
          if (cancelled) return;
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            setFiles((prev) => ({
              ...prev,
              [p]: { status: "error", error: errBody.error || `HTTP ${res.status}` },
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
          setFiles((prev) => ({ ...prev, [p]: { status: "error", error: String(err) } }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueExcerpts]);

  const sceneRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const [scrollSceneId, setScrollSceneId] = useState<string | null>(
    () => walkthrough.scenes[0]?.id ?? null
  );
  const [hoverSceneId, setHoverSceneId] = useState<string | null>(null);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const activeSceneId = hoverSceneId ?? scrollSceneId;
  const activeExcerptKey = resolveExcerptForScene(activeSceneId);

  const observeScene = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sceneRefs.current.set(id, el);
    else sceneRefs.current.delete(id);
  }, []);
  const handleSceneHover = useCallback((id: string) => setHoverSceneId(id), []);
  const handleSceneUnhover = useCallback(
    (id: string) => setHoverSceneId((c) => (c === id ? null : c)),
    []
  );

  useEffect(() => {
    const root = scrollContainer.current;
    if (!root) return;
    if (walkthrough.scenes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const sceneId = (visible[0].target as HTMLElement).dataset.sceneId;
        if (sceneId) setScrollSceneId(sceneId);
      },
      { root, rootMargin: "-30% 0px -55% 0px", threshold: 0 }
    );

    for (const scene of walkthrough.scenes) {
      const el = sceneRefs.current.get(scene.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkthrough, scrollContainer.current]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          uniqueExcerpts.length > 0 ? "minmax(0, 1fr) minmax(0, 1.3fr)" : "1fr",
        columnGap: "44px",
        padding: "20px 56px 20px",
      }}
      onMouseLeave={() => setHoverSceneId(null)}
    >
      <div style={{ paddingBottom: "80vh" }}>
        {walkthrough.scenes.map((scene, i) => (
          <SceneProse
            key={scene.id}
            scene={scene}
            index={i + 1}
            pullQuote={walkthrough.pullQuote}
            isActive={scene.id === activeSceneId}
            registerRef={observeScene}
            onHover={handleSceneHover}
            onUnhover={handleSceneUnhover}
            hoveredSymbol={hoveredSymbol}
            setHoveredSymbol={setHoveredSymbol}
          />
        ))}
      </div>
      {uniqueExcerpts.length > 0 && (
        <StickyCodePane
          excerpts={uniqueExcerpts}
          activeExcerptKey={activeExcerptKey}
          files={files}
          hoveredSymbol={hoveredSymbol}
        />
      )}
    </div>
  );
}

function SceneProse({
  scene,
  index,
  pullQuote,
  isActive,
  registerRef,
  onHover,
  onUnhover,
  hoveredSymbol,
  setHoveredSymbol,
}: {
  scene: WalkthroughScene;
  index: number;
  pullQuote?: string;
  isActive: boolean;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onHover: (id: string) => void;
  onUnhover: (id: string) => void;
  hoveredSymbol: string | null;
  setHoveredSymbol: (s: string | null) => void;
}) {
  return (
    <article
      ref={(el) => registerRef(scene.id, el)}
      data-scene-id={scene.id}
      onMouseEnter={() => onHover(scene.id)}
      onMouseLeave={() => onUnhover(scene.id)}
      style={{
        position: "relative",
        maxWidth: "44rem",
        marginBottom: "20px",
        padding: scene.isClimax ? "32px 18px" : "20px 18px",
        marginLeft: "-18px",
        marginRight: "-18px",
        borderTop: scene.isClimax
          ? "1px solid var(--color-accent-overlay-border)"
          : "none",
        borderBottom: scene.isClimax
          ? "1px solid var(--color-accent-overlay-border)"
          : "none",
        borderLeft: isActive
          ? "2px solid var(--color-accent)"
          : "2px solid transparent",
        background: isActive ? "var(--color-accent-overlay-bg)" : "transparent",
        borderRadius: "3px",
        transition:
          "background-color 220ms ease, border-color 220ms ease",
        scrollMarginTop: "30vh",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.08em",
          color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
          marginBottom: "12px",
          transition: "color 220ms ease",
        }}
      >
        § {String(index).padStart(2, "0")}
      </div>
      <div
        className="walkthrough-prose"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "1.0rem",
          lineHeight: 1.7,
          color: "var(--color-text-primary)",
        }}
      >
        <ReactMarkdown
          components={{
            code: ({ children, ...props }) => (
              <SymbolMark
                hoveredSymbol={hoveredSymbol}
                setHoveredSymbol={setHoveredSymbol}
                {...props}
              >
                {children}
              </SymbolMark>
            ),
            p: ({ children }) => (
              <p style={{ margin: "0 0 1.05em" }}>{children}</p>
            ),
            strong: ({ children }) => (
              <strong
                style={{ fontWeight: 600, color: "var(--color-text-primary)" }}
              >
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em
                style={{
                  fontStyle: "italic",
                  color: "var(--color-text-primary)",
                }}
              >
                {children}
              </em>
            ),
          }}
        >
          {scene.prose}
        </ReactMarkdown>
      </div>
      {scene.isClimax && pullQuote && (
        <blockquote
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.55rem",
            lineHeight: 1.32,
            fontWeight: 400,
            color: "var(--color-accent)",
            margin: "28px 0 8px",
            padding: "0",
            textWrap: "balance" as React.CSSProperties["textWrap"],
            letterSpacing: "-0.005em",
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
  hoveredSymbol,
}: {
  excerpts: { key: string; excerpt: NonNullable<WalkthroughScene["codeExcerpt"]> }[];
  activeExcerptKey: string | null;
  files: Record<string, FetchState>;
  hoveredSymbol: string | null;
}) {
  return (
    <aside>
      <div
        style={{
          position: "sticky",
          top: "16px",
          height: "calc(100vh - 96px)",
          minHeight: "32rem",
          background: "var(--color-panel)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "6px",
          overflow: "hidden",
          boxShadow: "inset 0 0 0 1px rgba(212, 165, 116, 0.02)",
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
              hoveredSymbol={hoveredSymbol}
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
  hoveredSymbol,
}: {
  excerpt: NonNullable<WalkthroughScene["codeExcerpt"]>;
  fileState: FetchState | undefined;
  isActive: boolean;
  hoveredSymbol: string | null;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: isActive ? 1 : 0,
        transform: isActive ? "translateY(0)" : "translateY(10px)",
        transition:
          "opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
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
          padding: "12px 18px",
          borderBottom: "1px solid var(--color-border-subtle)",
          background: "var(--color-elevated)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.04em",
          color: "var(--color-text-muted)",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--color-text-secondary)" }}>{excerpt.path}</span>
        <span style={{ color: "var(--color-text-muted)" }}>
          {excerpt.lineRange[0]}–{excerpt.lineRange[1]}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <CodeContent excerpt={excerpt} fileState={fileState} hoveredSymbol={hoveredSymbol} />
      </div>
    </div>
  );
}

function CodeContent({
  excerpt,
  fileState,
  hoveredSymbol,
}: {
  excerpt: NonNullable<WalkthroughScene["codeExcerpt"]>;
  fileState: FetchState | undefined;
  hoveredSymbol: string | null;
}) {
  if (!fileState || fileState.status === "loading") {
    return (
      <div
        style={{
          padding: "20px",
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.78rem",
        }}
      >
        Loading {excerpt.path}…
      </div>
    );
  }
  if (fileState.status === "error" || !fileState.file) {
    return (
      <div
        style={{
          padding: "20px",
          color: "var(--color-accent)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.78rem",
        }}
      >
        Could not load {excerpt.path}
        {fileState?.error ? ` — ${fileState.error}` : ""}
      </div>
    );
  }
  const { lines, language } = fileState.file;
  const [start, end] = excerpt.lineRange;
  const clampStart = Math.max(1, Math.min(start, lines.length));
  const clampEnd = Math.max(clampStart, Math.min(end, lines.length));
  const slice = lines.slice(clampStart - 1, clampEnd);
  const code = slice.join("\n");
  const startLineForDisplay = clampStart;
  const highlightLine = excerpt.highlightLine;

  return (
    <Highlight
      theme={themes.vsDark}
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
            padding: "16px 18px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            lineHeight: 1.6,
            color: "var(--color-text-primary)",
          }}
        >
          {tokens.map((line, i) => {
            const absLine = startLineForDisplay + i;
            const isAuthoredHighlight =
              highlightLine !== undefined && absLine === highlightLine;
            const rawLineText = slice[i] ?? "";
            const isSymbolHighlight =
              hoveredSymbol !== null &&
              hoveredSymbol.length > 0 &&
              new RegExp(
                `(^|[^A-Za-z0-9_])${escapeRegExp(hoveredSymbol)}([^A-Za-z0-9_]|$)`
              ).test(rawLineText);
            const isHighlight = isAuthoredHighlight || isSymbolHighlight;
            const lineProps = getLineProps({ line });
            return (
              <div
                key={i}
                {...lineProps}
                style={{
                  ...(lineProps.style as React.CSSProperties),
                  display: "flex",
                  background: isAuthoredHighlight
                    ? "rgba(212, 165, 116, 0.10)"
                    : isSymbolHighlight
                      ? "rgba(212, 165, 116, 0.06)"
                      : "transparent",
                  borderLeft: isHighlight
                    ? "2px solid var(--color-accent)"
                    : "2px solid transparent",
                  paddingLeft: "10px",
                  marginLeft: "-10px",
                  transition: "background-color 180ms ease",
                }}
              >
                <span
                  style={{
                    width: "3em",
                    flexShrink: 0,
                    textAlign: "right",
                    paddingRight: "14px",
                    color: "var(--color-text-muted)",
                    userSelect: "none",
                    opacity: 0.5,
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function SymbolMark({
  children,
  hoveredSymbol,
  setHoveredSymbol,
}: {
  children: React.ReactNode;
  hoveredSymbol: string | null;
  setHoveredSymbol: (s: string | null) => void;
}) {
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.filter((c) => typeof c === "string").join("")
        : "";
  const symbol = text.trim();
  const isHovered = hoveredSymbol === symbol && symbol.length > 0;

  return (
    <code
      onMouseEnter={() => symbol && setHoveredSymbol(symbol)}
      onMouseLeave={() => setHoveredSymbol(null)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.9em",
        background: isHovered
          ? "rgba(212, 165, 116, 0.18)"
          : "rgba(212, 165, 116, 0.07)",
        color: isHovered
          ? "var(--color-accent-bright)"
          : "var(--color-accent-dim)",
        padding: "1px 6px",
        borderRadius: "3px",
        cursor: "default",
        border: isHovered
          ? "1px solid var(--color-accent)"
          : "1px solid transparent",
        transition: "background-color 160ms ease, color 160ms ease, border-color 160ms ease",
      }}
    >
      {children}
    </code>
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
        margin: "22px 0",
        background: "var(--color-elevated)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--color-border-subtle)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.68rem",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{ fontWeight: 500, color: "var(--color-accent)" }}
        >
          {label}
        </span>
        {detail && (
          <span style={{ color: "var(--color-text-muted)" }}>{detail}</span>
        )}
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </aside>
  );
}

function BeatCard({ beat }: { beat: BeatPlaceholder }) {
  return (
    <CardShell
      label={`Beat · ${beat.beatType}`}
      detail={beat.windowSeconds ? `${beat.windowSeconds}s` : undefined}
    >
      <p
        style={{
          fontStyle: "italic",
          margin: "0 0 14px",
          color: "var(--color-text-primary)",
        }}
      >
        {beat.question}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "8px",
        }}
      >
        {beat.candidates.map((c, i) => {
          const correct = i === beat.answerIndex;
          return (
            <div
              key={i}
              style={{
                background: correct
                  ? "var(--color-accent-overlay-bg)"
                  : "var(--color-surface)",
                border: correct
                  ? "1px solid var(--color-accent-overlay-border)"
                  : "1px solid var(--color-border-subtle)",
                borderRadius: "3px",
                padding: "8px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                color: correct
                  ? "var(--color-accent-bright)"
                  : "var(--color-text-secondary)",
                textAlign: "center",
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
      <p
        style={{
          marginTop: "14px",
          fontSize: "0.85rem",
          fontStyle: "italic",
          color: "var(--color-text-secondary)",
        }}
      >
        <strong
          style={{
            color: "var(--color-accent)",
            fontStyle: "normal",
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginRight: "8px",
          }}
        >
          Reveal
        </strong>
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
          color: "var(--color-text-secondary)",
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
          color: "var(--color-text-secondary)",
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
        marginTop: "10px",
        fontSize: "0.78rem",
        fontFamily: "var(--font-mono)",
        color: "var(--color-text-secondary)",
      }}
    >
      {Object.entries(params).map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: "0.68rem",
              color: "var(--color-text-muted)",
              fontWeight: 500,
            }}
          >
            {k}
          </dt>
          <dd style={{ margin: 0 }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Coda({ walkthrough }: { walkthrough: Walkthrough }) {
  return (
    <footer
      style={{
        padding: "8px 56px 80px",
        maxWidth: "1020px",
      }}
    >
      <div
        style={{
          fontSize: "1.05rem",
          lineHeight: 1.7,
          margin: "32px 0 56px",
          maxWidth: "44rem",
          color: "var(--color-text-primary)",
          textWrap: "pretty" as React.CSSProperties["textWrap"],
        }}
      >
        <p style={{ margin: 0 }}>{walkthrough.coda.summary}</p>
      </div>
      {walkthrough.coda.prompts.length > 0 && (
        <>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              borderTop: "1px solid var(--color-border-subtle)",
              paddingTop: "24px",
              marginBottom: "20px",
              display: "flex",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--color-accent)" }}>Review</span>
            <span style={{ opacity: 0.5 }}>
              {walkthrough.coda.prompts.length} prompt
              {walkthrough.coda.prompts.length === 1 ? "" : "s"}
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {walkthrough.coda.prompts.map((p, i) => (
              <article
                key={i}
                style={{
                  background: "var(--color-elevated)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "4px",
                  padding: "14px 18px",
                  transition: "border-color 200ms ease",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    lineHeight: 1.55,
                    color: "var(--color-text-primary)",
                    fontSize: "0.94rem",
                  }}
                >
                  {p.question}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
    </footer>
  );
}
