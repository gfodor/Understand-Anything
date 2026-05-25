---
name: understand-mechanisms
description: Discover mechanisms — pieces of code worth recognizing on their own terms (algorithmic spines, architectural elisions, cross-process protocols, data-structure cleverness) — peer to flows. Requires an existing /understand knowledge graph.
argument-hint: [project-path]
---

# /understand-mechanisms

Discovers **mechanisms** in a codebase — pieces of code worth recognizing on their own terms — and writes them to `.understand-anything/mechanism-graph.json`. Mechanisms are peer to flows but require different signals; the `mechanism-analyzer` agent reads the codebase and the structural graph together using the three-pass method described in `agents/mechanism-analyzer.md`.

This skill produces *discoveries*, not walkthroughs. Use `/understand-walkthrough <mechanism-id>` to generate a deep-read for a specific mechanism. Walkthroughs are not generated in bulk by default; pick the ones you want.

## How It Works

- Requires `.understand-anything/knowledge-graph.json` to exist (run `/understand` first).
- Computes deterministic topology hints from the existing graph (no LLM cost).
- Dispatches the `mechanism-analyzer` agent with the graph + hints + project overview as context.
- Writes the agent's output to `.understand-anything/mechanism-graph.json`.

## Instructions

### Phase 0: Resolve `PROJECT_ROOT` and plugin root

Set `PROJECT_ROOT` to the current working directory unless an argument is given.

**Worktree redirect.** If `PROJECT_ROOT` is inside a git worktree (not the main checkout), redirect output to the main repository root. Worktrees managed by Claude Code are ephemeral.

```bash
COMMON_DIR=$(git -C "$PROJECT_ROOT" rev-parse --git-common-dir 2>/dev/null)
GIT_DIR=$(git -C "$PROJECT_ROOT" rev-parse --git-dir 2>/dev/null)
if [ -n "$COMMON_DIR" ] && [ -n "$GIT_DIR" ]; then
  COMMON_ABS=$(cd "$PROJECT_ROOT" && cd "$COMMON_DIR" 2>/dev/null && pwd -P)
  GIT_ABS=$(cd "$PROJECT_ROOT" && cd "$GIT_DIR" 2>/dev/null && pwd -P)
  if [ -n "$COMMON_ABS" ] && [ "$COMMON_ABS" != "$GIT_ABS" ]; then
    MAIN_ROOT=$(dirname "$COMMON_ABS")
    if [ -d "$MAIN_ROOT" ] && [ "${UNDERSTAND_NO_WORKTREE_REDIRECT:-0}" != "1" ]; then
      echo "[understand-mechanisms] Detected git worktree at $PROJECT_ROOT"
      echo "[understand-mechanisms] Redirecting output to main repo root: $MAIN_ROOT"
      PROJECT_ROOT="$MAIN_ROOT"
    fi
  fi
fi
```

Resolve the plugin root using the same candidate list as the other skills:

```bash
SKILL_REAL=$(realpath ~/.agents/skills/understand-mechanisms 2>/dev/null || readlink -f ~/.agents/skills/understand-mechanisms 2>/dev/null || echo "")
SELF_RELATIVE=$([ -n "$SKILL_REAL" ] && cd "$SKILL_REAL/../.." 2>/dev/null && pwd || echo "")
COPILOT_SKILL_REAL=$(realpath ~/.copilot/skills/understand-mechanisms 2>/dev/null || readlink -f ~/.copilot/skills/understand-mechanisms 2>/dev/null || echo "")
COPILOT_SELF_RELATIVE=$([ -n "$COPILOT_SKILL_REAL" ] && cd "$COPILOT_SKILL_REAL/../.." 2>/dev/null && pwd || echo "")

PLUGIN_ROOT=""
for candidate in \
  "${CLAUDE_PLUGIN_ROOT}" \
  "$HOME/.understand-anything-plugin" \
  "$SELF_RELATIVE" \
  "$COPILOT_SELF_RELATIVE" \
  "$HOME/.codex/understand-anything/understand-anything-plugin" \
  "$HOME/.opencode/understand-anything/understand-anything-plugin" \
  "$HOME/.pi/understand-anything/understand-anything-plugin" \
  "$HOME/understand-anything/understand-anything-plugin"; do
  if [ -n "$candidate" ] && [ -f "$candidate/package.json" ] && [ -f "$candidate/pnpm-workspace.yaml" ]; then
    PLUGIN_ROOT="$candidate"
    break
  fi
done

if [ -z "$PLUGIN_ROOT" ]; then
  echo "Error: Cannot find the understand-anything plugin root."
  exit 1
fi
```

### Phase 1: Guard on existing knowledge graph

Mechanism discovery requires the structural graph. If `.understand-anything/knowledge-graph.json` does not exist, tell the user to run `/understand` first and stop.

```bash
if [ ! -f "$PROJECT_ROOT/.understand-anything/knowledge-graph.json" ]; then
  echo "No knowledge graph found at $PROJECT_ROOT/.understand-anything/knowledge-graph.json"
  echo "Run /understand first to analyze the codebase."
  exit 1
fi
```

### Phase 2: Compute topology hints

Run the deterministic preprocessor. It walks the existing graph and produces attention-direction hints — no LLM cost.

```bash
node "$PLUGIN_ROOT/skills/understand-mechanisms/compute-topology-hints.mjs" "$PROJECT_ROOT"
```

This writes `$PROJECT_ROOT/.understand-anything/intermediate/topology-hints.json` with seven signal classes:

- `selfDescribed` — nodes named in README/architecture docs (highest signal)
- `fanInOutliers` — small load-bearing primitives
- `denseClusters` — coherent subsystems
- `bridgeNodes` — cross-layer integration points
- `commentSignals` — nodes whose summaries mention non-obvious markers
- `smallButCritical` — short modules with high reference density
- `todoMarkers` — places authors are still wrestling

If the script exits non-zero, log the error and stop.

### Phase 3: Read project overview

Provide the README and any top-level architecture docs as additional context for the agent's Pass 1 (self-description). Concatenate up to ~8 KB of:

- `README.md` (the repo root one)
- `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` if present
- The first ~200 lines of any obviously-architecture-shaped file in `docs/` (`docs/ARCHITECTURE.md`, `docs/design/*.md`)

Write the result to `$PROJECT_ROOT/.understand-anything/intermediate/project-overview.md`. (If nothing relevant exists, write an empty file — the agent handles absence.)

### Phase 4: Dispatch the mechanism-analyzer agent

Read the agent prompt from `$PLUGIN_ROOT/agents/mechanism-analyzer.md`. Dispatch a subagent with:

- The agent prompt (full)
- `$PROJECT_ROOT/.understand-anything/knowledge-graph.json` (the structural graph)
- `$PROJECT_ROOT/.understand-anything/intermediate/topology-hints.json` (the attention hints)
- `$PROJECT_ROOT/.understand-anything/intermediate/project-overview.md` (self-description text)

The agent writes its candidate mechanism list to `$PROJECT_ROOT/.understand-anything/intermediate/mechanism-analysis.json` in this shape:

```json
{
  "version": "1",
  "project": { /* same as knowledge-graph.project */ },
  "generatedAt": "<ISO>",
  "mechanisms": [ /* see agent prompt for full schema */ ]
}
```

If the agent reports zero mechanisms, that is a valid result. Save an empty `mechanisms: []` and continue.

### Phase 5: Validate and save

1. Read the agent output.
2. Validate using the `MechanismGraphSchema` from `@understand-anything/core`. Drop individual mechanisms that fail validation; keep the file.
3. Cross-check that all `participantNodeIds` and `climacticNodeId` values reference real IDs in the knowledge graph. Drop mechanisms with dangling references.
4. Write to `$PROJECT_ROOT/.understand-anything/mechanism-graph.json` (sibling to `domain-graph.json`).
5. Clean up the intermediate files.

Validation script (Node.js inline):

```bash
node --input-type=module -e "$(cat <<'EOF'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MechanismGraphSchema } from '$PLUGIN_ROOT/packages/core/dist/schema.js';

const projectRoot = process.argv[2];
const intermediate = join(projectRoot, '.understand-anything', 'intermediate', 'mechanism-analysis.json');
const finalPath = join(projectRoot, '.understand-anything', 'mechanism-graph.json');
const graphPath = join(projectRoot, '.understand-anything', 'knowledge-graph.json');

const raw = JSON.parse(readFileSync(intermediate, 'utf-8'));
const result = MechanismGraphSchema.safeParse(raw);
if (!result.success) {
  console.error('Mechanism graph schema validation failed:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

// Cross-check node IDs
const graph = JSON.parse(readFileSync(graphPath, 'utf-8'));
const knownIds = new Set(graph.nodes.map((n) => n.id));
const validMechanisms = result.data.mechanisms.filter((m) => {
  if (!knownIds.has(m.climacticNodeId)) {
    console.warn('Dropping mechanism with unknown climacticNodeId: ' + m.id);
    return false;
  }
  const danglingPart = m.participantNodeIds.find((id) => !knownIds.has(id));
  if (danglingPart) {
    console.warn('Dropping mechanism with dangling participant ' + danglingPart + ': ' + m.id);
    return false;
  }
  return true;
});

const out = { ...result.data, mechanisms: validMechanisms };
writeFileSync(finalPath, JSON.stringify(out, null, 2), 'utf-8');
console.log('Saved ' + validMechanisms.length + ' mechanisms to ' + finalPath);

// Clean up intermediates
unlinkSync(intermediate);
const overview = join(projectRoot, '.understand-anything', 'intermediate', 'project-overview.md');
if (existsSync(overview)) unlinkSync(overview);
const hints = join(projectRoot, '.understand-anything', 'intermediate', 'topology-hints.json');
if (existsSync(hints)) unlinkSync(hints);
EOF
)" "$PROJECT_ROOT"
```

### Phase 6: Report

Print a short summary to the user:

```
Found N mechanisms in <project>:
  - mechanism:<id> ("<name>") — <kind>
  - mechanism:<id> ("<name>") — <kind>
  ...

To generate a walkthrough for one of them:
  /understand-walkthrough mechanism:<id>

To regenerate the dashboard with mechanisms visible:
  /understand-dashboard
```

If N is zero, say so and explain that the agent didn't find any mechanisms in this codebase — that is a valid result, not a failure. Suggest the user double-check by running `/understand-mechanisms` after running `/understand --full` on a richer subset of the repo.

## Notes

- The existing `agents/domain-analyzer.md` is **not** invoked here. Mechanism discovery is independent of business-flow discovery; the two artifacts may overlap (a mechanism might also be a flow), and that is fine.
- The agent does **not** modify `knowledge-graph.json`. Mechanisms live in their own file (`mechanism-graph.json`), the way the domain graph lives in `domain-graph.json`.
- Walkthroughs are generated separately, opt-in, via `/understand-walkthrough <id>`.
