# Changes — Jazz Progression Studio

An offline, deterministic jazz chord-progression studio designed to turn lead-sheet changes into an explainable, playable, portable chart—without accounts, telemetry, cloud services, or runtime AI.

> **Development status (2026-09-08):** Changes is a working editor and
> playback studio, with substantial recovery, interchange and voicing tools.
> The repository includes newer exact-sharing, My Charts and Focus workflows
> than the build currently served at <https://jazzchords.org>. Full harmonic
> discovery and release acceptance remain incomplete. The current candidate
> passes the DSP source/WASM and instrument gates. The aggregate now stops at
> required X1 human listening evidence; later release gates remain unverified.
> See the [implementation status](docs/IMPLEMENTATION_TODO.md), [reality check](docs/REALITY_CHECK.md)
> and [limitations](#current-limitations).

## Why Changes

Jazz harmony tools often force a poor choice: move slowly through generic forms, accept opaque “smart” suggestions, or set up a full DAW before testing four bars. Changes is being built around a different promise:

- type changes as quickly as a lead sheet;
- preserve exact spelling, beat duration, stable identity, and manual voicings;
- hear one immutable musical timeline through dependable audio and MIDI paths;
- separate literal chord facts from contextual interpretations and optional suggestions;
- keep every search bounded, deterministic, explainable, and reproducible;
- keep the complete runtime in one file that works with the network blocked.

That bounded, explainable design remains the product contract. See [Roadmap](#roadmap) for work that is still intentionally unshipped.

## FrankenJazz for iPhone, iPad, and Mac

The repository now also contains `ios/`, a native SwiftUI sibling named
**FrankenJazz**. It is not a WebView wrapper. The Apple app includes native
lead-sheet entry, a bundled progression library, literal/contextual chord
inspection, six voicing families, transposition, an adaptive iPhone/iPad/Mac
workspace, asynchronous generated playback, local recovery, per-chord frozen
and manual exact voicings with note-by-note pitch editing, and real
FrankenJazz JSON, chart-text, and Standard MIDI files.

The Apple app has no account, telemetry, third-party AI service, sample
download, or runtime dependency on the website. See
[`docs/APPLE_APP_PLAN.md`](docs/APPLE_APP_PLAN.md) for its capability map and
acceptance gates, and [`ios/README.md`](ios/README.md) for build instructions.

## What works today

This table describes the repository build at `1bd322d`, including batch MIDI comparison. September 8 checks of both
[jazzchords.org](https://jazzchords.org/) and its
[Vercel mirror](https://changes-jazz-progression-studio.vercel.app/) recorded the
older committed artifact from `11ef504`. Both boot and play in desktop and phone
browsers, but lack the newer My Charts and Focus controls and exact-sharing
dialog. The [reality check](docs/REALITY_CHECK.md#committed-source-and-public-delivery)
records exact hashes and the release blocker. Historical Cloudflare login
problems have been resolved; deployment freshness is a separate requirement.

| Capability | Current state |
|---|---|
| Standalone page | `jazz_chord_progression_editor.html` opens directly from disk; the deployment command stages committed bytes for Cloudflare Pages and its Vercel mirror |
| Offline runtime | Every script, style, font, sample, and WASM payload is embedded; the hash-based CSP denies all network destinations |
| Chart authoring | Engraved sheet view and grid edit view over the demo chart; quick entry (`⌘K` / Type changes) for whole charts; per-chord inline editing, exact beat durations, measure/section structure edits, drag moves, range selection, and single-step undo/redo (U1 acceptance E2E) |
| Analysis | Literal-first Harmony Lens: chord tones with degrees, chord scale, guide tones, guide-tone motion into the next chord, and plural next-chord options with one-line reasons ("Options, not answers"); roman numerals and phrase brackets on the sheet. Deliberately narrower than the planned H0 evidence-tier engine and says so in source |
| Exact voicings | Choose and audition alternatives, keep a Frozen realization, or edit up to 16 exact Manual notes in the chord inspector; complete U2 package proof remains open |
| Playback | One persistent Web Audio graph, serialized transport with loop/seek/pause/live mix, 7 grooves, and 15 instruments spanning physical models (clarinet, flute, four plucked strings), the hybrid concert grand, and CC0-sampled bass/vibes — every shipping model gated by the model-acceptance ledger |
| Progression library | 27 library entries plus the starter chart, with a machine-checked provenance law |
| MIDI import | Compare up to five local `.mid` candidates with explained, deterministic rankings; inspect any candidate before Add. Includes a Rust SMF parser in WASM, salvage ledger, per-track preview/overrides, and automated groove matching (M0 shipped; M1 owner-listening gate open) |
| Recovery | Best-effort IndexedDB with localStorage fallback, revision-bound writes, automatic current recovery when startup is untouched, Keep/Discard for conflicts, previous-copy fallback, and visible storage failures |
| Chart import | Local Changes/legacy JSON files and pasted data get a bounded preview before replacement; migration reports disclose retained data, confirmation retires playback, and imported document IDs survive recovery |
| JSON export | **Export JSON** prepares and validates a portable chart, then **Download JSON** hands it to the browser; only exact successful delivery advances the export marker |
| My Charts | Explicit local collection with search, rename, fresh-ID duplication, confirmed replacement/removal, and exact portable backups; atomic IndexedDB writes refuse stale tabs and preserve existing charts on failure |
| Chart-text export | **Export text** checks the supported chart structure and lists lost voicing, identity, analysis, and playback data before download; it leaves the JSON export marker unchanged |
| MIDI export | Deterministic Standard MIDI files with preview, blocker cards, and real downloads (E1 + U7) |
| Share links | **Share** carries the entire exact chart in a bounded `#zdoc=2.` fragment, including Manual/Frozen notes and annotations; oversized charts offer exact JSON and existing v1 links remain readable |
| Reproducible build contract | Source-driven build, generated-file banner, byte-equality checks, size budget, CSP hashes, license inventory |
| Verification | 71-gate aggregate `verify` (contract validators, evidence gates with hash-bound ledgers, typecheck, lint, unit/property/mutation suites, build, reproducibility, licenses, Chromium/Firefox/WebKit E2E), plus real-browser predeploy playback and model-acceptance gates |

There is no hidden legacy editor behind the page; the studio is the ground-up rebuild.

## Open the current artifact offline

1. Obtain this repository or the standalone `jazz_chord_progression_editor.html` file.
2. Open `jazz_chord_progression_editor.html` in a modern browser by double-clicking it or using the browser's **Open File** command.
3. Confirm that the page opens the JazzChords studio with a demo chart loaded — press **Play** to hear it, or **Clear** to start your own.

No local server, account, API key, or network connection is required.

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

The two HTML outputs must be byte-identical. The enforced artifact ceiling is
9 MiB (`maxUncompressedBytes: 9437184`, the same figure the reviewed PHS7
physical-system contract pins), with a hard 512 KiB reservation for the
future Harmonic Atlas and an 8,912,896-byte shell allocation; the current
tracked artifact at `a50e471` measures 8,428,308 bytes. The full amendment history and the
reclamation path (physical models replacing the ~2.8 MB sampled payloads)
are recorded in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

On Linux, the browser test runner defaults Mesa software rendering to at most four workers to avoid excess rendering threads on large hosts. An explicit `LP_NUM_THREADS` setting takes precedence; see [Mesa's rendering-thread setting](https://docs.mesa3d.org/envvars.html#envvar-LP_NUM_THREADS).

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
| `bun run validate:u7-contract` | Validate the proposed independent U7 MIDI-export-workflow preview model, derivation laws, state machine, accessibility matrix, limits, traces, provenance, and replayed mutation controls without claiming any U7 implementation |
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

The table above is representative, not exhaustive — `package.json` carries the
complete set, including the M0/M1 MIDI-import validators, the PHS0–PHS7
physical-synthesis contract validators, `bun run quality:instruments`, and the
two deploy gates (`bun run predeploy:check`, `bun run predeploy:playback`)
documented in [`docs/DEPLOY_GATE.md`](docs/DEPLOY_GATE.md).

The aggregate gate does not silently skip, retry, quarantine, or relax a failed check.
The F1 evidence gate snapshots its complete source/fixture/test input closure
before and after the run, rejects drift, and records deterministic work counters;
measured wall time and process resources are observations, never musical cutoffs.

## Architecture

The source implements the domain, application, playback, audio, persistence, export and Preact UI layers below. The diagram also includes the planned reviewed-content adapter. Deeper harmonic-discovery implementations and their consumers remain incomplete; layer presence alone does not establish musical correctness.

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

Only Preact may ship as a production package. The design system follows the source-owned approach popularized by shadcn, but is implemented in native Preact and CSS—not React, Radix, Tailwind, a shadcn package, or a compatibility layer.

For the normative contracts, read [Architecture](docs/ARCHITECTURE.md) and the [Rebuild Plan](docs/REBUILD_PLAN.md).

## Roadmap

A capability is not considered shipped until its production implementation and
independent proof are both complete; a row below is "Current" only when both
hold for its named packages, and mixed rows say what remains.

| Gate | Status | State |
|---|---|---|
| Foundation (F0–F3, T0–T1) | Complete | Pinned toolchain, standalone artifact, total decoder, chord parser/resolver, semantic publication, independent theory corpus — all package epics closed with evidence gates in `verify` |
| Reliable studio | Largely current | Chart editing, commands/history, deterministic transport/audio, voicing engines, and MIDI import/export ship today. Recovery, JSON/legacy import, JSON export, and chart-text export are connected in the repository build. U5 lifecycle is complete; U2 exact voicing editing is implemented with package proof still open. U4 transport proof and identified regression gates remain open |
| Musical intelligence | Reduced subset shipped | The live Harmony Lens/roman numerals/next options are an honest narrower substitute; H0 literal facts now exist, but contextual/scale operations are missing. H1 and discovery engine code have known semantic defects, and their complete workflows remain open |
| Advanced craft | Early pieces shipped | V2 progression optimizer, E1 MIDI export, and the U7 export workflow landed ahead of schedule; route/constraint search, reharmonization, guide-tone/color/rhythm/tension/sequence and practice code is partial and not accepted as the complete planned workflows |
| Physical instruments | In progress | Clarinet v2, flute v2, and four plucked models ship behind the model-acceptance ledger; trumpet and physical vibes/bass remain dark pending performance and owner listening |
| Release proof | Incomplete | Browser-suite admission and DSP source binding are repaired. The aggregate reaches X1 and stops for required human listening evidence. Publication-cast work, the full browser/device matrix and human accessibility acceptance remain outstanding; later aggregate gates are not assumed green |

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

The studio keeps edits in browser-local, best-effort **Recovery** using IndexedDB or a localStorage fallback. An untouched reload automatically opens a valid current copy and explains what opened. **Discard local copy** removes the stored recovery while leaving the chart open; **New chart** uses the usual replacement workflow. Explicit share links, edits or drafts entered while storage is being checked, and disagreement with the last JSON export require a Keep/Discard choice. An unreadable current copy can fall back to an offered previous copy. The demo loads only when there is no recovery and the workspace is still untouched. An unanswered offer preserves the stored copies until a decision is made. Storage failure stays visible and does not block editing. **Export JSON** makes a portable versioned file; preparing or cancelling an export changes no marker. “Handed off” means the browser received the file, so check its downloads for the actual file.

**Export text** makes a readable lead sheet with canonical chord symbols, exact durations, sections, annotations, and global key, meter, and tempo. Its preview lists the data text cannot preserve. Custom chords and pickup or incomplete measures require JSON; text export refuses them without changing the chart. Downloading text does not mark the chart as exported to JSON.

All exports require an explicit gesture. **Copy exact link** encodes the complete published chart into a bounded `#zdoc=2.` URL fragment, preserving exact notes, spellings, durations, annotations and settings. Larger charts offer exact JSON instead. No request is made: the fragment leaves the page only when you share the link. Opening it crosses the existing validation and replacement boundary; a refusal preserves the workspace with a diagnostic. Existing v1 links remain readable with their omissions disclosed. Imported data is never evaluated or inserted as HTML.

Local recovery is not cloud backup. Keep JSON copies of important charts; browser storage can be unavailable, cleared, or limited by quota.

## Current limitations

- You cannot transpose a chart yet; key selection changes the analysis
  context only (spelled transposition is the planned H1 package).
- The repository supports choosing, auditioning, freezing and manually editing
  voicings. Complete U2 proof and the broader U6 voicing workbench remain open.
- JSON/legacy import, JSON and chart-text export, exact share links, My Charts
  and MIDI export are available in the repository build. The live sites still
  serve an older build; see the status above.
- Recovery and My Charts use best-effort browser storage. U5 lifecycle is
  complete, but a local collection is not a durable backup; keep portable JSON files.
- Legacy application behavior was deliberately removed rather than copied
  forward; the bounded legacy importer reports every supported migration and refuses unsupported data.
- The full Harmonic Discovery workflows are not delivered. Partial engine code
  contains known hashing, exact-time, transposition, constraint and grading
  defects; the live analysis panel is a deliberately narrower implementation.
- The final browser and real-device support matrix is not certified, and
  the human listening/accessibility evidence sessions are outstanding.
- The page requires JavaScript. With JavaScript disabled it displays only an
  explanatory fallback message.
- There is no backend, collaboration, account, cloud sync, MusicXML, score
  engraving, MIDI input, microphone input, audio recording, plugin system,
  or runtime AI in the release scope.

## Troubleshooting

### The page opens, but there are no editor or playback controls

That is not expected: the page should open the full studio with a demo
chart, a chart workspace, and a transport bar. A blank or minimal page
usually means the file is truncated or JavaScript is disabled — confirm the
first line is the generated-file banner and re-download or rebuild
(`bun run build`).

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

### Wind reference tests report `REFERENCE_CORPUS_ABSENT` or the predeploy gate reports `MODEL_DELEGATED_INVALID_EVIDENCE`

The machine-delegated wind acceptance rows are replayed against the
University of Iowa anechoic reference recordings, which are third-party
audio and not part of the repository. A clean checkout must install them
once into `test-results/winds-reference-source/uiowa/` — the exact files,
URLs, and SHA-256 pins live in
`tests/fixtures/uiowa-wind-identity-corpus.v1.json`, and the procedure is in
[`docs/DEPLOY_GATE.md`](docs/DEPLOY_GATE.md) under **Reference corpus
prerequisite**.

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

Edits queue best-effort local recovery. An untouched reload can open the current copy automatically. If a recovery choice appears, choose **Keep recovered chart** or **Discard** before relying on further local recovery. Discarding an automatically opened local copy leaves the chart in memory; further edits create another recovery copy. For a portable copy, choose **Export JSON**, review the filename and revision, then **Download JSON** and check your browser’s downloads. Browser recovery is never a durable “Save.”

**My Charts** keeps explicit snapshots separately from recovery. Choose **Keep current chart**, then select a kept chart to open, rename, duplicate, replace or remove it. Renaming changes the kept copy; editing the open chart never silently updates the collection. **Download backup** creates a portable collection file, and **Restore backup** previews additions and asks you to choose each conflicting version before one atomic restore. The collection holds up to128 charts and32MiB in this browser. If storage is unavailable, **Download current chart JSON** remains available. See [the exact collection and backup contract](docs/MY_CHARTS.md).

### Can I import a chart from the legacy app?

Choose **Import chart**, then select a local JSON file or paste its contents. Review the chart summary and migration report, then review and confirm replacement when requested. Selecting a file never replaces the current chart. Manual notes remain exact; unsupported data produces a diagnostic or refusal. Chart text goes to **Quick entry** for insertion instead of replacing the document.

### Is a local web server required?

No. Direct `file://` opening is a core contract. Loopback HTTP is a second mandatory verification mode, not a runtime requirement.

## About Contributions

> *About Contributions:* Please don't take this the wrong way, but I do not accept outside contributions for any of my projects. I simply don't have the mental bandwidth to review anything, and it's my name on the thing, so I'm responsible for any problems it causes; thus, the risk-reward is highly asymmetric from my perspective. I'd also have to worry about other "stakeholders," which seems unwise for tools I mostly make for myself for free. Feel free to submit issues, and even PRs if you want to illustrate a proposed fix, but know I won't merge them directly. Instead, I'll have Claude or Codex review submissions via `gh` and independently decide whether and how to address them. Bug reports in particular are welcome. Sorry if this offends, but I want to avoid wasted time and hurt feelings. I understand this isn't in sync with the prevailing open-source ethos that seeks community contributions, but it's the only way I can move at this velocity and keep my sanity.

## License

Copyright (c) 2026 Jeffrey Emanuel.

The repository is distributed under the [MIT License with OpenAI/Anthropic Rider](LICENSE). The rider adds material restrictions for named parties and must be read with the license text; do not assume the unmodified MIT terms apply.
