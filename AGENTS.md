# Repository Working Agreement

This file applies to the entire repository.

## Product boundary

Changes is an offline, deterministic jazz chord-progression studio. Runtime
music behavior comes from typed data, explicit theory laws, bounded algorithms,
and checked-in reviewed corpora. Do not add a model client, prompt, telemetry,
CDN, remote font, remote sample, or runtime network dependency.

The source tree is a ground-up replacement for the legacy monolithic HTML. Do
not move legacy inline JavaScript into new modules or preserve a behavior merely
because the old artifact happened to implement it.

## Read before changing code

1. Read `docs/ARCHITECTURE.md`.
2. Read the active Bead and all inherited context with `br show <id> --json`.
3. Read the relevant contract sections of `docs/REBUILD_PLAN.md`.
4. For theory/discovery work, also read `docs/THEORY_IDEA_WIZARD.md`.
5. For legacy regressions or cutover, read `docs/LEGACY_AUDIT.md`.

## Tracker workflow

- Use `br`, not `bd`, for issue state and dependencies.
- Use only `bv --robot-*` modes; never launch bare `bv`.
- Work the ready leaf tasks in dependency order:
  specification/fixtures, production implementation, then independent proof.
- Claim a leaf atomically before editing. Do not hoard multiple leaves.
- Close only after the task's named gates are green and the close reason records
  exact commands and results.
- Close a package epic only after all three child phases are complete.
- Run `br sync --flush-only` after Beads mutations. This command never runs Git.

## Source and generated files

- `src/index.html` and modules under `src/` are authoritative.
- `jazz_chord_progression_editor.html` is generated. Never hand-edit it.
- `dist/index.html` must be byte-identical to the tracked root artifact.
- The legacy root artifact may be replaced only by the guarded build after its
  commit, SHA-256, and size baseline in `docs/LEGACY_AUDIT.md` are verified.
- Keep manifests, locks, contracts, fixtures, and source tracked. Keep
  `node_modules/`, `dist/`, browser reports/caches, coverage, and temporary
  reproducibility roots ignored.

## Architecture invariants

- Preact is the only production package.
- Domain is spelling-first and uses exact rational musical time.
- Theory is pure and imports only domain. It receives content adapters by
  interface injection and never imports the compiled Atlas.
- Playback plans are immutable and shared by audio and MIDI.
- Audio owns one persistent graph and consumes only playback plans/serialized
  commands.
- UI renders selectors and dispatches application intents; it does not call
  audio, persistence, or export adapters directly.
- Only `application/document-validation.ts` may cast the opaque validated
  document brand.
- Type-only imports, re-exports, and private deep imports obey the same layer
  boundaries as runtime imports.
- Manual/Frozen pitches, source spellings, stable IDs, and exact durations are
  never silently repaired or optimized.

## Verification discipline

- Use independently authored fixtures; production output cannot certify itself.
- Every law has positive, negative/near-miss, transposition, and mutation proof.
- Every bounded search reports deterministic work/state/memory termination.
  Wall time is performance evidence, never a musical cutoff.
- Run real browser/audio/storage/download adapters wherever the active contract
  names them. Do not substitute a mock-only smoke test.
- No skipped, retried, quarantined, or silently relaxed release gate.
- Preserve detailed machine-readable diagnostics, seeds, hashes, versions,
  request logs, console/page errors, voice/listener counts, and exact diffs.
- Keep the worktree's unrelated changes intact. Do not commit, delete, move, or
  normalize another contributor's files unless the user explicitly asks.

## Foundation commands

The stable public commands are defined in `docs/ARCHITECTURE.md`. In
particular:

- Bun 1.3.14 owns package management, build, and non-browser tests.
- Playwright runs under a real supported Node 22, 24, or 26 process, never the
  Bun `node` shim.
- `bun scripts/validate-f0-contract.ts` validates the pre-build foundation
  specification without third-party packages.
- `bun run verify` is the aggregate release-facing gate once the scaffold
  exists.

<!-- bv-agent-instructions-v3 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`) for issue tracking and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) (`bv`) for graph-aware triage. Issues are stored in `.beads/` and tracked in git. Current `br` workspaces normally export `.beads/issues.jsonl`; older `bd`/legacy workspaces may use `.beads/beads.jsonl`. `bv` auto-discovers the supported JSONL files, so agents should use `br`/`bv` commands instead of hard-coding a single filename.

### Using bv as an AI sidecar

bv is a graph-aware triage engine for Beads projects. Instead of parsing .beads/issues.jsonl / .beads/beads.jsonl directly or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** bv handles *what to work on* (triage, priority, planning). `br` handles creating, modifying, and closing beads.

**CRITICAL: Use ONLY --robot-* flags. Bare bv launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:
- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

```bash
bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command

# Token-optimized output (TOON) for lower LLM context usage:
bv --robot-triage --format toon
```

Before claiming, verify current state with `br show <id> --json` or `br ready --json`. `recommendations` can include graph-important blocked or assigned work; only `quick_ref.top_picks` and non-empty `claim_command` fields represent claimable work.

#### Other bv Commands

| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with unblocks lists |
| `--robot-priority` | Priority misalignment detection with confidence |
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS, eigenvector, critical path, cycles, k-core |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions, cycle breaks |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |

#### Scoping & Filtering

```bash
bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
```

### br Commands for Issue Management

```bash
br ready --json                       # Show issues ready to work (no blockers)
br list --status=open --json          # All open issues
br show <id> --json                   # Full issue details with dependencies
br create --title="..." --type=task --priority=2 --json
br update <id> --status=in_progress --json
br close <id> --reason="Completed" --json
br close <id1> <id2> --reason="Completed" --json
br sync --flush-only                  # Export DB to JSONL after Beads mutations
```

### Workflow Pattern

1. **Triage**: Run `bv --robot-triage` to find the highest-impact actionable work
2. **Claim**: Use `br update <id> --status=in_progress --json`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id> --reason="Completed" --json`
5. **Sync**: Run `br sync --flush-only` after Beads mutations so the JSONL export is current

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready --json` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

### Git Policy

`br` never commits or pushes. Follow this repository's own git instructions before staging, committing, or pushing. If the repository says "commit only when asked," that rule overrides any generic workflow advice.

<!-- end-bv-agent-instructions -->
