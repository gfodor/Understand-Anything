---
name: understand-walkthrough
description: Generate a depth-first walkthrough for one Flow or one Mechanism — a 25-minute reading experience with prose, code, and typed embeds. Distinct from the existing breadth-first Tour feature.
argument-hint: <flow-id-or-mechanism-id> [--shape=recognition|process]
---

# /understand-walkthrough

Generates a **walkthrough** — a depth-first single-throughline reading experience with prose, code, and typed embeds — for one Flow or one Mechanism. Saves it back into the artifact's JSON file under a `walkthrough` field.

Walkthroughs are distinct from the existing `tour[]` (which is a breadth-first survey across the whole codebase). Walkthroughs are 25-minute reads for one specific thing. Opt-in per artifact; not generated in bulk by default.

## How It Works

- Takes one artifact ID (e.g., `flow:create-order` or `mechanism:the-split-key`).
- Looks the artifact up in `domain-graph.json` (flow) or `mechanism-graph.json` (mechanism).
- Resolves the participating nodes from `knowledge-graph.json` and pulls actual source excerpts for the most important ones.
- Dispatches the `walkthrough-author` agent with `shape: "recognition"` (mechanisms) or `shape: "process"` (flows). Optional `--shape=...` override.
- Writes the generated walkthrough back into the artifact and reports.

## Instructions

### Phase 0: Resolve `PROJECT_ROOT` and plugin root

Same boilerplate as `/understand-mechanisms` (worktree redirect, plugin-root candidate search). See that skill for the exact code; use `understand-walkthrough` as the skill name in the symlink resolution.

### Phase 1: Parse arguments

- The first argument is the artifact ID. Required.
  - If it starts with `flow:` — look up in `.understand-anything/domain-graph.json`.
  - If it starts with `mechanism:` — look up in `.understand-anything/mechanism-graph.json`.
  - If it has no prefix, assume `flow:` first, then `mechanism:`.
- Optional `--shape=recognition|process` flag overrides the default (`process` for flows, `recognition` for mechanisms).

```bash
ARTIFACT_ID="$1"
SHAPE_OVERRIDE=""
for arg in "$@"; do
  case "$arg" in
    --shape=*) SHAPE_OVERRIDE="${arg#--shape=}" ;;
  esac
done
```

### Phase 2: Locate the artifact

Read the appropriate graph file based on the ID prefix. Extract:

- The artifact record (Flow or Mechanism).
- For mechanisms: the `participantNodeIds` and `climacticNodeId`.
- For flows: the steps' `nodeIds` (each Step contains 1–N participant nodes).
- The artifact's name, kind/entryType, and any candidate recognition.

If the artifact is not found, list available IDs and exit:

```
Artifact <id> not found. Available:
  flow:create-order
  flow:process-payment
  mechanism:the-split-key
  ...
```

### Phase 3: Build the participant context

For each participant node ID, look it up in `knowledge-graph.json`. Collect:

- `name`, `filePath`, `lineRange`, `summary`, `languageNotes`, `tags`.

For the 4–6 most-important nodes (the climactic one + a few high-fan-in or summary-rich ones), pull the actual source code for their `lineRange`:

```bash
# Pseudocode — actual implementation reads the file at filePath and slices to lineRange.
for node in priorityNodes:
  text = readFile(node.filePath).split('\n')[node.lineRange[0]-1 : node.lineRange[1]]
  excerpts[node.id] = { path, lineRange, code: text.join('\n') }
```

Cap excerpts at ~40 lines each. If a function is longer, elide the middle with a `// ...` marker and pull the head + climactic line + tail.

Write all of this to `$PROJECT_ROOT/.understand-anything/intermediate/walkthrough-context.json`:

```json
{
  "artifact": { /* the Flow or Mechanism record */ },
  "shape": "recognition" | "process",
  "participantNodes": [ /* node records, all of them */ ],
  "codeExcerpts": [ /* selected, with full source text */ ],
  "project": { /* from knowledge-graph.project */ }
}
```

### Phase 4: Dispatch the walkthrough-author agent

Read the agent prompt from `$PLUGIN_ROOT/agents/walkthrough-author.md`. Dispatch a subagent with:

- The agent prompt (full)
- The walkthrough-context.json contents
- A clear directive about the shape variant: include in the dispatch message *"Generate a walkthrough with shape: `<shape>`"*.

The agent writes its output to `$PROJECT_ROOT/.understand-anything/intermediate/walkthrough.json`.

### Phase 5: Validate and save

1. Read the agent output.
2. Validate against `WalkthroughSchema` from `@understand-anything/core`. Drop on schema failure with a clear error message — the user can rerun and the agent will produce something different.
3. Cross-check that every `anchorNodeId` in scenes references a real node in the knowledge graph (drop the `anchorNodeId` field but keep the scene if it doesn't).
4. Write the walkthrough back into the artifact:
   - **Flow**: update `domain-graph.json`, setting `walkthrough` on the matching flow node (or on a sibling structure — see the existing domain-graph layout; the dashboard reads from the same JSON regardless).
   - **Mechanism**: update `mechanism-graph.json`, setting `walkthrough` on the matching mechanism record.
5. Clean up `intermediate/walkthrough-context.json` and `intermediate/walkthrough.json`.

Validation script:

```bash
node --input-type=module -e "$(cat <<'EOF'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WalkthroughSchema } from '$PLUGIN_ROOT/packages/core/dist/schema.js';

const projectRoot = process.argv[2];
const artifactId = process.argv[3];
const intermediate = join(projectRoot, '.understand-anything', 'intermediate', 'walkthrough.json');

const raw = JSON.parse(readFileSync(intermediate, 'utf-8'));
const result = WalkthroughSchema.safeParse(raw);
if (!result.success) {
  console.error('Walkthrough schema validation failed:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}
const walkthrough = result.data;

// Attach back to the artifact
const isFlow = artifactId.startsWith('flow:');
const targetPath = isFlow
  ? join(projectRoot, '.understand-anything', 'domain-graph.json')
  : join(projectRoot, '.understand-anything', 'mechanism-graph.json');

const target = JSON.parse(readFileSync(targetPath, 'utf-8'));
let written = false;
if (isFlow) {
  // Walkthroughs on flows live as a sibling array (.walkthroughs[]) keyed by flow id,
  // since the existing flow record schema is shared across many graphs and we
  // don't want to mutate it in place.
  target.walkthroughs = target.walkthroughs || [];
  const i = target.walkthroughs.findIndex((w) => w.attachedTo?.id === artifactId);
  if (i >= 0) target.walkthroughs[i] = walkthrough;
  else target.walkthroughs.push(walkthrough);
  written = true;
} else {
  // For mechanisms the walkthrough is a field on the mechanism record itself.
  const idx = target.mechanisms.findIndex((m) => m.id === artifactId);
  if (idx >= 0) {
    target.mechanisms[idx].walkthrough = walkthrough;
    written = true;
  }
}
if (!written) {
  console.error('Could not find artifact ' + artifactId + ' to attach walkthrough.');
  process.exit(1);
}
writeFileSync(targetPath, JSON.stringify(target, null, 2), 'utf-8');
console.log('Walkthrough attached to ' + artifactId);
console.log('  Title:    ' + walkthrough.title);
console.log('  Subtitle: ' + walkthrough.subtitle);
console.log('  Scenes:   ' + walkthrough.scenes.length);
console.log('  Embeds:   ' + walkthrough.scenes.filter((s) => s.embed).length);
console.log('  Coda:     ' + walkthrough.coda.prompts.length + ' review prompts');
unlinkSync(intermediate);
const ctx = join(projectRoot, '.understand-anything', 'intermediate', 'walkthrough-context.json');
if (existsSync(ctx)) unlinkSync(ctx);
EOF
)" "$PROJECT_ROOT" "$ARTIFACT_ID"
```

### Phase 6: Report

Print a short summary including the title, pull-quote, and dashboard hint:

```
Walkthrough generated for mechanism:the-split-key

  Title:     The Split Key
  Shape:     recognition
  Subtitle:  Voxel terrain is structurally redundant — but the GPU cannot see redundancy in geometry…
  Scenes:    12  (1 climactic)
  Pullquote: "The mesher does not know it is doing color-aware merging. ..."

To view in the dashboard:
  /understand-dashboard
```

## Notes

- The agent is given a `shape` directive but is allowed to override it if it judges the artifact does not support the requested shape (e.g., a flow with no real climactic recognition can be rewritten as `"process"`; a "mechanism" whose discovery turned out to be a CRUD walk may degrade to `"process"`). The output's `shape` field is the agent's final call.
- This is **per-artifact** generation. Bulk-generation is intentionally not exposed. Use a small wrapper script if you want all of them, but the design assumes the user picks.
- The walkthrough's `attachedTo` field carries both `kind` and `id`, so a renderer can locate the originating artifact from the walkthrough alone.
