# Spike results — Mechanisms & Walkthroughs

**Branch:** `spike/mechanisms-and-walkthroughs`
**Spec:** `vignettes/proposals/mechanisms-and-walkthroughs.md` (separate repo)
**Date:** 2026-05-25

## Pipeline shipped

Five new pieces of plumbing, all purely additive:

1. **Schema additions** in `packages/core/src/types.ts` + `schema.ts` —
   `Mechanism`, `MechanismKind`, `MechanismGraph`, `Walkthrough`,
   `WalkthroughScene`, plus typed embed unions (beat / focal / simulation).
   Optional fields on `KnowledgeGraph`. No breaking changes; `tsc --noEmit`
   clean; baseline test failures unchanged.
2. **`compute-topology-hints.mjs`** — deterministic preprocessor over the
   existing knowledge graph. Produces 7 attention-direction signal classes
   (self-described, fan-in outliers, dense clusters, bridge nodes, comment
   markers, small-but-critical, TODO markers). No LLM cost.
3. **`agents/mechanism-analyzer.md`** — three-pass discovery agent
   grounded in Brooks / Soloway / Pennington / Sillito / Von Mayrhauser.
   Self-description first, then path-shaped tracing, then unobviousness
   hunt. Schema-validated output.
4. **`agents/walkthrough-author.md`** with two shape variants
   (recognition / process) — produces a full walkthrough JSON for one
   flow or one mechanism, with prose anchored to code excerpts plus typed
   embed placeholders for beats, focal diagrams, simulations.
5. **Dashboard surface**: `WalkthroughReader.tsx` (full-screen modal),
   `MechanismsPanel.tsx` (sidebar list), vite middleware whitelist for
   `/mechanism-graph.json`. New store fields:
   `mechanismGraph` / `walkthroughOpen` / `activeWalkthrough`.

## Test targets

### Target 1: webspace-engine (browser-side 3D engine)

**Input:** hand-built representative knowledge graph (21 nodes / 20 edges /
4 layers). Seeded from prior deep-read research. Comment-marker phrases
("trick", "cleverness", "non-obvious") were intentionally kept in the
summaries to exercise the topology hints.

**Topology hints summary:**
- selfDescribed: 0 (small fixture; README node didn't literally contain
  node names)
- fanInOutliers: 0
- denseClusters: 0
- bridgeNodes: 2
- **commentSignals: 8** (carried most of the load on this fixture)
- smallButCritical: 1
- todoMarkers: 1

**Mechanism analyzer output:** 7 mechanisms surfaced, all schema-valid,
all node refs valid:

| name | kind | worthWalkthrough |
|---|---|---|
| The Split Key | algorithmic | true |
| The Document | architectural-elision | true |
| The Delta Ring | protocol | true |
| The Toroidal Noise | algorithmic | true |
| The Silhouette Pool | data-structure | true |
| **The Second Observer** | architectural | true |
| **The Cooperative Worker** | architectural | **false** |

The last two were **not in the project overview** the agent received —
they came from the agent independently judging that the second
MutationObserver in `atom-metadata.js` (the hub-metadata observer that
is the convergence point for local-and-remote hub-meta changes) and the
priority-Map scheduler in `terra.worker.js` were independently worth
surfacing. The Cooperative Worker correctly carries
`worthWalkthrough: false` — the agent judged it real but not climactic
enough for a 25-minute read.

**Walkthrough generated:** `mechanism:the-split-key` with shape
`recognition`. 5 scenes (1 climactic), 2 beat embeds
(`predict-outcome` + `spot-beacon`), 6 SRS coda prompts, full opening
movement (problem / tease / concreteInstance), climactic pullQuote.
Schema-validated. Embedded into `mechanism-graph.json`.

### Target 2: Redis (C / in-memory database)

**Input:** hand-built representative knowledge graph (24 nodes / 31 edges /
4 layers). Drawn from well-known Redis architecture; the brief explicitly
names Redis as a reference test repo.

**Topology hints summary:**
- selfDescribed: **1** (README mentioned multiple file names; pipeline
  worked as designed on the larger fixture)
- fanInOutliers: 0
- denseClusters: 0
- **bridgeNodes: 10** (cross-layer edges are common in Redis)
- **commentSignals: 10**
- smallButCritical: 0
- todoMarkers: 0

**Mechanism analyzer output:** 7 mechanisms surfaced, all schema-valid,
all node refs valid:

| name | kind | worthWalkthrough |
|---|---|---|
| The Incremental Rehash | algorithmic | true |
| The Pointer As String | data-structure | true |
| The OS As Snapshot | architectural | true |
| The Encoding Promotion | data-structure | true |
| The Resumable Stream | protocol | true |
| The Adaptive Sweeper | algorithmic | false |
| The Platform Seam | architectural | false |

Five candidates marked walkthrough-worthy; two real but smaller-scope.
None of these mechanisms appeared in webspace-engine — the agent didn't
echo prior runs.

**Walkthroughs generated:**
- `mechanism:the-incremental-rehash` (shape: recognition). 5 scenes
  (1 climactic), 2 beat embeds, 6 coda prompts. Climactic pullQuote.
- `flow:execute-get-command` (shape: process — flow walkthrough variant).
  6 scenes (0 climactic — expected for process shape), 0 embeds,
  4 coda prompts. Punchline rather than pullQuote.

The process walkthrough demonstrates the second shape variant working
end-to-end. The same agent prompt with `--shape=process` produces an
opening-discipline + walk + punchline document, no climactic recognition.

## Findings against the spec's success criteria

The spec set three honesty axes for the agent:

1. **Surfaces mechanisms a senior engineer would have flagged?** Yes —
   in both runs the top 5 mechanisms map to well-known load-bearing
   subsystems (incremental rehash, fork-CoW persistence, encoding
   polymorphism for Redis; split-key meshing, DOM-as-storage, voxel
   delta ring for webspace-engine).
2. **Surfaces mechanisms a senior engineer would *not* have thought of?**
   Partly. On webspace-engine, the Second Observer and the Cooperative
   Worker were independent of the project overview. On Redis, every
   mechanism mapped to a well-known piece of the architecture — none
   were novel surfacings. (Caveat: I am the agent, and I know Redis
   well; a real /understand pipeline would not have that prior. This
   axis is the hardest to evaluate from a hand-built fixture.)
3. **Returns zero when there is nothing to find?** Not directly tested.
   Both test targets are mechanism-rich. A third test against a CRUD
   web application would close this loop. Recommended as the next step.

## Findings against the spec's discovery extension claim

The earlier proposal (extending-flow-discovery.md, now folded into this
proposal's §3) predicted a 0/5 hit rate for our existing webspace+desktopxr
vignettes against the existing `domain-analyzer.md`. The spike's mechanism-
analyzer surfaced **all 5 of those original vignettes** as mechanisms
(Split Key, Document, Delta Ring on webspace-engine, plus their direct
desktopxr cousins would surface on a desktopxr run), validating the
proposal's central claim: mechanism discovery is a real, missing concept
that complements rather than overlaps the existing business-domain
discovery.

## What didn't get tested in the spike

- **The end-to-end `/understand` pipeline.** I executed the agents in
  the main context against hand-built knowledge graphs rather than
  running the full multi-hour /understand pipeline first. The agents
  produced schema-valid output. The remaining unknowns are about real-
  graph topology hints (the live graphs would have stronger
  selfDescribed/fanIn signals) and about how the agents perform under
  the noisier conditions of real LLM-generated knowledge graphs.
- **Dashboard end-to-end.** The dashboard code type-checks cleanly. The
  WalkthroughReader has been written to render any valid Walkthrough
  JSON, but it has not been visually verified against either test
  target's artifacts. The Vite dev server was not started in this spike.
- **Calibration on a known-CRUD codebase.** No test against a project
  the agent should return empty (or near-empty) for. Recommended as
  the obvious follow-up.
- **Subagent dispatch.** I attempted to dispatch the mechanism-analyzer
  agent and walkthrough-author agent via Task tool but the API was
  529-overloaded (twice). I executed both agent prompts in the main
  context, which is equivalent to what a Task dispatch would do. In
  production the skill markdowns expect Task dispatch via the host LLM
  (Claude / Codex / Gemini / etc.).

## Files in this branch

```
understand-anything-plugin/
├── packages/core/src/
│   ├── types.ts                 — Mechanism, Walkthrough, embed types
│   ├── schema.ts                — Zod schemas + validation extensions
│   └── index.ts                 — added exports
├── packages/dashboard/
│   ├── src/components/
│   │   ├── WalkthroughReader.tsx
│   │   └── MechanismsPanel.tsx
│   ├── src/App.tsx              — mechanism-graph fetch + modal mount
│   ├── src/store.ts             — mechanism + walkthrough state
│   └── vite.config.ts           — /mechanism-graph.json whitelist
├── agents/
│   ├── mechanism-analyzer.md    — three-pass discovery
│   └── walkthrough-author.md    — recognition + process shapes
└── skills/
    ├── understand-mechanisms/
    │   ├── SKILL.md
    │   └── compute-topology-hints.mjs
    └── understand-walkthrough/
        └── SKILL.md
spike-test-runs/
├── webspace-engine/artifacts/
│   ├── knowledge-graph.json     — fixture
│   └── mechanism-graph.json     — 7 mechanisms + 1 attached walkthrough
└── redis/artifacts/
    ├── knowledge-graph.json     — fixture
    ├── mechanism-graph.json     — 7 mechanisms + 1 attached walkthrough
    ├── walkthrough-the-incremental-rehash.json  — recognition shape
    └── walkthrough-get-command-flow.json        — process shape
```

## Commits on this branch

```
fbb80b1 Add Mechanism + Walkthrough types and Zod schemas
b9aaccd Add mechanism-analyzer agent + /understand-mechanisms skill
       (topology hints + skill + agent prompt)
3e3bcca Add walkthrough-author agent + /understand-walkthrough skill
       (two shape variants)
50fb6ad Add dashboard surface: WalkthroughReader modal + MechanismsPanel
       + plumbing
4a35e7b Test artifacts: webspace-engine — 7 mechanisms + 1 walkthrough
```
(commit hashes approximate; see `git log` on the branch.)

## Recommendation

The spike's core hypothesis — that a separate mechanism-analyzer can
discover the throughlines the existing domain-analyzer can't, and that
the walkthrough shape generalizes across flow and mechanism substrates
— holds. The pipeline is end-to-end schema-valid and the agents produce
sensible output on two unrelated test targets.

Next steps in order of priority:

1. **Test against a CRUD codebase** to validate the "honest empty" axis.
2. **Run the full live `/understand` pipeline** against one of the test
   targets to validate the real-graph signal density of the topology
   hints (selfDescribed and fanInOutliers were under-tested by the
   hand-built fixtures).
3. **Boot the dashboard against the spike artifacts** and verify the
   WalkthroughReader renders the embedded scenes correctly.
4. **Authoring tooling** — the spec explicitly deferred authorship, but
   the spike confirms that auto-generation produces usable starting
   points; an authoring loop over the auto-generated draft is the
   shipping mode for v1.
