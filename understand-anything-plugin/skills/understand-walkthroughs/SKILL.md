---
name: understand-walkthroughs
description: Batch-generate walkthroughs for every qualifying mechanism and/or flow in one run. Convenience over /understand-walkthrough <id>. Default heuristics skip artifacts that don't deserve a deep read.
argument-hint: [--mechanisms] [--flows] [--all]
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

## Flags

- `--mechanisms` — restrict to mechanisms; skip flows.
- `--flows` — restrict to flows; skip mechanisms.
- `--all` — drop the default heuristics; generate for every mechanism and every flow, even those marked `worthWalkthrough: false` or with `entryType: manual`. Use sparingly — this can be expensive.

The flags compose: `--flows --all` generates a walkthrough for every flow regardless of heuristics; `--mechanisms` (alone) keeps the worthWalkthrough filter.

## Instructions

### Phase 0: Resolve `PROJECT_ROOT` and plugin root

Use the same boilerplate as `/understand-mechanisms` and `/understand-walkthrough` (worktree redirect, plugin-root candidate search). The skill name in the symlink resolution lines is `understand-walkthroughs` (plural).

### Phase 1: Parse flags

```bash
TARGET_MECHANISMS=1
TARGET_FLOWS=1
APPLY_HEURISTICS=1

for arg in "$@"; do
  case "$arg" in
    --mechanisms) TARGET_FLOWS=0 ;;
    --flows) TARGET_MECHANISMS=0 ;;
    --all) APPLY_HEURISTICS=0 ;;
  esac
done
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
const applyHeuristics = process.argv[5] === '1';

const mechPath = join(projectRoot, '.understand-anything', 'mechanism-graph.json');
const domainPath = join(projectRoot, '.understand-anything', 'domain-graph.json');

const targets = [];
let skippedMechanisms = 0;
let skippedFlows = 0;

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

mkdirSync(join(projectRoot, '.understand-anything', 'intermediate'), { recursive: true });
writeFileSync(
  join(projectRoot, '.understand-anything', 'intermediate', 'walkthrough-targets.json'),
  JSON.stringify({ targets, skipped: { mechanisms: skippedMechanisms, flows: skippedFlows } }, null, 2),
);

console.log('Targets:', targets.length);
console.log('  mechanisms:', targets.filter(t => t.kind === 'mechanism').length);
console.log('  flows:     ', targets.filter(t => t.kind === 'flow').length);
console.log('Skipped:');
console.log('  mechanisms:', skippedMechanisms, '(already-attached or worthWalkthrough=false)');
console.log('  flows:     ', skippedFlows, '(already-attached, manual entryType, or <3 steps)');
EOF
)" "$PROJECT_ROOT" "$TARGET_MECHANISMS" "$TARGET_FLOWS" "$APPLY_HEURISTICS"
```

If the resulting target list is empty, print a summary explaining why and exit cleanly. Suggest `--all` if the user wants to bypass the filter.

### Phase 3: Sequential walkthrough generation

For each target in `walkthrough-targets.json`, run the same workflow as `/understand-walkthrough <id>`:

1. Look up the artifact record (Flow or Mechanism)
2. Resolve participant nodes from `knowledge-graph.json`
3. Pull source excerpts for the 4-6 most important nodes
4. Write `intermediate/walkthrough-context.json`
5. Dispatch `walkthrough-author` agent with shape directive (`recognition` for mechanisms, `process` for flows)
6. Validate result with `WalkthroughSchema`
7. Attach into `mechanism-graph.json` or `domain-graph.json` walkthroughs[]
8. Clean up the per-iteration intermediate files

The orchestration here mirrors `understand-walkthrough/SKILL.md` Phases 3-5. Either re-execute those phases inline per target, or invoke the singular skill internally per target.

**Sequential, not parallel.** Each iteration is one full LLM dispatch and parallelism would (a) starve the parent agent's context budget, (b) risk dispatching against the same intermediate file paths. Run them in order.

After each successful save, print a progress line:

```
[3/7] ✓ mechanism:the-worklet-as-string → "The Worklet as String" (recognition, 5 scenes)
```

**Failure handling.** If any single target fails (agent dispatch errors, validation fails, etc.), record the failure to the summary and continue with the next target. Do not abort the whole batch on a single failure; partial coverage is better than none.

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
