---
name: understand-structures
description: Discover motivated structures — feature requirements or non-functional properties that organize multiple structural choices in the codebase. Peer to /understand-mechanisms. Requires an existing /understand knowledge graph.
argument-hint: [project-path]
---

# /understand-structures

Discovers **structures** in a codebase — motivated structural responses to constraints, feature requirements, or non-functional properties — and writes them to `.understand-anything/structure-graph.json`.

This skill produces *discoveries*, not walkthroughs. Use `/understand-walkthrough structure:<id>` (or the batch `/understand-walkthroughs`) to generate deep-reads on individual structures.

## How It Works

- Requires `.understand-anything/knowledge-graph.json` to exist (run `/understand` first).
- Reuses the topology-hints preprocessor from `/understand-mechanisms` — same hints, same preprocessor (no LLM cost to recompute).
- Dispatches the `structure-analyzer` agent with the graph + hints + project overview.
- Writes the output to `.understand-anything/structure-graph.json` (sibling to `domain-graph.json` and `mechanism-graph.json`).

## Instructions

### Phase 0: Resolve `PROJECT_ROOT` and plugin root

Use the same boilerplate as `/understand-mechanisms` (worktree redirect, plugin-root candidate search). The skill name in the symlink resolution lines is `understand-structures`.

### Phase 1: Guard on existing knowledge graph

Structure discovery requires the structural graph. If `.understand-anything/knowledge-graph.json` does not exist, instruct the user to run `/understand` first and stop.

```bash
if [ ! -f "$PROJECT_ROOT/.understand-anything/knowledge-graph.json" ]; then
  echo "No knowledge graph found at $PROJECT_ROOT/.understand-anything/knowledge-graph.json"
  echo "Run /understand first to analyze the codebase."
  exit 1
fi
```

### Phase 2: Compute (or reuse) topology hints

If `.understand-anything/intermediate/topology-hints.json` already exists from a recent `/understand-mechanisms` run, reuse it. Otherwise compute fresh:

```bash
node "$PLUGIN_ROOT/skills/understand-mechanisms/compute-topology-hints.mjs" "$PROJECT_ROOT"
```

### Phase 3: Read project overview

Concatenate up to ~8 KB of README + AGENTS.md + CLAUDE.md + CONTRIBUTING.md + obvious architecture docs from `docs/`. Write to `$PROJECT_ROOT/.understand-anything/intermediate/project-overview.md`. If nothing is present, write an empty file.

This is the same pattern `/understand-mechanisms` uses; the file may already exist from a recent run — if so, reuse it.

### Phase 4: Dispatch structure-analyzer

Read the agent prompt from `$PLUGIN_ROOT/agents/structure-analyzer.md`. Dispatch a subagent with:

- The agent prompt
- `$PROJECT_ROOT/.understand-anything/knowledge-graph.json`
- `$PROJECT_ROOT/.understand-anything/intermediate/topology-hints.json`
- `$PROJECT_ROOT/.understand-anything/intermediate/project-overview.md`

The agent writes its candidate list to `$PROJECT_ROOT/.understand-anything/intermediate/structure-analysis.json`.

If the agent surfaces zero structures, that's valid. Save an empty `structures: []` and continue.

### Phase 5: Validate and save

1. Read the agent output.
2. Validate using `StructureGraphSchema` from `@understand-anything/core`. Drop individual structures that fail validation.
3. Cross-check `participantNodeIds` and `anchorNodeId` against `knowledge-graph.json`'s node IDs. Drop structures with dangling references.
4. Write to `$PROJECT_ROOT/.understand-anything/structure-graph.json`.
5. Clean up the intermediate file.

```bash
node --input-type=module -e "$(cat <<'EOF'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { StructureGraphSchema } from '$PLUGIN_ROOT/packages/core/dist/schema.js';

const projectRoot = process.argv[2];
const intermediate = join(projectRoot, '.understand-anything', 'intermediate', 'structure-analysis.json');
const finalPath = join(projectRoot, '.understand-anything', 'structure-graph.json');
const graphPath = join(projectRoot, '.understand-anything', 'knowledge-graph.json');

const raw = JSON.parse(readFileSync(intermediate, 'utf-8'));
const result = StructureGraphSchema.safeParse(raw);
if (!result.success) {
  console.error('Structure graph schema validation failed:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

const graph = JSON.parse(readFileSync(graphPath, 'utf-8'));
const knownIds = new Set(graph.nodes.map((n) => n.id));
const validStructures = result.data.structures.filter((s) => {
  if (s.anchorNodeId && !knownIds.has(s.anchorNodeId)) {
    console.warn('Dropping structure with unknown anchorNodeId: ' + s.id);
    return false;
  }
  const dangling = s.participantNodeIds.find((id) => !knownIds.has(id));
  if (dangling) {
    console.warn('Dropping structure with dangling participant ' + dangling + ': ' + s.id);
    return false;
  }
  return true;
});

const out = { ...result.data, structures: validStructures };
writeFileSync(finalPath, JSON.stringify(out, null, 2), 'utf-8');
console.log('Saved ' + validStructures.length + ' structures to ' + finalPath);

unlinkSync(intermediate);
EOF
)" "$PROJECT_ROOT"
```

### Phase 6: Report

Print a short summary:

```
Found N structures in <project>:
  - structure:<id> ("<name>") — <motivation truncated to 80 chars>...
  ...

To generate a walkthrough for one of them:
  /understand-walkthrough structure:<id>

To regenerate the dashboard with structures visible:
  /understand-dashboard
```

If N is zero, say so and explain that the agent didn't find any structures in this codebase — that is a valid result, not a failure. A small codebase often has zero motivated structures worth surfacing.

## Notes

- Structures are peer to mechanisms but ask a different question: mechanisms surface *clever* code; structures surface *motivated* organization. The two can overlap (a single mechanism might also be a structural response), and that's fine — the user sees both.
- The agent does not produce walkthroughs. `/understand-walkthrough structure:<id>` is the next step.
- The new walkthrough shape `"structural"` is what the walkthrough-author produces when given a structure as input.
