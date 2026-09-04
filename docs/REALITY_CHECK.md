# Changes reality check and bridge plan

Assessment date: 2026-09-04. Source baseline:
`2af84f12be393caa2556c55b2634ade807db0b67`. Assessment owner:
`jcpe-reality-check-september-5h2l`. This document is revised in place.

## Verdict

Changes has a substantial working editor and audio foundation. It does **not**
yet deliver the complete deterministic jazz studio promised by REBUILD_PLAN and
THEORY_IDEA_WIZARD. The missing work is larger than the visible unfinished UI:
closed discovery packages contain incorrect transformations, ignored constraints,
fabricated measurement fields, and incomplete algorithms. Completing only the
previously open and in-progress Beads would not finish the product.

The failure is especially clear in independent, small counterexamples. A
three-beat transformation emits two beats while claiming balanced time;
transposing `C6/9/E` up a major second produces `D6/F#`; a pinned chord overrides
an incompatible bass constraint; and the Atlas accepts a forged payload digest.
These are correctness defects, not differences of musical taste.

The web studio uses `continuation.ts` and `chart-analysis.ts` for its existing
suggestions/inspector. These must not be confused with the newer
`contextual-continuation.ts` and `g0`–`g9` packages. The native JavaScriptCore
bridge *does* consume `contextual-continuation.ts`. A defect in a source-only web
workbench can therefore have a different native exposure.

## What was inspected and what the evidence means

The governing AGENTS and README were read in full. The vision was extracted
from ARCHITECTURE, REBUILD_PLAN, THEORY_IDEA_WIZARD, IDEA_WIZARD, LEGACY_AUDIT,
PHYSICAL_SYNTHESIS_PLAN, APPLE_APP_PLAN, the package contracts and evidence
records. Source review follows composition roots into domain/theory,
application, UI, playback, audio, persistence, interchange, build/deploy and
the native bridge. A contract validator passing is specification evidence;
it is not proof that the production package meets that specification.

The original tracker snapshot contained 479 issues: 383 closed, 81 open,
13 in progress and two deferred. These are workload counts, not completion
percentages. The local database was stale (203 issues, schema 13), while the
tracked export contained 479. Before any issue mutation, a full backup was
made, the supported schema migration applied, and the tracked export imported.
The subsequent 479-issue export had the exact original SHA-256
`8d9b0b18898a0b8087efbaad4354413dee72abfc97a7cc54454f670a275c947d`.
No direct SQL or JSONL edits were used to repair or update issue state.

Current run artifacts and final gate results are recorded below when settled.
Historical evidence is distinguished from checks executed during this audit.
No human listening, physical-device, App Store, or complete release acceptance
is inferred from this Linux audit.

## Source versus deployed bytes

| Surface | Bytes | SHA-256 | Meaning |
|---|---:|---|---|
| HEAD root artifact | 8,213,744 | `6afcf27eba67d97f59a6bfb37a8cc20fb1ab5e073d7fee4b2656a211c9193db4` | Current tracked build |
| jazzchords.org | 8,203,755 | `d7a2cb2f8ab61573d9a9566b2d8ec38ca6d150425576a63fc23b08918e1c1bbb` | Matches artifact at `8c155b3ad2812af692f8b8ee5205119ab2a69231` |
| Vercel mirror | 8,203,755 | same as custom domain | Same earlier artifact |

These are downloaded bytes, compared against Git objects, not the worktree.
All audit downloads use the repository-required user agent. No deploy was made.
Matching host hashes do not establish browser behavior or audio quality.

## Vision checklist

`PARTIAL` means some real implementation exists; `UNPROVEN` means this audit
does not establish the complete promised behavior. Neither means a stub.

| # | Testable promise and authority | Current reality | Coverage / next work |
|---|---|---|---|
| 1 | One offline, reproducible HTML; Preact-only production dependency (ARCHITECTURE) | Real modular source/build and self-contained artifact; 9 MiB ceiling with reserved Atlas budget | F0/R0; repeat exact-byte reproducibility and offline browser gates |
| 2 | Spelling-first identity, exact rational time and stable IDs (F1/F2/T0/T1/F3) | Substantial typed foundation and independent conformance; newer transformations violate it | Preserve foundation; repair H1/G7/G8 |
| 3 | Type/paste bar-delimited charts; atomic preview/apply; bounded hostile-input refusal (U1) | Production parser/controller/quick entry and editing paths | U1 regression gates; Q0 integrated user journey |
| 4 | Selection, insertion point, range, playhead, undo/redo and bookmarks are distinct (A0/U1) | Implemented transactional editor; must survive upcoming feature integration | Existing A0/U1 proof; shared Apply tests |
| 5 | Semantic seven-part inspector, exact Manual/Frozen piano and preview (U2) | Inspector/detail paths exist; full U2 build active | U2 spec contradicts foundation: duplicate unisons, 12 vs 16 notes, 500 vs 2,000 annotations, unsupported families |
| 6 | Plural contextual readings and chord-scale evidence without rewriting literal data (H0/U3) | H0 contracts exist, but all three promised production callables are absent; the smaller live chart annotation API does not implement them | Reopen H0 build/proof, preserve its specification; U3 and cross-surface conformance |
| 7 | Deterministic voicing families, optimal assignments and bounded progression optimization (V0/V1/V2/U6) | Real foundation engines and substantial conformance; full workbench not delivered | U6 and independent global-optimum/performance proof |
| 8 | Immutable shared audio/MIDI playback plans (P0/E1) | Production plan/compiler/exporter; never replace with suggestion-local note generation | U7; shared-law integration tests |
| 9 | Persistent audio graph, serialized transport and Stop ownership (X0/X1/U4) | Production graph, voice registry and transport; latest U4 controls in source, not current live artifact | U4 build/proof active; X0 listening and audio bug leaves remain |
| 10 | Count-in, metronome, seek, loops, tempo/instrument boundaries and accessible transport (U4) | Recent implementation; complete acceptance pending | Retain IvoryBluff ownership and independent U4 proof |
| 11 | Local recovery, previous-copy fallback, nonblocking storage failure (A1/U5) | Real IndexedDB/localStorage service and Keep/Discard wiring; full lifecycle presentation incomplete | A1 closed, U5 open; README recovery claim is stale |
| 12 | Safe New/import replacement, dirty/export markers, canonical JSON/text delivery (E0/C0/U5) | Engines and owner bridge exist; complete user-facing lifecycle workflow missing | U5 build/proof; E0 is closed, contrary to stale README |
| 13 | Bounded MIDI import with explicit uncertainty and exact-note preservation (M0/M1) | Real WASM decoder and import path; browser evidence run in this audit | Human DAW/listening acceptance remains separate |
| 14 | Actual MIDI download, loss disclosure, no false canonical-save marker (E1/U7) | Real download workflow in source; U7 build active | Preserve SwiftBridge ownership; U7 independent browser proof |
| 15 | 250 reviewed Atlas seeds, 3,000 variants, rights/provenance firewall (G1/D0) | Compiler exists but fails hash/rights/query laws; actual large reviewed corpus unfinished | Reopen G1; existing D0 remains authoring authority |
| 16 | All fifteen discovery workflows, not a demonstration subset (§11.9) | See complete HD matrix below | Reopen defective engines; finish existing U8/U9/U10/U11 |
| 17 | Exact spelled transposition over ranges/sections/documents, explicit Manual/Frozen policy (H1) | Source function corrupts 6/9 and ignores Unicode-root replacement; unconditional lossless claim | Reopen H1 with inverse, alteration-limit and exact-diff proofs |
| 18 | Lessons, practice corpus, help, keyboard guide and honest teaching (D1) | Starter/library/help exist; full educational content unfinished | D1; no correctness inferred from model-branded examples |
| 19 | Keyboard/touch/screen-reader operation, zoom, reduced motion and responsive layout (U0/Q0) | Real UI primitives and regression tests; complete release acceptance not established | Q0 plus explicit human accessibility leaf |
| 20 | Deterministic work/state/memory caps, cancellation/resume and responsive UI (ARCHITECTURE/§11.9) | Foundation has bounded contracts; discovery stats/steppers incomplete | New shared execution/proof package, then per-engine adoption |
| 21 | Physical synthesis fidelity, continuous gestures, lawful source/WASM/pack binding (PHS0–7) | Shipping rendered instruments and mechanical gates exist; physical roadmap and quality liabilities remain | Existing PHS and wind/plucked/bass/vibes leaves; no new duplicate DSP program |
| 22 | Release proof: no skipped/retried gates, real adapters, correct bytes on both hosts (Q0/R0/DEPLOY_GATE) | Strong fail-closed machinery, but current aggregate acceptance not yet obtained | Q0/R0 and existing playback/model issues |
| 23 | Native iPhone/iPad/Catalyst sibling, exact editing/import/export/recovery (APPLE_APP_PLAN) | Substantial SwiftUI/AVAudioEngine code and historical Apple evidence | Existing iOS quality epic; native G2 replay after repair; Linux cannot certify Apple execution |
| 24 | No runtime model, network, telemetry, remote assets, or silent repair (AGENTS) | Local architecture; known Cloudflare beacon injection is host-side and CSP-blocked | Existing `jcpe-2nky`; never weaken CSP; audit network attempts in real browser |

## All fifteen discovery promises

| HD | Goal | Engine reality | Existing delivery package |
|---|---|---|---|
| 01 | Contextual continuation | G2 reads earlier chords only for parse validity, ranks fixed last-chord templates; no complete provider/proof/constraint search | G2 + U8; native bridge exposed |
| 02 | Validated Atlas/compiler | G1 has broken SHA padding, digest bypass, expression-policy leak, insufficient fingerprints/expansion | G1 + D0 + U8 |
| 03 | Goal-directed routes | G3 enumerates a few templates with fixed costs and synthetic state counts | G3 + U9 |
| 04 | Constraint harmonization | G4 ignores conflicting pins, varies only first-slot alternatives, fabricates search counts/costs | G4 + U9 |
| 05 | Reharmonization branches | G5 recursively generates two rules without full intermediate-law validation; incorrect reached-depth evidence | G5 + U9 |
| 06 | Multi-hypothesis tonal journey | G0 emits one heuristic path, no k-best/no-key/pinned lattice, fixed confidence | G0 + U8 |
| 07 | Guide-tone line design | G6 greedily chooses first-line nearest pitch class; lacks registered noncrossing/pinned global optimization | G6 + U10 |
| 08 | Contextual color/upper structures | G6 ignores key argument, hardcodes clash-free options, can change retained suspension identity | G6 + U10 |
| 09 | Cadence/phrase/approach builder | G0 cadence root deltas wrong for common deceptive motion; H1/G7 incomplete law applications | G0/H1/G7 + U10 |
| 10 | Harmonic-rhythm transforms | G7 delay/merge pass through as success, grid failures silently preserve input | G7 + U10 |
| 11 | Tension/release curve | G7 uses fixed register/confidence and event-index voice-motion scores, not the named measured axes | G7 + U10 |
| 12 | Fingerprints/similarity | G1 interval substring false positives; placeholder diatonic degrees and absent complete layer matching | G1 + U8 |
| 13 | Motif/sequence engine | G8 lacks motif extraction/landing solver; unsupported intervals silently become a major second | G8 + U10 |
| 14 | Nonfunctional/common-tone Atlas | G8 P/L/R covers basic triads but wrongly accepts added tones; incomplete planing/mediant/common-tone laws | G8 + U10 |
| 15 | Chart-to-Practice | G9 duplicate contradictory answer options, substring cadence grading and limited templates | G9 + D1 + U11 |

## Reproducible defects and proof failures

Run `bun scripts/audit-discovery-reality.ts` with Bun 1.3.14. The initial
source-level run returned **16 failed laws and seven passing controls**, exit 1.
The subsequent callable-boundary check adds three missing H0 operations:
`deriveLiteralFacts`, `analyzeChordInContext`, and `enumerateChordScaleOptions`.
Their names occur only in contract declarations, not production implementations.
The script intentionally remains red until the implementation obeys the laws;
it does not redefine these defects as accepted behavior.

| Case | Expected | Observed |
|---|---|---|
| SHA-256 `abc` | Standard `ba7816bf…15ad` | `a4b8841f…85d7`; empty-input control passes |
| Atlas mismatched digest of all `f` | Reject | Accepted |
| `fingerprint-only` synthetic protected entry | No chord-expression bytes in compiled data | Full `chords` array retained |
| Same Atlas IDs, different payload | Different manifest payload digest | Same digest |
| Interval query `[1]` over `[11]` | No match | Match |
| `C6/9/E` up major second | `D6/9/F#` | `D6/F#` |
| Unicode `D♭maj7` transposition | Changed root | Original symbol unchanged |
| Three-beat G7 ii–V split | Sum exactly three | Two, despite `maintainsTimeBalance: true` |
| Pinned Cmaj7 plus C-sharp bass | Conflict | Successful Cmaj7 solution |
| G7 → Am | Deceptive-movement candidate | No cadence |
| Delay beat four by one | Beat five | Beat four |
| Diminution of 1/960 beat | Typed refusal for unrepresentable duration | Success retaining original duration |
| Pure-triad P operation on Cadd9 | Ineligible | Cm, ninth lost |
| Zero-semitone sequence | C → C | C → D |
| Cmaj7 practice spelling | Distinct correct/incorrect options | “E and B” appears as both |
| Root-only reharmonization tree | Reached depth zero | Reports requested depth two |

The G1 verification closeout claimed full golden conformance, but its
nonempty SHA test only checks that the string has 64 characters. The compiler
special-cases dummy hashes, and its negative fixture only exercises the
`000000` prefix. The H1 closeout claimed duration preservation but did not catch
an ordinary three-beat split. G4 claimed conflict identification without testing
the conjunction of a valid pinned chord with a contradictory bass. These are
specific examples of insufficient proof, not a claim that every existing test
is worthless.

## Bridge plan

The implementation order is specification/independent fixtures → production →
independent proof. Preserve all valid foundation tests and current ownership.
Each reopened package keeps its original complete scope; the fixes below are
minimum new counterexamples, not a reduced replacement specification.

1. **Implement the missing H0 operations, repair H1, and establish the shared
   exact-law boundary.** H0's accepted specification remains authoritative;
   chart-analysis test results cannot substitute for implementing its three
   callable interfaces. Transform the parsed AST,
   format through T0, and prove actual before/after pitch and time relations.
   Preserve 6/9, slash bass, Unicode spellings, additions/omissions, stable IDs,
   Manual/Frozen ordering and duplicates. Refuse unrepresentable alterations,
   durations, overflow, stale sources, and incompatible pins. Never clamp or
   claim an inverse result that was not established.
2. **Restore G0/G1.** Implement evidence-tier plural tonal paths and complete
   Atlas source/compiled validation, expansion, rights separation, canonical
   full-payload hashes, semantic deduplication and elementwise fingerprint
   matching. Only then allow D0's real 250/3,000 corpus to depend on the compiler.
3. **Restore G2/G3/G4.** Use validated provider output and actual bounded search,
   hard-filter before ranking, retain Pareto alternatives and explicit no-result
   explanations. All-slot constraint conjunctions and independently enumerable
   small graphs must agree with brute force. Web and native adapter reachability
   must be recorded separately.
4. **Restore G5/G6/G7/G8/G9.** Compose only validated laws; solve registered
   guide paths with pins; compute actual color conflicts and tension axes;
   implement every rhythm operation or visibly refuse; validate complete
   sonority eligibility and sequence landings; generate only objectively
   gradable, independently checked practice items.
5. **Finish the already tracked user workflows.** U2 semantic/exact inspector,
   U4 transport, U5 lifecycle and JSON/text delivery, U7 MIDI export, U3/U6
   evidence/voicing, U8–U11 all discovery, D0/D1 reviewed content. Add dependency
   edges to repaired engines; do not claim existing active leaves.
6. **Prove integrated release behavior.** Q0/R0 must run exact-source gates,
   long-session resource checks, offline desktop/phone browsers, accessibility,
   real storage/download/audio, deterministic replay and full size/performance
   accounting. Finish existing physical-synthesis and human acceptance work.
   Deployment follows the committed-bytes gates only when authorized.

New shared work is needed for a reusable discovery job/proof boundary and for
cross-surface authority/conformance. Original closed package descriptions
mention many of these duties, but no accepted shared implementation currently
discharges them. The tracker changes below make them explicit and executable.

## Iteration record

Phase 1: source, vision, tracker and deployment comparison; independent red
counterexamples authored. Phase 2: bridge plan above. Phase 3a: H1 and G0–G9
packages and their three phases reopened with the original scope retained,
previous closure evidence quoted, and specific corrective acceptance. H0's
parent/build/proof reopened because its callables are absent; its reviewed spec
remains closed. No active owner was reassigned.

### Ambition round 1 — shared correctness and responsive execution

The first bridge listed repairs but left eleven implementations to invent their
own job, proof and Apply semantics. Improve the plan with one shared contract:

- A pure theory stepper consumes an immutable request and an explicit work
  quantum. The application owns scheduling/cancellation; theory never imports a
  browser, worker, clock, content implementation or application token.
- Request identity includes document ID/revision, selected realization, exact
  policy/engine/law/corpus versions, constraints, bounds and seed when applicable.
  Result status distinguishes complete, no-result, bounded partial, cancelled,
  stale and refused; each status has a valid complete envelope.
- Counters measure actual expanded states, candidate checks and retained bytes.
  Queueing and zero-work calls are counted or explicitly excluded by spec.
  Limits apply before allocation, including inputs and result caches.
- A proof carries checked premises and actual postconditions, not copied flags.
  Application validates the source binding and every exact patch before one
  publication. Failed/cancelled/stale work changes no document or export marker.
- Compare full bytes under varied work quanta and interleavings. Pair every
  refusal with an honest success twin and mutation that would falsify the law.

This is missing shared implementation work. It supplements each original engine
contract and is not permission to merge domain/theory/application layers.

### Ambition round 2 — prove the musician's complete action

The shared engine contract alone still permits disconnected “complete” modules.
Add a cross-surface conformance package with an explicit authority map:

- Trace every visible feature to its actual production callable. Cover existing
  `chart-analysis.ts`/`continuation.ts`, restored H0/G2, and the native generated
  bridge. Mere matching names, interface types or passing contract validators
  cannot count as implementation coverage.
- Establish one reviewed semantic corpus and independent oracle per law family.
  Adapter implementations may differ, but spelling, containment, selected
  realization, refusal and exact timing must agree where the product promises
  parity. Do not silently expand the narrower native release scope.
- Follow “type → inspect → audition → change → Apply → Undo → recover → export”
  on real adapters. A suggestion preview must leave the chart untouched; Apply
  must preserve declared timing and pitches; the downloaded MIDI must match the
  same plan, and its loss disclosures must remain truthful.
- Test ambiguous/no-key/custom material, odd-meter and pickup timing, doubled
  Manual pitches, invalid/ineligible suggestions, stale async responses, denied
  storage, and keyboard/touch workflows. Existing U2/U4/U5/U7 owners retain their
  leaves; the shared proof joins their outcomes.
- Q0/R0 must compare the exact committed artifact and generated native bridge
  to their source closure. Current-source proof and previously shipped behavior
  are separate rows. A thin API's limitations must remain visible during repair.

This adds executable integration proof, not another documentation-only ledger.

### Ambition round 3 — stronger algorithms with checkable limits

Sophistication must improve the result and remain independently testable:

- **G0:** use a finite state sequence model with explicit transition/evidence
  costs and bounded k-best dynamic programming. Keep ambiguous, modal and no-key
  states; path diversity must reflect distinct readings, not duplicate labels.
- **G3:** search a finite lawful graph with nondominated cost labels. Prune only
  with a proved dominance relation or admissible bound. Keep deterministic ties
  and report frontier exhaustion separately from finding an optimum.
- **G4:** propagate hard constraints before search, then optimize whole-sequence
  alternatives. A bounded conflict-reduction pass may explain unsatisfiability;
  distinguish a sufficient conflict set from a proved minimal one. Never reduce
  the candidate space using musical taste disguised as a hard constraint.
- **G6:** use registered pitch/role states and transition assignment, so global
  guide paths can be compared to complete small enumerations. Pitch-class
  distances alone cannot prove noncrossing voices.
- **G1/G8:** separate exact identity from declared transposition equivalence.
  Canonical finite-state signatures can accelerate queries, but collision
  verification must compare exact structures; never deduplicate different
  rhythms, source spellings or lineage merely because one projection agrees.
- **G9:** generate finite answer sets and their near misses from reviewed
  templates. Semantic equality must be checked before assigning distractor
  labels; retain every accepted ambiguous answer and explicit partial credit.
- **All:** cache only by the full immutable semantic input/version tuple.
  Bound retained memory and compare cached/uncached output. Measure p50/p95 and
  worst observed execution separately from deterministic work termination;
  meeting a time target does not excuse an incorrect result.

The alternative to a proved pruning rule is an explicit bounded partial result,
never a fabricated optimum. Exhaustive small oracles stay structurally separate
from the optimized implementation. These requirements are embedded back into
the corresponding specification, build and proof Beads before refinement.

### Frozen Phase 3a operator

```text
OK so please take ALL of that and elaborate on it and use it to create a comprehensive and granular
set of beads for all this with tasks, subtasks, and dependency structure overlaid, with detailed
comments so that the whole thing is totally self-contained and self-documenting (including relevant
background, reasoning/justification, considerations, etc.-- anything we'd want our "future self" to
know about the goals and intentions and thought process and how it serves the over-arching goals of
the project.) The beads should be so detailed that we never need to consult back to the original
markdown plan document. Remember to ONLY use the `br` tool to create and modify the beads and add
the dependencies.
```

### Frozen Phase 5 operator

```text
Check over each bead super carefully-- are you sure it makes sense? Is it optimal? Could we change
anything to make the system work better for users? If so, revise the beads. It's a lot easier and
faster to operate in "plan space" before we start implementing these things! DO NOT OVERSIMPLIFY
THINGS! DO NOT LOSE ANY FEATURES OR FUNCTIONALITY! Also make sure that as part of the beads we
include comprehensive unit tests and e2e test scripts with great, detailed logging so we can be
sure that everything is working perfectly after implementation. Make sure to ONLY use the `br` cli
tool for all changes, and you can and should also use the `bv` tool to help diagnose potential
problems with the beads.
```
