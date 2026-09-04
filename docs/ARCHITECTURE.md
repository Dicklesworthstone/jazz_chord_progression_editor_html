# Changes Architecture

Status: foundation contract

This document is the code-facing architecture contract for the rebuilt
**Changes — Jazz Progression Studio**. It complements the product and theory
decisions in `REBUILD_PLAN.md`, but it is deliberately sufficient for an
implementation agent to decide where code belongs, which imports are legal,
what the release artifact is, and how those claims are proved.

## Source of truth

- `src/index.html` and modules under `src/` are authoritative.
- `dist/index.html` is an inspectable build output.
- `jazz_chord_progression_editor.html` is the canonical generated release
  artifact. It must be byte-identical to `dist/index.html` and is never
  hand-edited.
- `tests/fixtures/foundation/foundation-contract.json` is the machine-readable
  F0 contract. Static/build tests consume it; build code must not generate its
  own expected values.
- `tests/fixtures/decoder/f2-decoder-contract.json` and its declared companions
  are the machine-readable F2 structural-decoder authority. Production decoder
  output may be compared with it but may never generate its expectations.
- `docs/T0_SYNTAX_CONTRACT.md`,
  `tests/fixtures/theory/t0-syntax-contract.json`, and their declared
  companions are the independently authored T0 symbol/chart syntax authority.
  Production parsers and formatters may be compared with them but may never
  generate their expectations.
- `docs/T1_RESOLUTION_CONTRACT.md`,
  `tests/fixtures/resolution/t1-resolution-contract.json`, and their declared
  companions are the independently authored T1 chord-resolution, degree-role,
  and spelling authority. Production resolvers may be compared with them but
  may never generate their expectations.
- `docs/V0_VOICING_CONTRACT.md`,
  `tests/fixtures/voicing/v0-voicing-contract.json`, and their declared
  companions are the independently authored V0 family-template, candidate,
  operation-state, limit, transposition, trace, provenance, and mutation
  authority. Production voicing generation may be compared with them but may
  never generate their expectations.
- `docs/V1_VOICE_ASSIGNMENT_CONTRACT.md`,
  `tests/fixtures/voice-assignment/v1-voice-assignment-contract.json`, and their
  declared companions are the independently authored V1 noncrossing alignment,
  voice-identity, motion, lock, cost, work-bound, provenance, trace, and mutation
  authority. Production voice assignment may be compared with them but may
  never generate their expectations.
- `docs/F3_PUBLICATION_CONTRACT.md`,
  `tests/fixtures/publication/f3-publication-contract.json`, and their declared
  companions are the independently authored F3 semantic-publication,
  transaction, diagnostic, work-bound, provenance, and mutation authority.
  The production publication gate may be compared with them but may never
  generate their expectations.
- `docs/P0_PLAYBACK_PLAN_CONTRACT.md`,
  `src/playback/playback-plan-contract.ts`,
  `tests/fixtures/playback-plan/p0-playback-plan-contract.json`, and its declared
  companions define the P0 public playback-plan interface and independently
  authored timeline, realization, loop, gate, exact-limit, provenance, trace,
  and mutation authority. Production compiler output may be compared with them
  but may never generate their expectations.
- `docs/A0_APPLICATION_CONTRACT.md`,
  `tests/fixtures/application-state/a0-application-contract.json`, and their
  declared companions are the independently authored A0 state, command,
  history, bookmark, stale-result, transport-view, selector, limit,
  provenance, and mutation authority. Production application behavior may be
  compared with them but may never generate their expectations.
- `docs/A0_U1_ATOMIC_EDIT_PLAN_CONTRACT.md`,
  `src/application/application-edit-plan-contract.ts`, and the five companions
  under `tests/fixtures/a0-u1-edit-plan/` define the proposed additive A0/U1
  atomic-edit command, its five closed operation variants, exact Quick Entry
  guard, deterministic identity/time/bookmark/history laws, literal cases,
  traces, provenance, and mutations. The live A0 command union and U1 UI do not
  consume this specification until their dependent implementation leaves.
- `docs/U1_EDITING_CONTRACT.md`,
  `src/ui/studio/u1-editing-contract.ts`, and the six companions under
  `tests/fixtures/editing/` are the proposed independent U1 quick-entry,
  chart-editing, insertion-plan, bookmark, focus, pointer, listener, refusal,
  trace, provenance, and mutation authority. U1 adds no mutation channel: the
  packet freezes the subset of the live sixteen A0 command kinds, the two
  ephemeral intents, and the five atomic plan kinds a U1 surface may dispatch,
  and the static contract test proves the authorized and unauthorized lists
  partition the live tuple exactly. No U1 production component exists yet, and
  the packet makes no implementation, UI-completion, human-acceptance, or
  expert-review claim.
- `docs/C0_LEGACY_MIGRATION_CONTRACT.md`,
  `tests/fixtures/legacy-migration/c0-legacy-migration-contract.json`, and their
  hash-bound companions are the independently authored C0 legacy-corpus,
  precedence, report, hostile-input, work-bound, provenance, and mutation
  authority. Production migration output may be compared with them but may
  never generate their expectations.
- `docs/E0_INTERCHANGE_CONTRACT.md`, `src/export/interchange-contract.ts`,
  `src/application/e0-interchange-contract.ts`, and
  `tests/fixtures/interchange/e0-interchange-contract.json` plus its hash-bound
  companions define E0's deterministic JSON/text interchange and transactional
  application boundary. The packet is independently authored; its first golden
  set was accepted by the project owner on 2026-07-21 and is recorded in
  `docs/evidence/E0_GOLDEN_PACKET_REVIEW.md`. Production output may never
  generate or approve its expectations.
- `docs/A0_E0_OWNER_PORTS_CONTRACT.md`,
  `src/application/application-interchange-owner-contract.ts`, and the five
  companions under `tests/fixtures/a0-e0-bridge/` define the proposed A0-owned
  authority bridge proposed for a future E0 v2 binding. Accepted E0 v1 neither
  imports nor consumes this surface. The bridge packet freezes five
  composition-private ports, a capacity-one replacement registry, synchronous
  latest-identity semantics, atomic state-free marker CAS, reciprocal traces,
  provenance, and literal mutation controls. It makes no production/controller,
  E0-v2, compatibility, or human-acceptance claim and independently pins the
  accepted E0 v1 packet and source evidence. The versioned consumer amendment
  is tracked by `jcpe-milestone-reliable-studio-l3a.8.4`.
- `docs/X0_AUDIO_ENGINE_CONTRACT.md`,
  `tests/fixtures/audio-engine/x0-audio-engine-contract.json`, and their
  hash-bound companions are the independently authored X0 persistent-graph,
  instrument-recipe, impulse, voice-lifecycle, registry, render, listening,
  provenance, trace, limit, and mutation authority. Production audio behavior
  may be compared with them but may never generate their expectations.
- `docs/E1_MIDI_EXPORT_CONTRACT.md`, `src/export/midi-export-contract.ts`,
  and the seven companions under `tests/fixtures/midi-export/` are the
  independently authored E1 deterministic MIDI-export byte-model, refusal,
  loss, filename, limit, trace, provenance, and mutation authority.
  Production export output may be compared with them but may never generate
  their expectations.
- `docs/U7_MIDI_EXPORT_WORKFLOW_CONTRACT.md`,
  `src/application/u7-midi-export-workflow-contract.ts`, and the seven
  companions under `tests/fixtures/midi-export-workflow/` are the proposed
  independent U7 MIDI-export-workflow authority: the preview model and
  derivation laws, blocked-event enumeration with chart links, the dialog
  state machine and capacity-one preparation registry, object-URL delivery
  and cleanup accounting, the accessibility matrix, exact limits, work
  counters, traces, provenance, and replayed mutation controls. The
  production U7 workflow HAS since shipped
  (`src/application/studio-midi-export.ts`,
  `src/ui/studio/MidiExportPanel.tsx`, delivery via
  `src/ui/midi-export-delivery.ts`), but the packet itself still reads
  `specified-not-implemented` and makes no implementation, UI-completion,
  human-acceptance, or expert-review claim: amending those reviewed flags
  requires the recorded human acceptance owned by the U7 verify leg
  (`jcpe-milestone-advanced-craft-ulj.11.3`). Production workflow behavior
  may be compared with the fixtures but may never generate their
  expectations.
- `docs/PHS3_FLUTE_V2_CONTRACT.md`,
  `tests/fixtures/flute-v2/contract.json`, and their companions are the
  independently authored PHS3 transverse flute physical-model authority:
  jet convection delay, embouchure hole coverage, and tone-hole lattice laws.
- `docs/PHS4_PLUCKED_STRING_V2_CONTRACT.md`,
  `tests/fixtures/plucked-string-v2/contract.json`, and their companions are
  the independently authored PHS4 plucked-string family physical-model
  authority: bidirectional stiff strings, multiport bridge, DKT body modes,
  pickups, and amplifier stages.
- `docs/PHS5_TRUMPET_V2_CONTRACT.md`,
  `tests/fixtures/trumpet-v1/contract.json`, and their companions are the
  independently authored PHS5 trumpet physical-model authority: nonlinear
  lip reed dynamics, valve tubing loops, and expanding bell horn radiation.
- `docs/PHS6_VIBRAPHONE_V2_CONTRACT.md`,
  `tests/fixtures/vibraphone-v2/contract.json`, and their companions are the
  independently authored PHS6 vibraphone physical-model authority: tuned
  undercut free-free bar dynamics, Hertzian mallet contact, and rotating
  fan tremolo radiation.
- `docs/PHS7_WHOLE_SYSTEM_ACCEPTANCE_CONTRACT.md`,
  `tests/fixtures/physical-system-v1/contract.json`, and their companions are
  the independently authored PHS7 whole-system physical synthesis acceptance
  authority: multi-rate 81-cell measurement matrix, listening rubrics, and
  stop-to-silence guarantees.
- The legacy HTML remains evidence until the replacement has passed the release
  gate. New production code must not import or evaluate it.

## Toolchain contract

The supported build environment is Bun 1.3.14, pinned as
`packageManager: bun@1.3.14`. All package versions are exact in
`package.json` and `bun.lock`.

| Role | Package | Version | Placement |
|---|---|---:|---|
| UI runtime | `preact` | 10.29.7 | production |
| compiler | `typescript` | 6.0.3 | development |
| browser tests | `@playwright/test` | 1.61.1 | development |
| accessibility tests | `@axe-core/playwright` | 4.12.1 | development |
| lint engine | `eslint` | 10.7.0 | development |
| lint core rules | `@eslint/js` | 10.0.1 | development |
| typed lint rules | `typescript-eslint` | 8.63.0 | development |
| Bun types | `@types/bun` | 1.3.14 | development |
| Node tool types | `@types/node` | 26.1.1 | development |

TypeScript 6.0.3 is intentional: the current typed-lint package declares
`typescript >=4.8.4 <6.1.0`, so pinning TypeScript 7 would create an invalid
peer contract and would remove the stable compiler API needed by the AST
checkers. Preact is the only production dependency. Browser APIs, Pointer
Events, Web Audio, IndexedDB, Blob/download, and CSS are used directly.

Playwright is run with a real supported Node.js runtime, not Bun's `node`
compatibility shim. `doctor:toolchain` locates a Node 22, 24, or 26 executable,
proves `process.versions.bun` is absent, records the exact runtime, and then
launches `node node_modules/@playwright/test/cli.js`. CI must put a supported
Node ahead of any shim; local verification may use an explicit `NODE_BINARY`.
`.node-version` pins the preferred CI/LTS runtime to Node 24.18.0.

The manifest exposes these stable commands:

| Command | Contract |
|---|---|
| `bun install --frozen-lockfile` | reproduce the exact dependency graph |
| `bun run dev` | serve the source entry for local development |
| `bun run doctor:toolchain` | verify exact Bun/package pins and a real supported Node for Playwright |
| `bun run validate:f0-contract` | validate the machine-readable standalone-foundation contract |
| `bun run validate:f1-contract` | validate the independent spelling, identity, exact-time, voicing, and boundary authority corpus |
| `bun run validate:f2-contract` | validate the independent structural-decoder schema, adversarial cases, trace ledger, and mutation controls |
| `bun run validate:t0-contract` | validate the independent symbol/chart grammar, canonical-formatting, trace, and mutation authority corpus |
| `bun run validate:t1-contract` | validate the independent chord-resolution, degree-spelling, all-root, trace, provenance, and mutation authority corpus |
| `bun run validate:h0-contract` | validate the independent context-reading, Roman-spelling, chord-scale, exact-limit, trace, provenance, and mutation authority corpus |
| `bun run validate:v0-contract` | validate the independent voicing-family templates, applicability matrix, goldens, operation states, limits, transpositions, trace, provenance, and mutation authority corpus |
| `bun run validate:v1-contract` | validate the independent noncrossing assignment, identity, motion, lock, cost, limit, trace, provenance, and mutation authority corpus |
| `bun run validate:f3-contract` | validate the independent semantic-publication, transaction, diagnostics, work-bound, trace, provenance, and mutation authority corpus |
| `bun run validate:p0-contract` | validate the independently authored P0 playback-plan timeline, realization, loop, law, exact-limit, trace, provenance, and mutation authority corpus |
| `bun run validate:a0-contract` | validate the independent application-state, command, history, bookmark, stale-result, transport-view, selector, trace, provenance, and mutation authority corpus |
| `bun run validate:a0-u1-edit-plan-contract` | validate the proposed additive A0/U1 five-variant atomic-edit contract, independently materialized state transitions, exact-time/identity laws, traces, provenance, and mutations without claiming production implementation or UI completion |
| `bun run validate:u0-contract` | validate the source-owned UI inventory, exact limits, 714-cell state gallery authority, responsive/overlay matrices, topology and contrast cases, trace links, provenance, and release-gallery exclusion contract |
| `bun run validate:u1-contract` | validate the proposed independent U1 quick-entry classification, operation-to-channel binding, interaction states, bounds, traces, provenance, and replayed mutation controls without claiming any U1 implementation |
| `bun run validate:u4-contract` | validate the proposed independent U4 transport-controls inventory, total status-enablement matrix, status-projection/keyboard-guard/layout cells, traces, provenance, and mutation controls without claiming any U4 implementation |
| `bun run validate:c0-contract` | validate the independent legacy corpus, precedence, hostile-input, report, work-bound, trace, provenance, and mutation authority package |
| `bun run validate:e0-contract` | validate the independent E0 JSON/text interchange, transactional import, exact limits, reciprocal traces, provenance, accepted byte goldens, and mutation authority package |
| `bun run validate:e1-contract` | validate the independent E1 MIDI-export byte goldens (independent SMF parser and derivation), refusal precedence, limits, filename law, trace, provenance, and mutation authority |
| `bun run validate:u7-contract` | validate the proposed independent U7 MIDI-export-workflow preview model, marker/title derivation laws, dialog state machine and registry discipline, accessibility matrix, limits, traces, provenance, and replayed mutation controls without claiming any U7 implementation |
| `bun run validate:a0-e0-bridge-contract` | validate the independent A0 owner-port registry, identity, marker-CAS, literal applicability/provenance/trace/mutation packet, and immutable accepted-E0-v1 pins without claiming consumer compatibility |
| `bun run validate:x0-contract` | validate the independent persistent-audio graph, recipe, impulse, voice-lifecycle, registry, render, listening, trace, provenance, and mutation authority package |
| `bun run validate:phs0-contract` | validate the proposed gesture-driven physical-renderer plans, exact limits, stateful partitioning, v2 ABI, baseline, traces, provenance, and mutation controls without claiming production implementation |
| `bun run validate:phs1-contract` | validate the offline foundry boundary, canonical parameter packs, deterministic work bounds, independent analytic audio/physics metrics, provenance classes, traces, and mutation controls without claiming calibrated packs or production implementation |
| `bun run verify:physical-foundry` | run the production PHS1 analytic metric corpus and emit its deterministic bounded receipt |
| `bun run validate:phs2-contract` | validate clarinet-v2 reed, tongue, bore/tone-hole, gesture, state, work-bound, analytic metric, provenance, and mutation laws without claiming production implementation |
| `bun run validate:phs3-contract` | validate flute-v2 jet drive, embouchure, geometry-derived fingering, passive tone-hole lattice, continuous state, work-bound, analytic metric, provenance, trace, and mutation laws without claiming production implementation |
| `bun run validate:phs4-contract` | validate the coupled plucked-string family targets, reviewed string/body/pickup/amp packs, passive bridge/body feedback, sympathetic state, contact, CQC, analytic metrics, traces, provenance, and mutation laws without claiming production implementation |
| `bun run validate:phs5-contract` | validate the additive trumpet registry, Adachi-Sato two-dimensional lip and dynamic jet laws, normal Bb3 versus pedal admission, compensated valve/bore/bell geometry, bounded nonlinear propagation and lip-solve work, continuous state, analytic metrics, traces, provenance, and mutation laws without claiming production implementation |
| `bun run validate:phs6-contract` | validate physical vibraphone bar modes, energy-consistent mallet contact, passive resonators, shared pedal/damper state, continuous fan radiation, sample-comparator boundaries, metrics, traces, provenance, and mutations without claiming production implementation |
| `bun run validate:phs7-contract` | validate the whole physical-instrument measurement/listening/compatibility/browser matrix, deterministic global limits, artifact and reference-hardware budgets, evidence diagnostics, and owner-controlled committed-HEAD release chronology without claiming implementation or human acceptance |
| `bun run evidence:phs2-listening` | render deterministic, level-matched legacy/v2 clarinet WAV pairs and a hash ledger under `test-results/`; an optional second path imports reviewed CC0 FreePats acoustic clips, while generation explicitly does not claim the required owner listening verdict |
| `bun run typecheck` | strict `tsc --noEmit` |
| `bun run lint` | ESLint plus source-integrity and dependency-boundary checks |
| `bun test` | Bun unit, property, golden, conformance, integration, and static tests |
| `bun run test:e2e` | Playwright browser suite |
| `bun run build` | generate both standalone HTML outputs and reports |
| `bun run verify:standalone` | static and browser no-network artifact proof |
| `bun run verify:reproducible` | build in two isolated absolute paths and compare bytes/manifests |
| `bun run verify:licenses` | verify production dependency and embedded-asset provenance |
| `bun run verify:f1-evidence` | run the exact F1 package suite and emit a hash-bound trace, seed, mutation, and resource ledger |
| `bun run verify:f2-evidence` | run the exact F2 package suite and emit a hash-bound trace, replay, counter, hostile-input, and reviewed-control ledger |
| `bun run verify:t0-evidence` | run the exact T0 syntax suite and emit a hash-bound fixture, law, trace, reviewed-control, termination, and resource ledger |
| `bun run verify:t1-evidence` | run the exact T1 theory suite and emit a hash-bound fixture, all-root, law, trace, reviewed-control, termination, and resource ledger |
| `bun run verify:v0-evidence` | run the exact V0 voicing suite and emit a hash-bound matrix, candidate, operation-state, all-root/inverse-transposition, trace, semantic-counterfactual, termination, and resource ledger |
| `bun run verify:v1-evidence` | run the exact V1 voice-assignment suite and emit a hash-bound assignment, law/transposition, exhaustive-oracle, exact-plus-one accounting, trace, semantic-counterfactual, termination, and resource ledger |
| `bun run verify:f3-evidence` | run the exact F3 publication suite and emit a hash-bound case, operation-state, sole-cast, trace, semantic-counterfactual, termination, and resource ledger |
| `bun run verify:p0-evidence` | run the exact P0 playback-plan owner suite and emit a hash-bound timeline, realization, loop, transposition, shared-consumer, exact-limit, trace, semantic-counterfactual, termination, and resource ledger; first-golden acceptance remains explicitly human-reviewed |
| `bun run verify:e1-evidence` | re-run the exact E1 MIDI-export suite and validator from a drift-checked input closure, sweep seeded plans through a freshly written SMF reader with replay, marker-permutation, tempo-isolation, and loss-recomputation relations, and emit a hash-bound ledger under `test-results/` |
| `bun run verify:a0-evidence` | run the exact A0 application suite and emit a hash-bound state-case, stale-token, named-sequence, 1,000-sequence reference-model, mutation-link, trace, termination, and resource ledger |
| `bun run verify:c0-evidence` | run the exact C0 compatibility suite and emit a hash-bound 70-case, 80-preset, hostile-input, boundary-counter, trace, semantic-counterfactual, termination, and resource ledger |
| `bun run verify:x0-evidence` | run the exact X0 native-browser, contract, and trace-owner package proof; keep the result incomplete until the separate physical listening matrix is complete |
| `bun run verify:x1-evidence` | run the exact X1 transport browser-matrix, contract, owner-suite, and trace-owner package proof; keep the result incomplete until the shared human listening matrix (X0-deferred scenes 003–005) is complete |
| `bun run verify` | aggregate type, lint, tests, build, artifact, and E2E gates |

## Module ownership

```text
domain
  ↑
theory          compatibility
  ↑                  ↑
playback       persistence / export / content adapter
       ↑            ↑
       application commands and services
                    ↑
                    ui

audio <- immutable playback plans + serialized transport commands
```

| Layer | Owns | May import |
|---|---|---|
| `domain` | spelling-first values, exact time, stable IDs, document shapes | no project layer |
| `theory` | pure resolution, analysis, laws, bounded search, voicing | `domain` |
| `playback` | exact immutable beat/tick playback plans | `domain`, `theory` types |
| `audio` | persistent Web Audio graph, voices, scheduler, transport | `domain`, `playback` |
| `compatibility` | bounded legacy candidates and migration reports | `domain`, `theory` |
| `persistence` | recovery adapters and envelopes | `domain` |
| `export` | canonical JSON/text/MIDI encoders | `domain`, `theory`, `playback` |
| `content` | compiled immutable records and injected query adapters | `domain`, `theory` interfaces |
| `application` | publication gate, commands, history, services, selectors | all non-UI layers |
| `ui` | Preact rendering, intent dispatch, selector presentation | `domain`, `application` |
| `test-support` | deterministic builders, fake clocks/audio, independent corpora | any production layer |
| `scripts` | build-time compilation and verification | any production layer |

Load-bearing boundary rules:

1. `domain` imports no theory, UI, audio, storage, browser service, or Preact.
2. `theory` is pure and cannot import content, UI, audio, persistence, export,
   or mutable application state.
3. Runtime theory receives an injected read-only `AtlasQuery`; it never imports
   the Atlas implementation.
4. `audio` consumes playback plans and transport commands. It does not inspect
   chart drafts or UI state.
5. `ui` dispatches application intents. It cannot call audio/storage/export
   adapters directly or mutate domain objects.
6. Only `application/document-validation.ts` may perform the audited opaque
   `ValidatedDocument` brand cast.
7. Only `ui` and `main.tsx` may import Preact. Only `audio` may construct
   Web Audio nodes.
8. Production modules may not import `test-support`, `tests`, or `scripts`.
9. Cross-layer imports use public module entry points once those entry points
   exist; path traversal into another layer's private implementation is rejected.
10. `main.tsx` is the sole composition root. It may wire UI to concrete
    application adapters, but it may not contain domain, theory, transport, or
    persistence logic.

`src/ui/runtime.ts` is the narrow public UI entry for `main.tsx` and exports
only `App`, `StudioStartupFailure`, and their types. The broader `src/ui/index.ts`
surface remains available to tests and development tooling, but the production
composition root must not import it solely to reach the application shell.
This prevents unused barrel exports from widening the release graph; gallery
modules, route vocabulary, fixture cells, and test controls remain test-only.

`src/application/runtime.ts` is the analogous narrow public application entry
for the composition root and shell. It exports only the studio controller
factory and its view/controller types. The broad `src/application/index.ts`
barrel remains available to tests, validators, and tooling, but production
composition must not import it: the barrel re-exports large contract-authority
modules (for example the E0 interchange contract) whose constants would
otherwise be bundled into the standalone artifact without any production
reader.

The dependency checker resolves relative and aliased TypeScript imports with the
TypeScript AST. String search is not sufficient because type-only imports,
re-exports, and multiline declarations must be covered.

## TypeScript invariants

The main configuration uses browser ES modules, `moduleResolution: Bundler`,
Preact's automatic JSX runtime, and strict checking. The following options are
load-bearing:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`
- `noPropertyAccessFromIndexSignature`
- `useUnknownInCatchVariables`
- `verbatimModuleSyntax`
- `isolatedModules`
- `noEmit`

Production `any`, unchecked JSON casts, non-null assertions used as validation,
duplicate class/object members, and duplicate exports are lint/static-test
failures. Unknown external data crosses a total decoder before it becomes a
domain candidate.

## Standalone release contract

The release is one UTF-8 HTML file with all production JavaScript, CSS,
icons, images, fonts, instrument payloads, and compiled content inlined.

The pinned uncompressed limits, amended 2026-09-02
(bead `jcpe-size-contract-atlas-4nsy`, deputy decision on the recorded
owner remit):

| Allocation | Bytes |
|---|---:|
| total artifact ceiling | 9,437,184 (9 MiB) |
| shell allocation (`foundationShellMaxBytes`) | 8,912,896 |
| reserved Harmonic Atlas/content (`reservedAtlasBytes`) | 524,288 |

History, in full, because this contract's own law requires the measured
justification recorded here:

- The retired F0 bootstrap shell had a 262,144-byte ceiling; the U0/U1
  studio checkpoints stepped through 786,432 -> 851,968 -> 983,040 ->
  1,048,576 bytes, and the original completed-artifact pin was 1,572,864
  bytes with a 524,288-byte Atlas reservation.
- Shipping real instruments consumed that world: the Salamander piano
  attack layer, the CC0 Upright Bass and Concert Vibes sample payloads
  (~2.8 MB combined), the embedded Archivo/Literata faces, and the
  180 KB physical-model WASM raised the measured artifact to ~7.9 MB, and
  the enforced ceiling was raised to 8,388,608 bytes
  (commit f818c6a, "ceiling raised for samples") without this document
  being amended — a recorded violation of the Evolution clause.
- On 2026-09-01 the budget was balanced by zeroing the Atlas reservation
  (commits 5d73396 then e9570e6), spending a promised future capability to
  keep the number — the exact "update the expectation to make a failure
  disappear" shortcut the Forbidden Shortcuts section bans.
- On 2026-09-02 this amendment resolved it deliberately: the total rises
  once to 9,437,184 bytes — the figure the reviewed PHS7 physical-system
  contract already pins as `standaloneArtifactMaximumBytes`, so the two
  authorities now agree — and the 524,288-byte Atlas reservation is
  RESTORED as a hard allocation (`validate:f0-contract` rejects a zero or
  negative reservation again). The measured artifact is 7,934,464 bytes:
  978,432 bytes of shell headroom under the shell allocation.

The recorded reclamation path: the physical-model campaign exists to
replace the sampled payloads, and when `vibes@2` and the physical upright
bass finally beat the recordings in the owner's ears
(`release-evidence/audio/listening/model-acceptance-ledger.json`), dropping
the two CC0 payloads returns roughly five times the Atlas reservation.
Any further ceiling change requires the same measured justification
recorded here, and later packages still cannot spend the reserved content
allowance silently.

### Identifier minification, and why the earlier policy was reversed

The identifier-preserving inspectable bundle policy recorded above has been
**withdrawn**. It held while the shell had room; once the completed U1 chart
editor measured 1,041,445 bytes it did not, and the only remaining ways to
continue were to spend the Atlas reservation or to raise the then-pinned
1.5 MiB total (both since superseded by the recorded amendments above). Both trade a real future capability for bundle readability.

`scripts/build.ts` therefore now passes `--minify-identifiers` alongside
`--minify-whitespace` and `--minify-syntax`. The measured effect on the U1
checkpoint artifact is 1,041,445 → 752,096 bytes, a 289,349-byte (27.8%)
reduction that restores 296,480 bytes of headroom under the unchanged 1 MiB
checkpoint ceiling.

What the reversal does not cost:

- reproducibility — mangling is deterministic for a fixed input, and
  `bun run verify:reproducible` rebuilds in isolated paths with different
  mtimes and reports the identical SHA-256;
- the embedded hash-based CSP — the build recomputes the script and style
  hashes from the emitted bytes;
- auditability — `src/` remains authoritative, the generated banner points at
  it, and `dist/standalone-manifest.json` still records the SHA-256, byte
  count, CSP hashes, embedded assets, and license inventory.

What it does cost is reading the release bundle directly, which was never a
release requirement: the F0 verification gates inspect capabilities and
behaviour, not identifier names.

Both generated HTML files begin with the fixed timestamp-free banner
`<!-- @generated; edit src/, then run bun run build -->`, followed by a
standards-mode doctype. Runtime tests require
`document.compatMode === "CSS1Compat"`.

The generated artifact may not contain a runtime dependency on:

- an external `script`, stylesheet, font, image, media, manifest, or module,
  or WebAssembly fetched from any URL (the inventoried project-owned wasm
  bytes embedded in the artifact itself are not a runtime dependency);
- static or dynamic JavaScript imports;
- `fetch`, XMLHttpRequest, WebSocket, EventSource, sendBeacon, service-worker
  registration, Worker, SharedWorker, or worklet module loading;
- a source-map URL;
- a model client, prompt endpoint, telemetry endpoint, or CDN.

The build injects and verifies a meta Content Security Policy. Its default,
connect, worker, object, frame, manifest, base, and form destinations are
`'none'`; executable inline script/style blocks are authorized by generated
SHA-256 hashes, `script-src` additionally carries `'wasm-unsafe-eval'` solely
for instantiating the inventoried embedded WebAssembly payload, and only
inventoried passive `data:`/local `blob:` assets may be allowed. CSP is
defense in depth: static capability analysis and the no-CSP negative-control
harness must still prove that interception works.

Harmless URLs in license and documentation text are allowed. Verification
therefore inspects executable import/call sites and URL-bearing HTML/CSS
attributes, then independently denies nonlocal requests in a real browser.

The artifact is exercised in two modes:

1. direct `file://` navigation;
2. a loopback HTTP server whose main-document request is allowed.

For both modes, Playwright aborts and records every nonlocal request. The page
must reach the ready marker, expose the expected heading, produce no page error
or unexpected console error, and make zero forbidden requests. Blob/data URLs
created by explicit local export/preview behavior are permitted and separately
checked for cleanup.

The browser matrix contains six mandatory cells: Chromium, Firefox, and WebKit
under both `file://` and loopback HTTP. Each uses a fresh context with service
workers blocked. Routes and event listeners are installed before page creation.
HTTP permits exactly one 200 `GET` for the top-level artifact and zero
subresource, redirect, favicon, map, popup, worker, WebSocket, or background
requests—even on loopback. The file fixture is copied to a path containing
spaces, Unicode, and `#` and is converted with `pathToFileURL`.

A separate malicious no-CSP fixture attempts a remote request and must be
recorded and aborted. This negative control prevents an inert request logger or
CSP alone from making the real artifact appear offline.

### Embedded WebAssembly DSP payload (additive amendment, 2026-07-28)

The artifact may embed project-owned WebAssembly compiled from the Rust
sources under `dsp/`. The rules:

- Each payload is checked in as generated TypeScript under `src/audio/wasm/`
  (currently `concert-grand-wasm.ts`), carrying the module bytes as a base64
  constant pinned by exported SHA-256 and byte-length constants. It is
  regenerated — and drift between the Rust source and the checked-in payload
  is detected — with `bun scripts/build-dsp.ts [--check]`.
- `bun run build` never runs cargo. The Bun-only build contract is unchanged:
  the wasm payload enters the bundle as ordinary checked-in TypeScript, and
  the Rust toolchain is a development-time generator concern only.
- The CSP `script-src` directive carries `'wasm-unsafe-eval'` solely so the
  page can `WebAssembly.instantiate` those embedded bytes under the
  hash-based policy (Chromium, Firefox, and WebKit all require the token).
  It authorizes no URL. Fetching or stream-compiling wasm from any URL,
  workers, and worklets remain forbidden; every `'none'` directive above,
  including `worker-src` and `connect-src`, is unchanged, and the artifact
  policy rejects `'wasm-unsafe-eval'` on any directive other than
  `script-src`.
- Every wasm payload is an inventoried embedded asset: the build verifies the
  bundled base64 against the generated module's SHA-256/byte pins, and
  `dist/standalone-manifest.json` plus `dist/licenses.json` record its id,
  `application/wasm` MIME, source crate path (`dsp/concert-grand`), generator
  (`scripts/build-dsp.ts`), license, SHA-256, and byte count.
- Third-party code compiled into the wasm is inventoried in the license
  report's `wasmCompiled` provenance list and in the toolchain ledger as a
  `compiled-into-wasm` record. Today that is exactly `libm@0.2.16`
  (`MIT OR Apache-2.0`), a Rust software-float library — not a JavaScript
  dependency; Preact remains the only bundled JS production package.

### Embedded recorded audio payload (additive amendment, 2026-07-29)

The Concert Grand is a hybrid: a recorded hammer strike crossfaded into the
synthesized sustain. The recordings are a third embedded asset and follow the
same rules as the wasm payload, plus attribution:

- The payload is checked in as generated TypeScript at
  `src/audio/wasm/piano-attack-samples.ts`: raw little-endian 16-bit PCM,
  base64, pinned by exported SHA-256 and byte-length constants, with a frozen
  index describing every slice. There is no container and no codec, so the
  runtime decodes it with `atob` alone — no `decodeAudioData`, no new browser
  API surface, and no change to the audio platform port.
- It is regenerated — and drift against the recorded corpus is detected —
  with `bun scripts/build-piano-samples.ts [--check]`. The corpus location
  comes from `PIANO_SAMPLE_SOURCE_DIR`; `bun run build` never reads a wav
  file.
- The source recordings are third-party content under an attribution
  license: Salamander Grand Piano V3 by Alexander Holm, CC-BY-3.0. The credit
  line is an exported constant, is embedded verbatim in the artifact's
  third-party notice comment, and is inventoried in
  `dist/licenses.json`/`dist/standalone-manifest.json` alongside the id, MIME
  (`audio/L16;rate=44100;channels=1`), generator, SHA-256, and byte count.
  `bun run verify:licenses` fails if the credit, the digest, or the byte
  count drifts from the generated module.
- The runtime never fails a note over the sampled layer. A pitch, velocity,
  or sample rate the corpus cannot serve renders as pure synthesis, and a
  corrupt payload demotes the whole instrument to synthesis rather than
  refusing to play.

### CC0 instrument sample payloads (amended 2026-08-09, twice)

Upright Bass and Concert Vibes render deterministic PCM from the two CC0
payloads below through `changes.dsp.sampled-upright-bass@1` and
`changes.dsp.sampled-vibraphone@1`. The physical replacements
(`changes.dsp.plucked-upright-bass@1`, `changes.dsp.vibes@2`) briefly took
over on 2026-08-09 but the owner rejected their temporal character on the
live studio the same day (bead jcpe-3q4c); both physical ids sit **red** in
the model-acceptance ledger and stay dark until they beat the samples in
the owner's ears. The sampled payload registry is therefore LIVE and both
payloads ship in the production module graph:

- The payloads are checked in as generated TypeScript at
  `src/audio/wasm/upright-bass-samples.ts` (raw mono 16-bit PCM at
  22,050 Hz) and `src/audio/wasm/vibraphone-samples.ts` (32,000 Hz), each
  base64 with exported SHA-256/byte-length pins and a frozen slice index
  keyed by concert MIDI pitch with a measured cents deviation per slice.
  They are regenerated — and drift against the recorded corpora is
  detected — with `bun scripts/build-instrument-samples.ts [--check]`; the
  corpus root comes from `INSTRUMENT_SAMPLE_SOURCE_DIR`, and `bun run build`
  never reads a wav file.
- Every slice is pitch-verified at generation time: a harmonic-comb cents
  scan around the expected fundamental must resolve, the fundamental must be
  present, and (at and above 55 Hz) the expected pitch must outscore both
  octave-mislabeling hypotheses. A mislabeled or octave-shifted recording is
  a generator failure, never a payload defect.
- The sources are public-domain dedications (CC0-1.0): the VSCO 2 Community
  Edition solo contrabass pizzicato and the Versilian Community Sample
  Library vibraphone (soft mallets), both by Versilian Studios / Sam
  Gossner. No attribution is required; the credit lines are embedded and
  inventoried anyway, exactly like the Salamander credit, and
  `bun run verify:licenses` fails if a credit, digest, or byte count drifts
  from the generated modules.
- The sampled-renderer machinery is synchronous, pure TypeScript, with both
  payload rows registered. The recordings double as the replacement gates'
  reference corpora: any physical model that wants these recipes back must
  beat the shipping samples there and in the owner's ears
  (release-evidence/audio/listening/model-acceptance-ledger.json is the
  authority; do NOT delete the payload modules as "unused" — they are the
  live note path).

## Reproducibility and reports

One build invocation produces:

- `dist/index.html`;
- `jazz_chord_progression_editor.html`;
- `dist/standalone-manifest.json` with SHA-256, bytes, budget, entrypoint,
  deterministic build fields, assets, and static-scan findings;
- `dist/licenses.json` with bundled production packages/assets and provenance.

Run-specific browser versions, request sequences, console messages, and failures
go to `test-results/standalone-browser-evidence.json`; they never enter the
deterministic manifest or release artifact.

The two HTML outputs are byte-identical. Reproducibility builds in two fresh
absolute paths with `TZ=UTC`, fixed locale, fixed `SOURCE_DATE_EPOCH`, and
different source mtimes; their artifact bytes and deterministic manifests must
match. Timestamps, absolute paths, random IDs, ports, and source-map comments are
forbidden in the artifact. Reports may include measured times, but measured time
never becomes product data. A one-byte root mutation and a stale source/root
pair are negative fixtures.

## Foundation verification matrix

| Trace | Case | Expected evidence |
|---|---|---|
| F0-TOOLCHAIN-01 | frozen install and exact versions | manifest/lock inspection and version log |
| F0-BOUNDARY-01 | every legal/illegal layer edge | TypeScript-AST fixture matrix |
| F0-DUPLICATE-01 | duplicate members/exports | failing static fixtures with file/range |
| F0-ARTIFACT-01 | source builds both outputs | byte equality and SHA-256 |
| F0-NETWORK-01 | `file://` and HTTP with network denied | request/console/page-error JSON logs |
| F0-NETWORK-02 | each forbidden attribute/import/call | mutation fixtures rejected with code/range |
| F0-REPRO-01 | two clean builds | identical hashes and bytes |
| F0-SIZE-01 | 9 MiB boundary | exact byte pass and +1 byte rejection fixture |
| F0-LICENSE-01 | bundled asset/dependency provenance | stable license inventory |
| F0-CSP-01 | restrictive hash-based embedded CSP | directive/hash and no-CSP negative-control tests |
| F0-NODE-01 | Playwright uses real Node 22/24/26 | toolchain-doctor report |
| L-OFFLINE-01 | legacy CDN dependency cannot recur | standalone-offline E2E |
| L-SOURCE-01 | source-order duplicate override cannot recur | duplicate-member static test |

Every structured verification log includes schema version, trace ID, tool and
browser versions, artifact hash, mode, deterministic seed where relevant,
outcome, and findings. Logs must not include progression text or user data.

## Forbidden shortcuts

- Hand-editing the generated root HTML.
- Copying the legacy inline script into a new entrypoint.
- Allowing remote resources because they are cached during tests.
- Treating a static string scan as the only offline proof.
- Treating a browser smoke test as the only dependency-boundary proof.
- Adding a second production package for convenience.
- Updating a golden, screenshot, size budget, or license expectation merely to
  make a failure disappear.
- Shipping a skipped, retried, quarantined, or mock-only substitute for a named
  real-browser gate.

## Evolution

A layer edge, production dependency, artifact-size increase, new runtime
capability, or browser-baseline change requires an explicit contract update,
measured justification, and revised fixtures before implementation. Later
packages may add detail, but may not weaken this foundation silently.
