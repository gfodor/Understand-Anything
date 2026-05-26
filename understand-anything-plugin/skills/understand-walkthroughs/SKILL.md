---
name: understand-walkthroughs
description: Batch-generate walkthroughs for every qualifying mechanism and/or flow in one run. Convenience over /understand-walkthrough <id>. Default heuristics skip artifacts that don't deserve a deep read.
argument-hint: [--mechanisms] [--flows] [--structures] [--all]
---

# /understand-walkthroughs

Generates **walkthroughs in sequence** for every qualifying flow and mechanism. Convenience wrapper over `/understand-walkthrough <id>`. Use when you want full coverage; use the singular skill when you want to pick.

## Default behavior

Without flags, the skill applies these heuristics so you don't burn LLM cycles on artifacts that don't deserve a walkthrough:

**Mechanisms** — generate only when:
- `worthWalkthrough: true` in the mechanism graph (the discovery agent's own judgment), AND
- no `walkthrough` field is already attached.

**Flows** — generate only when:
- `domainMeta.entryType` is not `"manual"` (the manual entryType is the catch-all bucket; usually a flow worth a walkthrough has a clearer trigger), AND
- the flow has at least 3 steps (`flow_step` outgoing edges), AND
- no walkthrough is already attached for this flow in `domain-graph.json`'s `walkthroughs[]` sibling array.

**Structures** — generate only when:
- `worthWalkthrough: true` in the structure graph, AND
- no `walkthrough` field is already attached.

## Flags

- `--mechanisms` — restrict to mechanisms only.
- `--flows` — restrict to flows only.
- `--structures` — restrict to structures only.
- Multiple kind flags compose (`--mechanisms --structures` does both, skips flows).
- `--all` — drop the default heuristics; generate for every mechanism, flow, and structure, even those marked `worthWalkthrough: false` or with `entryType: manual`. Use sparingly.

The flags compose: `--flows --all` generates a walkthrough for every flow regardless of heuristics; `--mechanisms` (alone) keeps the worthWalkthrough filter.

## Instructions

### Phase 0: Resolve `PROJECT_ROOT` and plugin root

Use the same boilerplate as `/understand-mechanisms` and `/understand-walkthrough` (worktree redirect, plugin-root candidate search). The skill name in the symlink resolution lines is `understand-walkthroughs` (plural).

### Phase 1: Parse flags

```bash
# Default = all three kinds. Specifying any subset of --mechanisms /
# --flows / --structures restricts to that subset.
EXPLICIT_KINDS=0
TARGET_MECHANISMS=0
TARGET_FLOWS=0
TARGET_STRUCTURES=0
APPLY_HEURISTICS=1

for arg in "$@"; do
  case "$arg" in
    --mechanisms) EXPLICIT_KINDS=1; TARGET_MECHANISMS=1 ;;
    --flows)      EXPLICIT_KINDS=1; TARGET_FLOWS=1 ;;
    --structures) EXPLICIT_KINDS=1; TARGET_STRUCTURES=1 ;;
    --all)        APPLY_HEURISTICS=0 ;;
  esac
done

if [ "$EXPLICIT_KINDS" -eq 0 ]; then
  TARGET_MECHANISMS=1
  TARGET_FLOWS=1
  TARGET_STRUCTURES=1
fi
```

### Phase 2: Collect targets

Read each relevant graph file, apply the default filters or skip them depending on `APPLY_HEURISTICS`. Write a list of `{ kind, id, shape }` tuples to `$PROJECT_ROOT/.understand-anything/intermediate/walkthrough-targets.json`.

```bash
node --input-type=module -e "$(cat <<'EOF'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.argv[2];
const targetMechanisms = process.argv[3] === '1';
const targetFlows = process.argv[4] === '1';
const targetStructures = process.argv[5] === '1';
const applyHeuristics = process.argv[6] === '1';

const mechPath = join(projectRoot, '.understand-anything', 'mechanism-graph.json');
const domainPath = join(projectRoot, '.understand-anything', 'domain-graph.json');
const structPath = join(projectRoot, '.understand-anything', 'structure-graph.json');

const targets = [];
let skippedMechanisms = 0;
let skippedFlows = 0;
let skippedStructures = 0;

if (targetMechanisms && existsSync(mechPath)) {
  const mg = JSON.parse(readFileSync(mechPath, 'utf-8'));
  for (const m of mg.mechanisms || []) {
    if (m.walkthrough) { skippedMechanisms++; continue; }
    if (applyHeuristics && !m.worthWalkthrough) { skippedMechanisms++; continue; }
    targets.push({ kind: 'mechanism', id: m.id, name: m.name, shape: 'recognition' });
  }
}

if (targetFlows && existsSync(domainPath)) {
  const dg = JSON.parse(readFileSync(domainPath, 'utf-8'));
  const existingWalkthroughs = new Set((dg.walkthroughs || []).map(w => w.attachedTo?.id));
  const flowSteps = new Map();
  for (const e of dg.edges || []) {
    if (e.type === 'flow_step') {
      flowSteps.set(e.source, (flowSteps.get(e.source) || 0) + 1);
    }
  }
  for (const node of dg.nodes || []) {
    if (node.type !== 'flow') continue;
    if (existingWalkthroughs.has(node.id)) { skippedFlows++; continue; }
    if (applyHeuristics) {
      if (node.domainMeta?.entryType === 'manual') { skippedFlows++; continue; }
      if ((flowSteps.get(node.id) || 0) < 3) { skippedFlows++; continue; }
    }
    targets.push({ kind: 'flow', id: node.id, name: node.name, shape: 'process' });
  }
}

if (targetStructures && existsSync(structPath)) {
  const sg = JSON.parse(readFileSync(structPath, 'utf-8'));
  for (const s of sg.structures || []) {
    if (s.walkthrough) { skippedStructures++; continue; }
    if (applyHeuristics && !s.worthWalkthrough) { skippedStructures++; continue; }
    targets.push({ kind: 'structure', id: s.id, name: s.name, shape: 'structural' });
  }
}

mkdirSync(join(projectRoot, '.understand-anything', 'intermediate'), { recursive: true });
writeFileSync(
  join(projectRoot, '.understand-anything', 'intermediate', 'walkthrough-targets.json'),
  JSON.stringify({
    targets,
    skipped: { mechanisms: skippedMechanisms, flows: skippedFlows, structures: skippedStructures },
  }, null, 2),
);

console.log('Targets:', targets.length);
console.log('  mechanisms:', targets.filter(t => t.kind === 'mechanism').length);
console.log('  flows:     ', targets.filter(t => t.kind === 'flow').length);
console.log('  structures:', targets.filter(t => t.kind === 'structure').length);
console.log('Skipped:');
console.log('  mechanisms:', skippedMechanisms);
console.log('  flows:     ', skippedFlows);
console.log('  structures:', skippedStructures);
EOF
)" "$PROJECT_ROOT" "$TARGET_MECHANISMS" "$TARGET_FLOWS" "$TARGET_STRUCTURES" "$APPLY_HEURISTICS"
```

If the resulting target list is empty, print a summary explaining why and exit cleanly. Suggest `--all` if the user wants to bypass the filter.

### Phase 3: Sequential walkthrough generation

**This phase processes every target in `walkthrough-targets.json`, one at a time. You MUST NOT exit this phase until either (a) every remaining target has been processed, or (b) you have hit a hard context-budget limit that forces a stop. Generating one walkthrough and concluding is INCORRECT behavior — it is a batch skill.**

#### Initialize the resume tracker

Before the loop, ensure `intermediate/walkthroughs-done.json` exists (create as `[]` if not):

```bash
DONE_FILE="$PROJECT_ROOT/.understand-anything/intermediate/walkthroughs-done.json"
if [ ! -f "$DONE_FILE" ]; then echo "[]" > "$DONE_FILE"; fi
```

This file lets you (or a re-invocation of this skill) resume mid-batch. Each successful attachment appends the artifact id to this list.

#### Compute the remaining set

Read `walkthrough-targets.json` and `walkthroughs-done.json`. The **remaining** set is targets whose id is NOT in done. Count it; you will iterate that many times.

```bash
node --input-type=module -e "$(cat <<'EOF'
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const projectRoot = process.argv[2];
const targets = JSON.parse(readFileSync(join(projectRoot, '.understand-anything', 'intermediate', 'walkthrough-targets.json'), 'utf-8')).targets;
const done = JSON.parse(readFileSync(join(projectRoot, '.understand-anything', 'intermediate', 'walkthroughs-done.json'), 'utf-8'));
const doneSet = new Set(done);
const remaining = targets.filter(t => !doneSet.has(t.id));
console.log('TOTAL_TARGETS=' + targets.length);
console.log('ALREADY_DONE=' + done.length);
console.log('REMAINING=' + remaining.length);
remaining.forEach((t, i) => console.log('TARGET_' + i + '=' + JSON.stringify(t)));
EOF
)" "$PROJECT_ROOT"
```

Use that output to drive the iteration. **Iterate over the remaining set in order. For each iteration:**

#### Per-target steps (repeat for every remaining target)

For target `i` (zero-indexed) of `N` remaining:

1. **Look up the artifact** — open the appropriate graph file by kind (`mechanism-graph.json` / `domain-graph.json` / `structure-graph.json`) and locate the record by id.

2. **Resolve participant nodes** — for each id in `participantNodeIds`, look it up in `knowledge-graph.json` and collect `{name, filePath, lineRange, summary, languageNotes, tags}`.

3. **Pull source excerpts** — for the 4-6 most-important nodes (climacticNodeId + high-fan-in + summary-rich), read the file at `filePath` and slice to `lineRange`. Cap each excerpt at ~40 lines.

4. **Write the context file** — `intermediate/walkthrough-context.json` (overwrites the previous iteration's; that's intentional, this is single-target state).

5. **Dispatch the `walkthrough-author` subagent** with the context. Shape directive: `recognition` for mechanisms, `process` for flows. Wait for it to write `intermediate/walkthrough.json`.

6. **Validate** the agent's output against `WalkthroughSchema` from `@understand-anything/core`. If invalid, RECORD the failure (append to a `walkthroughs-failed.json` with target id + error message) and CONTINUE to the next iteration — do not abort the batch.

7. **Attach** the validated walkthrough back into the host artifact:
   - Mechanisms: set `walkthrough` field on the matching mechanism in `mechanism-graph.json`.
   - Flows: upsert into `domain-graph.json`'s top-level `walkthroughs[]` array, keyed by `attachedTo.id`.
   - Structures: set `walkthrough` field on the matching structure in `structure-graph.json`.

8. **Mark done**: append the target's id to `walkthroughs-done.json`.

9. **Print progress**:

   ```
   [3/7] ✓ mechanism:the-worklet-as-string → "The Worklet as String" (recognition, 5 scenes)
   ```

10. **Continue to the next iteration immediately.** Do not announce "done with phase 3" until `remaining.length` iterations have completed. After processing target `i`, the loop should advance to target `i+1`.

#### Why resume matters

If your context budget gets tight, save state by leaving the intermediate files in place and inform the user: *"Generated N of M walkthroughs. Re-run `/understand-walkthroughs` to resume from target N+1."* On re-invocation, Phase 3's "compute remaining" step will skip everything already in `walkthroughs-done.json` and pick up from where you left off. This is the spike's answer to long batches: don't dispatch in parallel (context starvation), don't try to do all-or-nothing (one failure shouldn't waste the whole batch), just record progress as you go.

**Sequential, not parallel.** Each iteration is one full LLM dispatch. Parallelism would starve the parent agent's context and collide on intermediate file paths.

**Failure handling.** Validation failures or agent errors append to `walkthroughs-failed.json` and continue to the next target. Partial coverage is better than none. The user can re-run `/understand-walkthrough <id>` on any failures.

### Phase 4: Report

After the loop completes, print a summary:

```
Generated 6 of 7 walkthroughs.
  Mechanisms (4): the-worklet-as-string, the-mach-bridge, the-dal-handoff, the-double-buffered-worklet
  Flows (2):      capture-and-broadcast-frame, voice-activity-detection-pipeline

Failed (1):
  mechanism:the-libyuv-format-conversion — agent returned schema-invalid walkthrough; rerun with /understand-walkthrough mechanism:the-libyuv-format-conversion to retry.

To view in the dashboard:
  /understand-dashboard
```

Clean up `intermediate/walkthrough-targets.json` after the report.

## Notes

- **Cost.** Each walkthrough is one LLM dispatch (roughly 5-10K output tokens plus the context for participating-node excerpts). Generating 10 walkthroughs in batch can run 100K+ tokens; budget accordingly. The default heuristics aim to keep this honest.
- **Reruns.** Re-running this skill on a project with existing walkthroughs is safe — they are skipped by default. To regenerate, delete the relevant `walkthrough` field on the artifact first.
- **Combination with discovery.** Recommended order is `/understand` → `/understand-domain` → `/understand-mechanisms` → `/understand-walkthroughs`. The discovery commands run first; the batch generation closes out.
