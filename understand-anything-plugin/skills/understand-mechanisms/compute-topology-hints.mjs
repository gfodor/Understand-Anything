#!/usr/bin/env node
/**
 * compute-topology-hints.mjs
 *
 * Pure derivation from .understand-anything/knowledge-graph.json. Produces
 * attention-direction hints for the mechanism-analyzer agent. The agent is
 * not bound to the hints — they direct where to look first; the agent's
 * judgment over the codebase dominates.
 *
 * General signals (not tuned to any specific test set):
 *   1. self-described — files referenced in README/architecture-docs
 *   2. fan-in/out outliers — small-but-heavily-depended-on, large bridges
 *   3. dense clusters — small groups with high mutual edge density
 *   4. architectural bridge nodes — nodes spanning upper & lower layers
 *   5. comment-content signals — non-obvious-marker phrases in summaries
 *   6. small files with high reference density — load-bearing primitives
 *   7. TODO / design-decision comments
 *
 * Usage:
 *   node compute-topology-hints.mjs <project-root>
 *
 * Writes to <project-root>/.understand-anything/intermediate/topology-hints.json
 *
 * Spec: proposals/mechanisms-and-walkthroughs.md §3.4
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.argv[2] || process.cwd();
const graphPath = join(projectRoot, ".understand-anything", "knowledge-graph.json");
const hintsDir = join(projectRoot, ".understand-anything", "intermediate");
const hintsPath = join(hintsDir, "topology-hints.json");

// -------------------------------------------------------------------------
// Comment-trigger phrases. Authors mark non-obvious code with these.
// Cross-language; generalize broadly. Match case-insensitively against
// node.summary and node.languageNotes (which capture comments at analysis).
// -------------------------------------------------------------------------
const NON_OBVIOUS_TRIGGERS = [
  // Direct authorial markers
  "trick", "hack", "clever", "subtle", "tricky", "magic",
  "the reason", "important", "carefully", "intentionally", "deliberately",
  "counterintuitive", "surprisingly", "non-obvious", "non obvious",
  // Performance markers
  "fast path", "hot path", "hot", "fast", "performance", "optimization",
  "amortized", "amortize", "lock-free", "lockless",
  // Design-decision markers
  "we picked", "we chose", "it might be tempting", "tempting to",
  "don't ", "avoid", "must not", "must be", "must do",
  "because", "rationale", "design choice",
  // Anti-pattern warnings (places people get wrong)
  "gotcha", "footgun", "caution", "warning", "note that",
  // Identity / dual-purpose markers
  "double duty", "doubles as", "also serves as", "doubles",
];

const TODO_TRIGGERS = ["todo", "fixme", "xxx", "hack:", "note:"];

function lowerSafe(s) {
  return (typeof s === "string" ? s : "").toLowerCase();
}

function matchAny(text, triggers) {
  const t = lowerSafe(text);
  return triggers.filter((trig) => t.includes(trig));
}

// -------------------------------------------------------------------------
// Graph metrics
// -------------------------------------------------------------------------
function buildAdjacency(nodes, edges) {
  const fanIn = new Map();    // nodeId -> count of incoming edges
  const fanOut = new Map();   // nodeId -> count of outgoing edges
  const incoming = new Map(); // nodeId -> Set of source nodeIds
  const outgoing = new Map(); // nodeId -> Set of target nodeIds
  for (const n of nodes) {
    fanIn.set(n.id, 0);
    fanOut.set(n.id, 0);
    incoming.set(n.id, new Set());
    outgoing.set(n.id, new Set());
  }
  for (const e of edges) {
    if (fanOut.has(e.source)) {
      fanOut.set(e.source, fanOut.get(e.source) + 1);
      outgoing.get(e.source).add(e.target);
    }
    if (fanIn.has(e.target)) {
      fanIn.set(e.target, fanIn.get(e.target) + 1);
      incoming.get(e.target).add(e.source);
    }
  }
  return { fanIn, fanOut, incoming, outgoing };
}

function nodeById(nodes) {
  const m = new Map();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

function nodeShortLabel(n) {
  return n.filePath ? `${n.name} (${n.filePath})` : n.name;
}

// -------------------------------------------------------------------------
// Signal 1 — self-described load-bearing code
//
// Walk every "document" node (README, architecture docs, design specs) and
// look for words that match other node names verbatim. Authors usually
// name where the cleverness is. This is the highest-signal class.
// -------------------------------------------------------------------------
function selfDescribed(nodes) {
  const docs = nodes.filter((n) => n.type === "document" || n.type === "concept");
  const codeNodes = nodes.filter((n) =>
    ["function", "class", "module", "file"].includes(n.type)
  );
  const mentions = new Map(); // nodeId -> {doc, snippet}[]

  for (const d of docs) {
    const text = `${d.summary || ""} ${d.languageNotes || ""}`;
    const tl = lowerSafe(text);
    if (!tl) continue;
    for (const code of codeNodes) {
      const name = code.name;
      if (!name || name.length < 4) continue;
      const nameLower = name.toLowerCase();
      // Word-boundary-ish match: bracketed by non-alphanumerics or start/end
      const idx = tl.indexOf(nameLower);
      if (idx < 0) continue;
      const before = idx === 0 ? " " : tl[idx - 1];
      const after = idx + nameLower.length >= tl.length ? " " : tl[idx + nameLower.length];
      const boundaryBefore = !/[a-z0-9_]/.test(before);
      const boundaryAfter = !/[a-z0-9_]/.test(after);
      if (!boundaryBefore || !boundaryAfter) continue;

      // Grab a small context snippet
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + nameLower.length + 60);
      const snippet = text.slice(start, end).trim();

      if (!mentions.has(code.id)) mentions.set(code.id, []);
      mentions.get(code.id).push({
        documentId: d.id,
        documentName: d.name,
        snippet: snippet.length > 160 ? snippet.slice(0, 157) + "..." : snippet,
      });
    }
  }

  return Array.from(mentions.entries())
    .map(([nodeId, refs]) => ({
      nodeId,
      mentionCount: refs.length,
      references: refs.slice(0, 3),
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 40);
}

// -------------------------------------------------------------------------
// Signal 2 — fan-in / fan-out outliers
//
// Functions or modules with high asymmetric coupling. High fan-in + small
// size often indicates a load-bearing primitive (e.g. a single allocator).
// -------------------------------------------------------------------------
function fanInOutliers(nodes, fanIn, fanOut, nodeMap) {
  const candidates = nodes.filter((n) =>
    ["function", "class", "module"].includes(n.type)
  );
  const scored = candidates.map((n) => {
    const inDeg = fanIn.get(n.id) || 0;
    const outDeg = fanOut.get(n.id) || 0;
    const lines = n.lineRange ? n.lineRange[1] - n.lineRange[0] + 1 : 999;
    // Score: high in-degree, small body
    const score = inDeg * (lines > 0 ? 1 / Math.log2(2 + lines) : 0);
    return { nodeId: n.id, fanIn: inDeg, fanOut: outDeg, lines, score };
  });
  return scored
    .filter((s) => s.fanIn >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

// -------------------------------------------------------------------------
// Signal 3 — densest call clusters
//
// Small groups of nodes (3–8) with high mutual edge density. Often the
// place a coherent subsystem lives. We use a simple greedy seed-and-expand
// from high-degree nodes rather than a real community-detection algorithm
// to keep the script deterministic and fast.
// -------------------------------------------------------------------------
function denseClusters(nodes, incoming, outgoing) {
  const codeIds = new Set(
    nodes
      .filter((n) => ["function", "class", "module", "file"].includes(n.type))
      .map((n) => n.id)
  );

  // Score each node by total degree
  const degree = new Map();
  for (const id of codeIds) {
    degree.set(
      id,
      (incoming.get(id)?.size || 0) + (outgoing.get(id)?.size || 0)
    );
  }
  const seeds = Array.from(degree.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map((e) => e[0]);

  const visited = new Set();
  const clusters = [];

  for (const seed of seeds) {
    if (visited.has(seed)) continue;
    const cluster = new Set([seed]);
    const candidates = new Set();
    for (const t of outgoing.get(seed) || []) if (codeIds.has(t)) candidates.add(t);
    for (const s of incoming.get(seed) || []) if (codeIds.has(s)) candidates.add(s);

    while (cluster.size < 8 && candidates.size > 0) {
      // Pick the candidate with the most edges already-in-cluster
      let best = null;
      let bestEdges = 0;
      for (const c of candidates) {
        let edges = 0;
        for (const t of outgoing.get(c) || []) if (cluster.has(t)) edges++;
        for (const s of incoming.get(c) || []) if (cluster.has(s)) edges++;
        if (edges > bestEdges) {
          bestEdges = edges;
          best = c;
        }
      }
      if (!best || bestEdges < 2) break;
      cluster.add(best);
      candidates.delete(best);
      for (const t of outgoing.get(best) || []) if (codeIds.has(t) && !cluster.has(t)) candidates.add(t);
      for (const s of incoming.get(best) || []) if (codeIds.has(s) && !cluster.has(s)) candidates.add(s);
    }

    if (cluster.size >= 3) {
      // Compute mutual-edge density
      let mutualEdges = 0;
      for (const a of cluster) {
        for (const b of cluster) {
          if (a !== b && (outgoing.get(a)?.has(b) || incoming.get(a)?.has(b))) {
            mutualEdges++;
          }
        }
      }
      mutualEdges /= 2;
      const maxEdges = (cluster.size * (cluster.size - 1)) / 2;
      const density = maxEdges > 0 ? mutualEdges / maxEdges : 0;
      if (density >= 0.4) {
        clusters.push({
          nodeIds: Array.from(cluster),
          size: cluster.size,
          mutualEdges,
          density: Number(density.toFixed(3)),
        });
        for (const id of cluster) visited.add(id);
      }
    }
  }

  return clusters
    .sort((a, b) => b.density - a.density)
    .slice(0, 15);
}

// -------------------------------------------------------------------------
// Signal 4 — architectural bridge nodes
//
// Nodes that connect layers. We use the existing `layers[]` structure from
// the knowledge graph: a bridge is a node referenced by edges that span
// two or more different layers.
// -------------------------------------------------------------------------
function bridgeNodes(nodes, edges, layers, nodeMap) {
  if (!layers || layers.length < 2) return [];

  const nodeToLayer = new Map();
  for (const l of layers) {
    for (const id of l.nodeIds || []) {
      nodeToLayer.set(id, l.id);
    }
  }

  const bridgeScores = new Map();
  for (const e of edges) {
    const sLayer = nodeToLayer.get(e.source);
    const tLayer = nodeToLayer.get(e.target);
    if (sLayer && tLayer && sLayer !== tLayer) {
      bridgeScores.set(e.source, (bridgeScores.get(e.source) || 0) + 1);
      bridgeScores.set(e.target, (bridgeScores.get(e.target) || 0) + 1);
    }
  }

  return Array.from(bridgeScores.entries())
    .map(([nodeId, count]) => ({
      nodeId,
      crossLayerEdgeCount: count,
      layer: nodeToLayer.get(nodeId),
    }))
    .sort((a, b) => b.crossLayerEdgeCount - a.crossLayerEdgeCount)
    .slice(0, 20);
}

// -------------------------------------------------------------------------
// Signal 5 — comment-content signals
//
// Match NON_OBVIOUS_TRIGGERS against summary + languageNotes. Authors leave
// markers for future readers; this is unusually high-signal evidence.
// -------------------------------------------------------------------------
function commentSignals(nodes) {
  const results = [];
  for (const n of nodes) {
    if (!["function", "class", "module", "file"].includes(n.type)) continue;
    const text = `${n.summary || ""} \n ${n.languageNotes || ""}`;
    const triggers = matchAny(text, NON_OBVIOUS_TRIGGERS);
    if (triggers.length === 0) continue;
    results.push({
      nodeId: n.id,
      triggers,
      summary: (n.summary || "").slice(0, 200),
    });
  }
  return results
    .sort((a, b) => b.triggers.length - a.triggers.length)
    .slice(0, 30);
}

// -------------------------------------------------------------------------
// Signal 6 — small files with high reference density
//
// Short modules that many other modules import. Often load-bearing
// primitives (a vocabulary file, a constants file with hidden cleverness,
// a small utility that holds the system together).
// -------------------------------------------------------------------------
function smallButCritical(nodes, fanIn) {
  const files = nodes.filter((n) => n.type === "file" || n.type === "module");
  const scored = files.map((n) => {
    const inDeg = fanIn.get(n.id) || 0;
    const lines = n.lineRange ? n.lineRange[1] - n.lineRange[0] + 1 : 999;
    return { nodeId: n.id, fanIn: inDeg, lines, score: inDeg * (lines > 0 && lines < 300 ? 1 : 0.1) };
  });
  return scored
    .filter((s) => s.fanIn >= 3 && s.lines < 400)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

// -------------------------------------------------------------------------
// Signal 7 — TODO/design-decision markers
//
// Places authors are still wrestling. Climactic decisions often live near.
// -------------------------------------------------------------------------
function todoMarkers(nodes) {
  const results = [];
  for (const n of nodes) {
    if (!["function", "class", "module", "file"].includes(n.type)) continue;
    const text = `${n.summary || ""} \n ${n.languageNotes || ""}`;
    const triggers = matchAny(text, TODO_TRIGGERS);
    if (triggers.length === 0) continue;
    results.push({ nodeId: n.id, triggers });
  }
  return results.slice(0, 20);
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------
async function main() {
  if (!existsSync(graphPath)) {
    console.error(`No knowledge graph at ${graphPath}`);
    console.error("Run /understand first.");
    process.exit(1);
  }

  const raw = await readFile(graphPath, "utf-8");
  const graph = JSON.parse(raw);
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const layers = graph.layers || [];

  const { fanIn, fanOut, incoming, outgoing } = buildAdjacency(nodes, edges);
  const nodeMap = nodeById(nodes);

  const hints = {
    version: "1",
    generatedAt: new Date().toISOString(),
    project: graph.project,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      layerCount: layers.length,
    },
    selfDescribed: selfDescribed(nodes),
    fanInOutliers: fanInOutliers(nodes, fanIn, fanOut, nodeMap),
    denseClusters: denseClusters(nodes, incoming, outgoing),
    bridgeNodes: bridgeNodes(nodes, edges, layers, nodeMap),
    commentSignals: commentSignals(nodes),
    smallButCritical: smallButCritical(nodes, fanIn),
    todoMarkers: todoMarkers(nodes),
  };

  // Enrich each hint entry with a short label so the agent doesn't have to
  // cross-reference IDs to names. This keeps the prompt readable.
  const enrich = (entry) => {
    const n = nodeMap.get(entry.nodeId);
    if (!n) return entry;
    return {
      ...entry,
      _label: nodeShortLabel(n),
      _type: n.type,
    };
  };
  hints.selfDescribed = hints.selfDescribed.map(enrich);
  hints.fanInOutliers = hints.fanInOutliers.map(enrich);
  hints.bridgeNodes = hints.bridgeNodes.map(enrich);
  hints.commentSignals = hints.commentSignals.map(enrich);
  hints.smallButCritical = hints.smallButCritical.map(enrich);
  hints.todoMarkers = hints.todoMarkers.map(enrich);
  hints.denseClusters = hints.denseClusters.map((c) => ({
    ...c,
    _labels: c.nodeIds.map((id) => {
      const n = nodeMap.get(id);
      return n ? nodeShortLabel(n) : id;
    }),
  }));

  await mkdir(hintsDir, { recursive: true });
  await writeFile(hintsPath, JSON.stringify(hints, null, 2), "utf-8");

  // Print a short summary so the LLM (or human running this) sees what came out
  console.log(`Topology hints written to ${hintsPath}`);
  console.log("");
  console.log("Summary:");
  console.log(`  self-described nodes:     ${hints.selfDescribed.length}`);
  console.log(`  fan-in outliers:           ${hints.fanInOutliers.length}`);
  console.log(`  dense clusters:            ${hints.denseClusters.length}`);
  console.log(`  bridge nodes:              ${hints.bridgeNodes.length}`);
  console.log(`  comment-marker nodes:      ${hints.commentSignals.length}`);
  console.log(`  small-but-critical files:  ${hints.smallButCritical.length}`);
  console.log(`  TODO/design markers:       ${hints.todoMarkers.length}`);
}

main().catch((err) => {
  console.error(`compute-topology-hints failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
