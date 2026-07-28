# Changes — Jazz Progression Studio

An offline, deterministic jazz chord-progression studio designed to turn lead-sheet changes into an explainable, playable, portable chart—without accounts, telemetry, cloud services, or runtime AI.

> **Development status:** the visible application is now the first interactive
> **U0 studio checkpoint**, not yet the complete chord editor. It opens a real
> F2-decoded, F3-published document through A0 application state and supports
> title commit/refusal, undo/redo, responsive rails, and accessible mobile
> sheets. Chord authoring, contextual analysis, playback planning, persistence,
> import/export, presets, and the planned discovery tools are not connected yet.

## Why Changes

Jazz harmony tools often force a poor choice: move slowly through generic forms, accept opaque “smart” suggestions, or set up a full DAW before testing four bars. Changes is being built around a different promise:

- type changes as quickly as a lead sheet;
- preserve exact spelling, beat duration, stable identity, and manual voicings;
- hear one immutable musical timeline through dependable audio and MIDI paths;
- separate literal chord facts from contextual interpretations and optional suggestions;
- keep every search bounded, deterministic, explainable, and reproducible;
- keep the complete runtime in one file that works with the network blocked.

That is the release direction, not a description of the current visible shell. See [Roadmap](#roadmap) for the unshipped work.

## What works today

| Capability | Current state |
|---|---|
| Standalone page | `jazz_chord_progression_editor.html` opens directly from disk |
| Offline runtime | JavaScript and CSS are embedded; the shell has no remote runtime resource |
| Interactive studio checkpoint | A validated empty chart, undoable title editing, responsive Library/Harmony surfaces, and an honestly disabled transport |
| UI foundation | Strict TypeScript, Preact, source-owned primitives and CSS tokens, skip link, focus-managed sheets, reduced-motion and forced-colors handling |
| Reproducible build contract | Source-driven build, generated-file banner, byte-equality checks, size budget, CSP hashes, license inventory |
| Verification scaffold | Static policy tests, type checking, linting, reproducibility checks, and Chromium/Firefox/WebKit E2E harnesses |
| F1 domain runtime | Headless spelling-first identities, pitch projection, exact rational time, chord/voicing construction, immutable bounded copy/remap, and a 317-case reviewed authority corpus; decoder, semantic publication, and UI integration remain downstream |
| F2 decoder contract | Exact public types plus a production-independent 65-case structural/adversarial corpus, 12 requirement traces, 8 deterministic seeds, and 244 named mutation controls; the production decoder remains the next package |
| P0 exact playback-plan specification | Exact public request/result types plus a production-independent 83-case timeline, realization, loop, law, and limit corpus, 20 requirement traces, 11 authorities, and 42 mutation controls; the production compiler and transport wiring remain downstream |

The visible page intentionally reports **Foundation ready** and names the next gate. There is no hidden legacy editor behind it.

## Open the current artifact offline

1. Obtain this repository or the standalone `jazz_chord_progression_editor.html` file.
2. Open `jazz_chord_progression_editor.html` in a modern browser by double-clicking it or using the browser's **Open File** command.
3. Confirm that the page shows **Changes**, **Jazz Progression Studio**, and **Foundation ready**.

No local server, account, API key, or network connection is required. At this stage, the page is a readiness shell only; silence and the absence of editing controls are expected.

## Build from source

### Prerequisites

- **Bun 1.3.14** for dependency installation, builds, and non-browser tests.
- A real **Node.js 22, 24, or 26** process for Playwright. Node 24.18.0 is the preferred pinned version.
- Chromium, Firefox, and WebKit browser binaries when running the full E2E matrix.

The project deliberately rejects Bun's `node` compatibility shim for Playwright. Preact 10.29.7 is the only production package; all other exact versions live in `package.json` and `bun.lock`.

```bash
# Reproduce the exact dependency graph
bun install --frozen-lockfile

# Confirm Bun, dependency pins, and the real Node runtime
bun run doctor:toolchain

# Start the source development server
bun run dev
```

If the Playwright browsers are not installed yet:

```bash
bun scripts/run-playwright.ts install chromium firefox webkit
```

### Generate the standalone file

```bash
bun run build
```

One build produces:

- `dist/index.html`, the inspectable local build output;
- `jazz_chord_progression_editor.html`, the tracked canonical artifact;
- `dist/standalone-manifest.json`, the deterministic hash, size, CSP, asset, and license record;
- `dist/licenses.json`, the production dependency and embedded-asset inventory.

The two HTML outputs must be byte-identical. The measured studio checkpoint has
a 1 MiB ceiling; the completed artifact retains its 1.5 MiB ceiling and a
separate 512 KiB reservation for the future reviewed Harmonic Atlas/content.

## Source and generated-file ownership

`src/index.html` and modules under `src/` are authoritative. The root HTML file is generated and must never be hand-edited.

```text
src/index.html + src/**/*.ts(x) + src/styles/*.css
                         │
                         ▼
                    bun run build
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
dist/index.html       jazz_chord_progression_editor.html
            └────── byte-identical ───┘
```

The generated artifact begins with:

```html
<!-- @generated; edit src/, then run bun run build -->
```

If source and artifact disagree, regenerate the artifact; do not copy changes back from generated HTML.

## Commands

| Command | Purpose |
|---|---|
| `bun run dev` | Serve `src/index.html` with Bun's development server |
| `bun run doctor:toolchain` | Verify exact package pins and locate a supported real Node runtime |
| `bun run validate:f0-contract` | Validate the machine-readable F0 contract without third-party packages |
| `bun scripts/validate-f0-contract.ts` | Equivalent direct foundation-contract command documented for automation |
| `bun run validate:f1-contract` | Validate the independently authored F1 domain authority corpus, trace ledger, limits, matrices, and mutation-sensitive contract |
| `bun run validate:f2-contract` | Validate the independently authored F2 decoder schema, adversarial corpus, trace ledger, and mutation controls |
| `bun run validate:v0-contract` | Validate the independently authored V0 voicing-family templates, applicability matrix, goldens, operation states, limits, transpositions, trace, provenance, and mutation authority |
| `bun run validate:v2-contract` | Validate the independently authored V2 progression-optimizer beam/Pareto/tie-break/window/loop/stepper corpus, trace, provenance, and mutation authority with reference and brute-force recomputation |
| `bun run validate:p0-contract` | Validate the independently authored P0 playback-plan timeline, realization, loop, law, exact-limit, trace, provenance, and mutation authority corpus |
| `bun run validate:c0-contract` | Validate the independently authored C0 legacy corpus, precedence, hostile-input, report, trace, provenance, and mutation authority |
| `bun run validate:e1-contract` | Validate the independently authored E1 MIDI-export byte goldens (independent SMF parser and derivation), refusal precedence, limits, filename law, trace, provenance, and mutation authority |
| `bun run validate:e0-contract` | Validate the accepted E0 JSON/text interchange, transactional application boundary, exact limits, goldens, trace, provenance, and mutation authority |
| `bun run validate:a0-e0-bridge-contract` | Validate the proposed A0-owned replacement-registry, latest-identity, atomic marker-CAS, state-isolation, literal fixtures, traces, provenance, and mutations while pinning immutable accepted E0 v1 without claiming semantic compatibility |
| `bun run validate:a0-u1-edit-plan-contract` | Validate the proposed additive A0/U1 atomic-edit command, five closed plan variants, literal state transitions, exact identity/time/bookmark/history laws, traces, provenance, and mutations without claiming production or UI completion |
| `bun run validate:u1-contract` | Validate the proposed independent U1 quick-entry insertion-plan classification, operation-to-application-channel binding, selection/focus/pointer/listener states, exact bounds, traces, provenance, and replayed mutation controls |
| `bun run validate:a1-contract` | Validate the proposed A1 recovery envelope/checksum, scheduler, adapter, startup-matrix, export-binding, trace, provenance, and mutation authority |
| `bun run validate:x1-contract` | Validate the proposed X1 serialized-transport state matrix, timing goldens, scheduler/stop/command/notification witnesses, trace, provenance, and mutation authority |
| `bun run typecheck` | Run strict TypeScript checks across app, tools, tests, and E2E code |
| `bun run lint` | Run ESLint, source-integrity checks, and dependency-boundary checks |
| `bun test` | Run Bun unit/static tests |
| `bun run test:e2e` | Run Playwright against Chromium, Firefox, and WebKit with a real Node process |
| `bun run build` | Generate the root and `dist` standalone artifacts and deterministic reports |
| `bun run verify:standalone` | Run static inspection plus six-cell offline, negative-control, and F0 accessibility browser proofs |
| `bun run verify:reproducible` | Rebuild in isolated paths with different mtimes and compare bytes/manifests |
| `bun run verify:licenses` | Verify production package and embedded-asset provenance |
| `bun run verify:f1-evidence` | Run the exact F1 suite and emit a hash-bound trace/seed/mutation ledger under `test-results/` |
| `bun run verify:c0-evidence` | Run the exact C0 suite and emit a hash-bound adversarial-case, preset, trace, counter, and mutation ledger under `test-results/` |
| `bun run verify:v2-evidence` | Re-run the exact V2 suite and validator from a drift-checked input closure, sweep seeded metamorphic charts against an independent exhaustive fold, and emit a hash-bound ledger under `test-results/` |
| `bun run verify:e1-evidence` | Re-run the exact E1 MIDI-export suite and validator from a drift-checked input closure, sweep seeded plans through a freshly written independent SMF reader with replay, marker-permutation, tempo-isolation, and loss-recomputation relations, and emit a hash-bound ledger under `test-results/` |
| `bun run verify` | Run the aggregate release-facing gate in dependency order |

The aggregate gate does not silently skip, retry, quarantine, or relax a failed check.
The F1 evidence gate snapshots its complete source/fixture/test input closure
before and after the run, rejects drift, and records deterministic work counters;
measured wall time and process resources are observations, never musical cutoffs.

## Architecture

The completed system is specified as a set of strict layers. The diagram describes the target architecture; most layers beyond the F0 shell are not implemented yet.

```text
                         ui (Preact)
                              │ intents / selectors
                              ▼
                 application commands + services
                    │          │          │
                    ▼          ▼          ▼
              persistence    export    content adapter
                    ▲          ▲          │ injection
                    │          │          ▼
domain ◄──────── theory ◄── playback plans
   ▲               ▲              │
   └─ compatibility               ├────────► audio
                                  └────────► MIDI export
```

The load-bearing rules are:

- `domain` owns spelling-first values, stable IDs, document shapes, and exact rational musical time; it imports no project layer.
- `theory` is pure, imports only `domain`, and receives reviewed content through an injected read-only interface.
- `playback` creates immutable beat/tick plans shared by audio and MIDI export.
- `audio` owns one persistent Web Audio graph and consumes plans and serialized transport commands, never UI state.
- `application` owns commands, history, validation publication, service orchestration, and selectors.
- `ui` renders selector values and dispatches intents; it does not call audio, storage, or export adapters directly.
- `main.tsx` is the only composition root.

Only Preact may ship as a production package. The planned design system follows the source-owned approach popularized by shadcn, but is implemented in native Preact and CSS—not React, Radix, Tailwind, a shadcn package, or a compatibility layer.

For the normative contracts, read [Architecture](docs/ARCHITECTURE.md) and the [Rebuild Plan](docs/REBUILD_PLAN.md).

## Roadmap

The F0 shell and headless F1 domain package are current source capabilities;
the visible editor and every later row remain planned work. A capability is not
considered shipped until its production implementation and independent proof
are both complete.

| Gate | Status | Intended outcome |
|---|---|---|
| F0 standalone shell | Current | Pinned toolchain, strict source boundaries, self-contained generated page, offline/reproducibility verification |
| F1 headless domain | Current | Spelling-first IDs and pitches, exact rational time, chord/voicing values, immutable bounded copy/remap, and independently reviewed fixtures |
| Foundation continuation | Planned | Total document decoder and semantic publication, chord parser/resolver, and independent theory corpus |
| Reliable studio | Planned | Chart editing, commands/history, recovery, exact manual/frozen voicings, deterministic transport/audio, JSON and text workflows |
| Musical intelligence | Planned | Evidence-bearing analysis, transposition, tonal journeys, reviewed Atlas, fingerprints, and plural contextual continuation options |
| Advanced craft | Planned | Bounded route and constraint search, proof-carrying reharmonization, guide-tone/color/rhythm/tension/sequence tools, MIDI, and practice workflows |
| Release proof | Planned | Current browser/device, audio, accessibility, migration, security, performance, listening, and reproducible-artifact evidence |

The planned Harmonic Discovery set contains fifteen deterministic systems:

1. Contextual Continuation Engine
2. Validated Progression Atlas and preset compiler
3. Goal-directed Harmonic Route Planner
4. Constraint Harmonization Workbench
5. Proof-carrying reharmonization branches
6. Multi-hypothesis Tonal Journey Map
7. Guide-Tone Line Designer
8. Contextual Color and Upper-Structure Laboratory
9. Cadence, Phrase, and Approach Builder
10. Harmonic-rhythm transformation engine
11. Harmonic tension/release curve designer
12. Progression fingerprint and similarity explorer
13. Motif and sequence transformation engine
14. Nonfunctional/common-tone transformation atlas
15. Chart-to-Practice Laboratory

These systems are designed as typed rules, reviewed corpora, and bounded algorithms. Development-time AI may help draft quarantined candidates, but no model, prompt, endpoint, probabilistic inference, or generated candidate enters the runtime. Content must be decoded, law-checked, reviewed, and checked in before it can ship.

## Browser support target

The project does not yet make a final end-user browser-support claim. The release target is:

| Surface | Required target evidence |
|---|---|
| Direct local file | Playwright Chromium, Firefox, and WebKit with every nonlocal request denied |
| Loopback HTTP | The same three engines with one allowed top-level document request and no subresources |
| Desktop audio | Current Chrome, Firefox, and Safari manual verification before claiming support |
| Touch | Android Chrome and iOS Safari activation and layout verification before claiming support |
| Accessibility | Keyboard, screen reader, 320 px layout, 200% zoom, reduced motion, forced colors, and automated rule scans |

Playwright WebKit is an engine-level automated target, not a substitute for the required real Safari checks. Missing real-device evidence narrows the published support claim; it does not get waived.

## Privacy and security

The runtime boundary is intentionally small:

- no analytics, telemetry, ads, account, cookie, cloud sync, remote API, model client, CDN, remote font, or remote sample;
- no runtime `fetch`, XMLHttpRequest, WebSocket, EventSource, beacon, service worker, worker, dynamic import, or worklet module loading;
- embedded hash-based Content Security Policy with network, worker, object, frame, manifest, base, and form destinations denied;
- all executable CSS and JavaScript embedded in the generated file and authorized by generated hashes;
- static capability inspection plus real-browser request interception, including a malicious negative-control fixture;
- deterministic license and embedded-asset inventory.

The current shell does not accept or store chart data. Planned recovery will remain local and best-effort; planned exports will occur only after an explicit user gesture. Imported text and JSON will cross bounded decoders and will never be evaluated, inserted as HTML, or turned into a URL.

A single local file is portable, but it is not cloud backup. When authoring and export arrive, users will remain responsible for keeping copies of important charts.

## Current limitations

- This is an engineering foundation, not a usable progression editor yet.
- There is no chord input, chart model, theory parser, analysis, suggestion engine, audio engine, transport, persistence, import, export, MIDI, preset browser, lesson, or practice mode in the current UI.
- Legacy application behavior was deliberately removed rather than copied forward; no legacy compatibility path is available yet.
- The final browser and real-device support matrix is not certified.
- The current UI is a dark foundation shell. The broad owned component library and complete studio workspace are planned.
- The page requires JavaScript. With JavaScript disabled it displays only an explanatory fallback message.
- There is no backend, collaboration, account, cloud sync, MusicXML, score engraving, MIDI input, microphone input, audio recording, plugin system, or runtime AI in the release scope.

## Troubleshooting

### The page opens, but there are no editor or playback controls

That is the expected F0 state. The current page should show **Foundation ready**. Editing and playback are roadmap items, not dormant controls.

### Playwright reports `PLAYWRIGHT_RUNTIME_UNSUPPORTED`

Install a real Node.js 22, 24, or 26 runtime. If it is not discoverable on `PATH`, point the project at it explicitly:

```bash
JCPE_NODE=/absolute/path/to/node bun run doctor:toolchain
JCPE_NODE=/absolute/path/to/node bun run test:e2e
```

`NODE_BINARY` is also accepted. Do not point either variable at Bun's `node` shim.

### Playwright cannot find a browser executable

Install the exact browser binaries used by the pinned Playwright package:

```bash
bun scripts/run-playwright.ts install chromium firefox webkit
```

Then rerun `bun run test:e2e`.

### The generated artifact differs from source

Edit files under `src/`, then regenerate and verify:

```bash
bun run build
bun run verify:standalone
```

Never repair the mismatch by hand-editing `jazz_chord_progression_editor.html`.

### Frozen installation reports a lockfile mismatch

Confirm that Bun 1.3.14 is active:

```bash
bun --version
bun run doctor:toolchain
```

Do not rewrite `bun.lock` merely to bypass the failure. Dependency changes require an intentional contract and fixture update.

### The shell does not render when opened from disk

Confirm that you opened the generated root file rather than `src/index.html`, that JavaScript is enabled, and that the first line is the generated-file banner. For a source build, run `bun run build` again and inspect the result with `bun run verify:standalone`.

## FAQ

### Is the old editor still inside the generated file?

No. The rebuild is a ground-up replacement. Legacy behavior is retained only as audit and migration evidence, not as a second runtime.

### Does Changes use AI to choose chords?

No. The runtime product boundary forbids models and prompts. Planned suggestions are plural outputs from explicit laws, reviewed corpora, deterministic ranking, and bounded search.

### Why Preact instead of installing shadcn/ui?

The release must remain one small offline file with Preact as its only production package. The planned UI adopts the useful shadcn philosophy—owned, editable component source—while implementing behavior directly in Preact and CSS.

### Where will charts be saved?

They are not saved by the current shell. The planned studio distinguishes best-effort local recovery from explicit versioned JSON export; it will not label browser recovery as a durable “Save.”

### Can I import a chart from the legacy app?

Not yet. A bounded legacy decoder and itemized migration report are planned. Unsupported data will be preserved as a diagnostic or refused, never silently changed into a different chord.

### Is a local web server required?

No. Direct `file://` opening is a core contract. Loopback HTTP is a second mandatory verification mode, not a runtime requirement.

## About Contributions

> *About Contributions:* Please don't take this the wrong way, but I do not accept outside contributions for any of my projects. I simply don't have the mental bandwidth to review anything, and it's my name on the thing, so I'm responsible for any problems it causes; thus, the risk-reward is highly asymmetric from my perspective. I'd also have to worry about other "stakeholders," which seems unwise for tools I mostly make for myself for free. Feel free to submit issues, and even PRs if you want to illustrate a proposed fix, but know I won't merge them directly. Instead, I'll have Claude or Codex review submissions via `gh` and independently decide whether and how to address them. Bug reports in particular are welcome. Sorry if this offends, but I want to avoid wasted time and hurt feelings. I understand this isn't in sync with the prevailing open-source ethos that seeks community contributions, but it's the only way I can move at this velocity and keep my sanity.

## License

Copyright (c) 2026 Jeffrey Emanuel.

The repository is distributed under the [MIT License with OpenAI/Anthropic Rider](LICENSE). The rider adds material restrictions for named parties and must be read with the license text; do not assume the unmodified MIT terms apply.
