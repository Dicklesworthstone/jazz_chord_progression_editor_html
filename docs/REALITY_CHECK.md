# JazzChords.org reality check — 2026-09-21

JazzChords.org is a useful, deployed offline studio. Editing, playback, recovery,
exact interchange, voicing inspection and several newer musician workflows are
real. The full harmonic-discovery vision is **not delivered**. The main gap is
musical correctness plus integration, followed by independent and human acceptance.
Several advanced engines contain fabricated metrics or lossy transformations;
connecting more buttons to them would expose defects, not finish the product.

The September 8 report was stale. Both hosts carry the current committed build, although a fresh Cloudflare
response includes its unwanted analytics injection; the earlier DSP/source mismatch and browser-admission defect are
closed, and M1 tied-key semantics have been repaired. This replaces that snapshot
in place. Historical observations remain in Git history, not as current claims.

## 2026-09-24 update (supersedes the rows it names; everything else stands)

Self-verified by the implementing session, no independent reviewer; each
item is live on both hosts unless stated.

- Row 6 / H0: `enumerateChordScaleOptions` is implemented against the
  unchanged contract (`19d7544`; 35 seed, 15 declaration and 312 root cells
  replayed) and the chord detail lists plural scale options (`f873bb0`).
  `analyzeChordInContext` is still absent: two context-reading fixture rows
  contradict the rule table (recorded on qqy.2.2 for the spec owner). The
  discovery audit is **30 pass / 1 fail**.
- H1: all eight registered law families with fixture cases generate
  candidates (`1e7b252`), and "Reharmonize this chord" (hear original / hear
  option / apply with one Undo, `28ac476`) now delivers September idea 7's
  compare-and-apply loop for single-chord variations.
- September idea 5: every suggested next chord can be heard in context
  before it is added (`c707279`).
- Audio: a mid-run instrument change or Play with a plucked instrument no
  longer faults the run, and any fault recovers with Play (`jcpe-j4hj`,
  `53cea18`/`e9a9017`); plucked Play starts on a provably safe prefix
  (`jcpe-70yb`, `4a7bdd4`).
- Still open and unchanged: G5 tree fixture names nonexistent law IDs
  (ulj.5), the cast-policy decision (np17), U0 evidence hashes, U7.

## 2026-09-22/23 update (supersedes the rows it names; everything else stands)

A same-day re-check reproduced every finding below (12/18 discovery audit,
one illegal cast, missing traceability commands) and added four live-product
defects the earlier pass had not exercised in a browser: altered dominants
could not be voiced (one silenced the whole chart), the Lens offered A♭7 as
the tritone sub after Dm7, guide-tone motion collapsed two voices and called
a leap a step, and exact share links refuse charts over about ten chords.
The root cause of the stalled musical work was structural: H0/spec was
blocked only by the whole-aggregate `verify`, which waits on human X0
listening, so about 98 beads could never become ready.

Since then (commits `b8b655d`..`f463b46`, self-verified, no independent
reviewer):

- H0/spec now exits on focused gates; the `np17 → 60xy` edge is removed;
  four stale agent claims were released. The aggregate stays the release gate.
- Altered dominants play (effective auto-voicing law). Six-degree chords
  still refuse (V0 six-voice work budget).
- The tritone sub, guide-tone assignment, minor-colour ordering and
  approach-chord spelling in the Lens are fixed.
- Row 17 (transposition) moves from WRONG_APPROACH to PARTIAL: an exact,
  parser-verified transposer with typed refusals, and a whole-chart
  Transpose dialog with one Undo. Range/section scope and an audible preview
  remain (`jcpe-transpose-workflow-nazh`).
- The discovery audit is now **29 pass / 2 fail** (one probe added, strictly
  stronger). Every reproduced engine defect is fixed with hand-authored
  tests: SHA-256 length suffix, Atlas digest/rights/manifest/query (G1),
  deceptive cadence (G0), ii–V exact split (H1), pin conflicts (G4),
  reached tree depth (G5), rhythm delay/anticipation/merge and exact grid
  refusal (G7), sequence steps and pure-triad P/L/R (G8), distinct practice
  answers (G9). The two remaining failures are H0's unbuilt contextual and
  chord-scale operations. These engines are still not wired into the app.
- Compressed exact share links, selection and to-key transposition with
  listen-before-apply, role-named guide tones and the alt-reading note are
  live (2026-09-23, artifacts `df5daf67…` then `6241746d…`).
- Decisions recorded, not taken unilaterally: six-alteration chords need a
  V0 raw-candidate cap amendment (`jcpe-v0-raw-candidate-cap-jhs6`, measured
  need 117–153 vs 96); the last illegal cast sits in the unused E0 v1
  factory (`np17`, recommendation recorded).

## Scope and evidence authority

Assessment: `jcpe-reality-check-september-5h2l`, CyanCove. Local baseline
`60017c7`; production-source/artifact commit `ef4c50e`. The remote checkout reports
`bb48441`; the later commit changes tracker metadata only. The fresh audit checked
all **1,770 captured input hashes** with no drift, so the remote Git label is not
being substituted for input identity.

All of AGENTS.md and README.md were read. Principal architecture, rebuild,
theory-idea, original idea-wizard, September product, dueling-idea, physical and
Apple plans were reviewed, together with relevant workflow contracts, source
consumers, fixtures, current Beads and recent commits. This is not a claim to have
read every line of every historical contract or source file. The earlier AST
scan was not rerun and supplies no fresh coverage claim.

All assessment phases apply below: vision inventory, concrete bridge, existing
Bead refinement, three ambition rounds, five review passes and convergence.
This solo assessment earns **zero implementation credit**. No production source,
test, acceptance threshold or generated artifact was changed. Existing fixtures
were rerun without rewriting expectations. A separate person's independent
acceptance is not implied by a fresh same-author review.

Fresh diagnostics ran through strict RCH on hz2 with Bun **1.3.14** and the real
Node **26.0.0** toolchain. The queue was allowed to finish; there was no local
fallback or competing browser suite. Raw commands, logs, expected/actual values
and input hashes are in ignored `test-results/reality-check-20260921/`.
Retained September 21 browser/deployment receipts were inspected, not rerun or
relabeled as fresh browser testing. Before report edits, their 1,846-input manifests differed only in the subsequent
implementation-TODO documentation update, not runtime inputs.

## Delivery and practical limits

| Evidence | Current result | Limit |
|---|---|---|
| Git HEAD root artifact | 8,646,325 bytes; SHA-256 `e1e193b8929ed3d7cfe96736528dca93c06761d04a4f8a2395054ae822d23ecb` | Current source/artifact identity, not full acceptance |
| Retained September 21 deploy | Cloudflare `09b1da7e`; Vercel `dpl_FZ9DmCZLpukQtwZKKGkcmneueeXM`, READY; both match committed HTML | No new upload during this assessment |
| Retained release gates | Guarded build, model acceptance 11 pass, instrument quality 9 pass / 16 warnings, native playback 15/15 | Recovery check explicitly vacuous; no recovery acceptance inferred |
| Retained hosted browsers | 12/12: two hosts × Chromium/Firefox/WebKit × 320/1280 widths; 24 exact JSON downloads, zero console/page errors or forbidden requests | Scoped marker/export journey, not all feature or human acceptance |
| Fresh HTTP verification | Vercel exactly matches Git; Cloudflare returns 8,646,692 bytes, SHA-256 `3cff1c9854d089c163138bf42a5579858df9e46ace0ba2f2d641dfb7cff9a3e3` | Exact diff is a 367-byte beacon insertion; underlying committed document otherwise identical |
| Cloudflare analytics | Fresh required-UA Python response contains `beacon.min.js`; none appeared in the retained browser matrix | `jcpe-2nky` remains open; keep CSP strict; no fresh browser-console claim |
| Artifact budget | 9 MiB total, including 512 KiB reserved Atlas; shell allocation 8,912,896 bytes | Only **266,571 shell bytes** remain; total headroom 790,859 bytes is not all available to UI |

Retained receipts: `test-results/marker-release-gates-20260921/`,
`test-results/marker-release-live-20260921/`, and
`test-results/marker-publication-final-20260921/`. The last helper has
`failed:false` for its scoped repair despite a recorded cast-policy command
exiting 1. Read command results, not just the helper flag. This is not an
aggregate green result.

The accepted architecture budget supersedes older 1.5 MiB release prose. R0
still needs to reconcile that stale prose and architecture statements that say
U1/A0/E0 integration does not exist. Reviewed fixture-status fields must not be
changed merely because implementation exists.

## Vision checklist

WORKING means observed usable production behavior within the stated scope.
PARTIAL means real implementation with missing scope. UNPROVEN means the full
named acceptance is absent. WRONG_APPROACH means source behavior contradicts
the contract, even when the function has a plausible name. STUB includes
fabricated metrics or pass-through success, not every empty callback.

Package abbreviations resolve through the exact-ID coverage section later in this report.

| # | Testable promise and authority | Current classification and evidence | Remaining owner / success boundary |
|---:|---|---|---|
| 1 | One self-contained offline HTML, pinned Preact-only runtime, reproducible build (F0/R0) | WORKING local file/HTTP boot with network denied; generated source architecture exists. Current committed artifact passes retained predeploy/source binding; complete release proof remains UNPROVEN. | F0/R0; exact committed-byte rebuild and mandatory gates |
| 2 | Spelling-first identity, stable IDs, exact rational time (F1/F2/T0/T1/F3) | WORKING foundation; PARTIAL system-wide adherence. H1/G7/G8 violate preservation when transforming valid inputs. | Existing engine repairs; positive/near-miss/transposed/mutated law fixtures |
| 3 | Fast paste/type/edit of bar-delimited charts and exact durations (U1) | WORKING editor and diagnostic repair paths. Retained editing/Undo/Redo proof exists; entry repair has completed package proof. | Q0 integrated editing/IME/hostile-input regression |
| 4 | Distinct selection, insertion, playhead, history and transactional publication (A0/U1) | WORKING current editor architecture; later async consumers still need to use it correctly. | Shared application intents and stale Apply/Undo proof |
| 5 | Seven-part inspector and exact 16-note Manual/Frozen choose/hear/keep (U2) | PARTIAL acceptance: spec/build closed, production inspector exists; proof in progress. Duplicate notes and source spelling must survive. | U2 proof; do not advertise the editor as absent |
| 6 | Literal facts, plural contextual readings and explicit scale evidence (H0/U3) | PARTIAL: literal facts implemented; `analyzeChordInContext` and `enumerateChordScaleOptions` NOT_STARTED at public boundary. Existing Harmony Lens is smaller. | H0 spec/build currently BLOCKED, then proof/U3 |
| 7 | Deterministic voicings, optimal assignment, bounded progression optimization (V0/V1/V2/U6) | WORKING foundation engines; complete selection/comparison/voice-motion workbench PARTIAL. V2 has declared beam/window limits, not unrestricted global optimality. | U6 and independent finite-oracle verification |
| 8 | One immutable musical plan shared by audio and MIDI (P0/E1) | WORKING plan compiler and export paths. No permission for suggestions to invent a second note timeline. | U7 plus exact preview/audio/export integration |
| 9 | Persistent graph, serialized transport and immediate Stop ownership (X0/X1/U4) | WORKING basic native Play/Stop in retained native browser evidence; complete timing/listening acceptance UNPROVEN. | U4, runtime leaves, X0 human listening |
| 10 | Count-in, metronome, loops, seek and live controls preserve arrangement (U4/rehearsal) | PARTIAL: extensive controls/fixes, but complete U4/rehearsal acceptance remains open. Old September 8 timing failures are historical, not a fresh failure count. | Preserve U4 owner and rehearsal phase gates |
| 11 | Local recovery with conflict/previous-copy fallback and visible failure (A1/U5) | WORKING completed lifecycle package and real persistence paths. Best-effort storage is not durable Save. | Preserve U5 regressions; Q0 denied/quota/stale-writer cases |
| 12 | Safe New/import replacement and exact canonical JSON/text export (E0/C0/U5) | WORKING lifecycle and download adapters; retained September 21 hosted JSON downloads match expected bytes. General publication-policy violations remain. | np17 plus exact round-trip/marker/replacement proof |
| 13 | Bounded MIDI parsing, uncertain multi-track interpretation, exact-note preservation (M0/M1) | PARTIAL: real Rust/WASM import and review; the tied-key law and presentation were repaired; build/spec are closed, independent proof remains open. | M1 independent proof, owner listening/DAW review |
| 14 | Real MIDI download from the shared plan with truthful losses (E1/U7) | WORKING production workflow and prior package evidence; fresh audit did not decode a new SMF download. | U7/Q0 exact note/time and human external-player acceptance |
| 15 |250 reviewed Atlas seeds/3,000 variants, valid hashes and rights firewall (G1/D0) | WRONG_APPROACH compiler/hash/query behavior; reviewed large corpus NOT_STARTED as a complete deliverable. Small progression library is not D0. | G1 repair, D0 reviewed content, bounded size/provenance proof |
| 16 | All fifteen discovery workflows (§11.9) | PARTIAL/STUB/WRONG_APPROACH as itemized below; no claim of complete full-contract delivery. | G0–G9 plus U8–U11 and D0/D1 |
| 17 | Lossless spelled chart/range/section transposition with explicit exact-pitch policy (H1) | WRONG_APPROACH:6/9 lost and Unicode roots unchanged; the promised web workflow is NOT_STARTED. | H1 then transpose-workflow, never reuse the broken string replacement |
| 18 | Reviewed lessons and accurate practice grading (D1/G9/U11) | PARTIAL starter/help/library; complete lesson corpus absent and grading can contradict itself. | D1/G9/U11; subjective listening separate from objective grading |
| 19 | Accessible keyboard/touch/zoom/reduced-motion desktop and phone UX (U0/Q0) | PARTIAL evidence: retained three-engine desktop/phone boot evidence exists; full browser/device/accessibility acceptance UNPROVEN. | Q0 plus human accessibility; inspect crowded default phone header |
| 20 | Deterministic work/state/memory bounds, cancellation and responsive discovery (§11.9) | WORKING generic protocol; STUB engine counters and missing musical adoption remain. | Completed gdcw consumed by repaired engines and semantic-surface package |
| 21 | Physical-model fidelity, continuous gestures and exact source/WASM/pack binding (PHS) | PARTIAL shipping instruments; current predeploy binding passes for the shipping artifact; human quality remains open. | Existing PHS/instrument leaves; no duplicate DSP program |
| 22 | Complete retry-free release gates and verified delivery on both hosts (Q0/R0) | UNPROVEN: cast policy is red, traceability commands absent, package/human gates open. Both hosts carry the current build; fresh Cloudflare response is modified by analytics. | Existing Q0/R0; admission bug is closed |
| 23 | Native iPhone/iPad/Mac editing/playback/recovery/interchange sibling (Apple plan) | PARTIAL substantial SwiftUI/AVAudioEngine implementation and historical Apple proof; full discovery semantics and current release acceptance UNPROVEN. | uo47/native leaves, regenerated semantic bridge, actual Apple execution |
| 24 | No runtime AI/network/telemetry or silent repair (AGENTS) | WORKING local architectural boundary; host has intermittently injected blocked analytics. Silent musical repairs in transformation code still violate exactness. |2nky and H1/G7/G8 refusal laws; keep CSP strict |

## Every discovery promise

The source audit followed actual exports, the studio controller, application
services and native bridge. A function existing in `src/theory` is insufficient.
The generic execution service is finished; the current studio still calls the
smaller `deriveContinuationSuggestions`. The native v1 bridge directly calls G2
with invented four-beat events and a smaller symbol-only response. Local native
revision guards do not make that response the complete shared semantic protocol.

| HD | User outcome | Current engine gap | Complete delivery path |
|---|---|---|---|
|01 | Contextual next chords | G2 ranks fixed last-chord templates with constant scores; full context/provider/constraint search missing. Web containment explanation was repaired separately. | H0/G2/U8 + semantic-surface |
|02 | Validated progression Atlas/compiler | Nonempty SHA wrong; source-hash validation bypassable; fingerprint-only content retains expression; manifest ignores changed payload. | G1/D0/U8 |
|03 | Goal-directed routes | G3 fixed templates/costs and synthetic visited-state counts do not implement bounded graph search. | G3/U9 |
|04 | Constraint harmonization | G4 varies first slot only, chooses remaining first candidates and accepts contradictory pins; counts/costs fabricated. | G4/U9 |
|05 | Reharmonization branches | G5 limited rule tree lacks complete intermediate-law validation and can report requested depth instead of reached depth. | G5/U9 |
|06 | Multi-hypothesis tonal journey | G0 emits one heuristic path with fixed confidence, lacks complete k-best/no-key/pinned lattice. | G0/U8 |
|07 | Guide-tone line design | G6 greedy pitch-class movement cannot establish global registered, noncrossing, pinned voice paths. | G6/U10 |
|08 | Contextual colors/upper structures | G6 key/role handling and clash evidence incomplete; unsupported spelling can be clamped instead of refused. | H0/G6/U10 |
|09 | Cadence/phrase/approach construction | G0 misses G7→Am deceptive motion; H1/G7 exact construction laws incomplete. | G0/H1/G7/U10 |
|10 | Harmonic-rhythm transforms | G7 delay passes unchanged input as success; unrepresentable diminished durations silently retain input. | G7/U10 |
|11 | Tension/release curve | G7 fixed register/context and index-based voice-motion values are not the promised measured axes. | G7/U10 |
|12 | Fingerprints/similarity | G1 interval substring search matches1 inside11; placeholder degree profiles and incomplete structural equivalence. | G1/D0/U8 |
|13 | Motif/sequence engine | G8 lacks full extraction/landing solver; zero/unsupported sequence interval silently becomes major second. | G8/U10 |
|14 | Nonfunctional/common-tone Atlas | G8 basic triad operations exist but accept added-tone chords and drop notes; full planing/mediant/common-tone laws absent. | G8/U10 |
|15 | Chart-to-Practice | G9 can present identical right/wrong answers; complete reviewed templates/rubrics and ambiguity handling absent. | G9/D1/U11 |

## All fifteen September product ideas

Four completed workflow packages do not complete this separate fifteen-idea campaign.

| Idea | Current state | Existing work and prerequisite |
|---:|---|---|
|1 Play in the key you need | Workflow open; H1 currently corrupts valid input | H1 → `jcpe-transpose-workflow-nazh` spec/build/proof |
|2 Choose, hear and keep a voicing | U2 production implemented; full proof/U6 remains | U2 `.11.3` and U6 |
|3 Practice this passage with the band | Same-key arrangement repair implemented in part, named gates unresolved; complete bounded session open | `jcpe-rehearsal-session-6y2b`, U4 proof; separate key-sequence leaf follows H1 |
|4 My Charts with portable backup | Package complete; present in current artifact; preserve actual collection-write evidence | `jcpe-my-charts-zt9z` closed; preserve stale-tab/quota/atomic restore proof |
|5 Three audible next-chord choices | Smaller panel works; full semantics/audible choices incomplete | G2/U8 + existing semantic-surface |
|6 Share the exact chart | Package complete; current artifact contains exact sharing | `jcpe-exact-share-1ric` closed; exact round-trip proof remains its package evidence |
|7 Compare Original and Variation | Complete interaction not delivered | G5/U9; identical playback conditions, exact diff and one Apply/Undo |
|8 Hear and see moving voices | Partial inspector/voice engines, complete registered audible comparison missing | U3/U6, G6 as applicable |
|9 Find a fragment by musical goal | Small reviewed library exists; full goal/Atlas search incomplete | G1/D0/U8 |
|10 Fix the exact entry token | Package complete, source-offset/IME repair implemented | `jcpe-entry-repair-0h1g` closed |
|11 Focus chart | Package complete; current artifact contains Focus chart | `jcpe-chart-focus-7iz1` closed |
|12 One-minute listening lessons | Complete reviewed collection/workflow open | D1; subjective listening never auto-graded |
|13 Keep bass/top while varying harmony | G4 currently violates pin conjunction | G4/U9; registered constraints at every slot |
|14 Connect sections in the available bars | G3 templates insufficient | G3/U9; exact endpoints/time and honest no-route |
|15 Review uncertain MIDI interpretation | Existing Advanced review is partial | M1 independent proof, source-note ambiguity links and human review |

The original foundation ideas remain covered by the24-row checklist: exact
spelling/time, safe authoring, voicing/voice-leading, playback/export parity,
recovery, contextual education, accessibility, bounded search and standalone
release. No original scope is dropped to make a newer campaign appear complete.

## All fifteen dueling-wizard finalists

This third campaign is distinct from the fifteen discovery systems and the
fifteen September workflow ideas. Fifteen finalists were consolidated into
**13 packages**. Live Beads show **11 closed build leaves, 13 open verification
leaves and zero closed package epics**. That is real implementation progress,
not thirteen fully accepted features. Exact phase IDs are `.1` specification,
`.2` build, `.3` independent proof beneath the package IDs below.

| Package under `jcpe-6ujg` | Implemented scope | Outstanding acceptance / dependency |
|---|---|---|
| `.1` Play-along display | Real playback-position display | Independent timing/browser/accessibility proof |
| `.2` Performed MIDI | Arrangement rendered to downloadable MIDI | Independent parse and two external players/DAWs |
| `.3` Note-first entry | Exact pitches, candidate spelling, audition, Add/Undo | Independent musical and physical-phone review |
| `.4` Guitar + instrument view | Exact occurrences mapped to bounded string/fret positions | Independent proof and guitarist/device judgment; no guessed fingering |
| `.5` Comping + groove controls | Authored session rhythm affects audio/performed MIDI | Independent acceptance; durable recipes are deferred explicitly, not silently persisted |
| `.6` Band dropout | Specification complete | Build/proof wait on bounded rehearsal and U4 |
| `.7` Touch pads | Audition and release through existing owner | Physical pointer/cancel, touch and listening acceptance |
| `.8` Short WAV | Bounded piano render/download | Independent phone memory, audio and download evidence |
| `.9` ChordPro/grid import | Bounded compatible import | Independent references and real user-file review |
| `.10` Exact QR | Local QR for existing bounded exact links | Physical camera interoperability and exact reconstruction |
| `.11` Printable charts | Vector chart output | Physical A4/Letter/phone print review; do not revive retracted missing-glyph diagnosis |
| `.12` Ear training | Not implemented | G9 distinct/unambiguous grading before spec/build/proof |
| `.13` Register observations | Neutral literal register/interval facts | Independent musician acceptance; no universal quality score |

The detailed subtask inventory remains in [DUEL_IMPLEMENTATION_TODO.md](DUEL_IMPLEMENTATION_TODO.md).
Eleven ready verification leaves are valuable work now; do not invent another
feature campaign because some acceptance requires human/device access.

## Fresh diagnostic results

The RCH wrapper ran the following exact child commands. Exit 1 was expected for
counterexamples, but is still failure evidence, never a passing release gate.

| Command | Result | What it establishes |
|---|---|---|
| `bun run doctor:toolchain` | Exit 0 | Pinned toolchain admitted |
| `bun scripts/audit-discovery-reality.ts` | **12 pass, 18 fail**, 30 checks, exit 1 | Existing semantic defects reproduce; not 18 distinct root causes |
| `bun test tests/static/validated-document-cast-policy.test.ts` | **1 pass, 1 fail**, 7 assertions | One unauthorized cast at `application/e0-interchange.ts:1741` remains |
| `bun test tests/static/h0-contract-consistency.test.ts tests/unit/h0-literal-facts.test.ts` | **97 pass**, 4,835 assertions | Literal/contract packet; not missing contextual/scale implementation |
| `bun scripts/validate-x1-contract.ts` | Exit 0, zero findings; 119 state cases, 30 mutation controls | Specification validation, not native transport/listening acceptance |
| `bun scripts/verify-traceability.ts` | Exit 1: module absent | Required legacy traceability command not implemented |
| `bun scripts/verify-discovery-traceability.ts` | Exit 1: module absent | Required discovery traceability command not implemented |

`bun run verify` was **not rerun** during this assessment. Its 71 declared gates
are not a substitute for the absent Q0 traceability obligations. The known red
cast gate, open package proof and human acceptance prevent an aggregate release
claim. Historical timeout counts are not carried forward as fresh failures.

### Reproduced musical counterexamples

| Counterexample | Required behavior | Actual behavior |
|---|---|---|
| H0 contextual/scale public operations | Both functions callable | Both `undefined` |
| SHA-256 of `abc` | `ba7816bf…15ad` | `a4b8841f…85d7`; empty-string control passes |
| Atlas wrong all-`f` source digest | Reject entry | One accepted entry |
| Synthetic `fingerprint-only` entry | No chord expression retained | `chords` remains in compiled payload |
| Same Atlas IDs, changed musical payload | Changed manifest digest | Same digest |
| Query interval1 against interval11 | No match | Match |
| C6/9/E transposed up major second | D6/9/F# | D6/F# |
| Unicode D-flat major seventh | Transposed spelled root | Root unchanged |
| Three-beat G7 split into ii–V | Total remains3 | Total becomes2 despite balance claim |
| Pinned Cmaj7 with incompatible C-sharp bass | Explicit conflict/refusal | Accepted |
| G7→Am | Deceptive cadence | No cadence |
| Delay four beats by one | Five beats | Four, reported as result |
| Diminish1/960 past supported grid | Refuse unsupported1/1920 | Accept original duration |
| P operation on Cadd9 | Refuse ineligible added-tone chord | Cm, addition dropped |
| Zero-interval sequence from C | C then C | C then D |
| Practice answer options | Semantically distinct right/wrong choices | Same “E and B” is both |
| Reharm tree reaches no children | Reached depth0 | Reports requested depth2 |


The M1 tie-set amendment now passes: retain full-set equivariance and unique-only
automatic selection. The retained absolute-presentation counterexample is an
honest limitation, not a remaining implementation failure. M1 spec/build are
closed; independent source-note/DAW/listening proof remains open.

## Bridge in practical execution order

Each package retains specification → implementation → independent proof. Claim
one ready leaf, preserve existing owners, and measure success in usable musical
behavior. Relative effort below is an engineering judgment, not a time estimate.

| Priority | Concrete result | Existing owner and dependency | Required proof / effort |
|---:|---|---|---|
| 1 | Finish acceptance of useful features already implemented | Ready `jcpe-6ujg.*.3`, M1 `jcpe-qbvz`, active U2/U4 owners | Real adapters and physical/DAW/listening where named; medium per feature, human availability separate |
| 2 | Remove the final illegal document-publication cast without bypassing validation | `jcpe-cast-policy-compatibility-np17`; current assignee/dependencies retained | Exact legacy import success/refusal, branded F3 publication, marker/recovery/Undo; unchanged cast scanner; small-to-medium |
| 3 | Deliver H0 contextual readings and plural scale evidence | `jcpe-milestone-musical-intelligence-qqy.2` | No-key/modal/ambiguous/custom/selected-alt and explicit section-key context; all positive/near-miss/transposition/mutation laws; large |
| 4 | Make transposition exact and usable for a chord/range/section/chart | H1 `.qqy.3` → `jcpe-transpose-workflow-nazh` | AST-based spelling, 6/9 and slash bass, Unicode/double accidentals, inverse law, exact time and explicit Manual/Frozen policy; preview/Apply/Undo; medium-to-large |
| 5 | Offer three genuinely distinct audible continuation choices, with full More view | G2 `.qqy.6`, U8 `.qqy.9`, semantic-surface `32w2`; use completed `gdcw` | Whole-context providers, honest measured costs, exact timed patches, preview/source immutability/stale refusal/one Undo, real shared audio/MIDI plan; large |
| 6 | Ship trustworthy Atlas discovery | G1 `.qqy.5`, D0 `.qqy.7`, U8; H1 for variants | Standard SHA vectors, tamper detection, expression-free fingerprint-only records, token-exact queries; 250 reviewed seeds/3,000 variants within reserved size; large including review |
| 7 | Complete bounded rehearsal, then dropout and key sequence | `jcpe-rehearsal-session-6y2b`, U4, `jcpe-6ujg.6`; key sequence additionally H1 | Exact pass/attack/release identity, tempo/count-in/endpoints, cancellation/Stop, 64-pass limit; medium-to-large |
| 8 | Complete the remaining advanced engines and workbenches | G0/G3–G9, U6/U9–U11, D1 | Independent finite oracles, actual work/state/memory counters, honest truncation, all hard constraints; all fifteen outcomes retained; large |
| 9 | Finish complete release/native/physical proof | Q0/R0, PHS, `uo47`, human leaves | Add missing traceability commands; full unchanged matrix, actual Apple execution and listening; keep unaccepted models dark; mixed engineering/human |

This order is a value ranking, not an instruction to violate dependency readiness.
H0/spec remains blocked by its whole-aggregate exit requirement, and np17 depends
on X0 human listening (`jcpe-60xy`). That couples foundational correctness work to
broad acceptance. If a narrower spec exit is desired, it requires an explicit
contract decision. This audit does not remove the gate or mark H0/build ready.

### Phase 3a: existing Beads, no duplicate backlog

The observed defects already have implementation and proof owners. Refine those
records with current evidence and actionable acceptance instead of creating
parallel packages. Exact engine paths are `src/theory/analysis.ts`,
`spelled-transposition.ts`, `contextual-continuation.ts`, `atlas-compiler.ts`,
`atlas-query.ts`, `tonal-journey.ts`, `route-planner.ts`,
`harmonization-workbench.ts`, `rhythm-transforms.ts` and
`nonfunctional-transforms.ts`. The integration seam is the studio controller,
existing discovery job service and `ios/TheoryBridgeSource/entry.ts`.

Coverage remains: H0/H1/G0/G1/G2 = `.qqy.2`–`.6`; D0 = `.qqy.7`;
U3/U8 = `.qqy.8`–`.9`; G3–G9 = `.ulj.3`–`.9`;
U6/U7/U9/U10/U11 = `.ulj.10`–`.14`; D1 = `.ulj.15`.
These abbreviations expand to `jcpe-milestone-musical-intelligence-qqy` and
`jcpe-milestone-advanced-craft-ulj`. Each retains its `.1/.2/.3` phase leaves.

Other coverage: `jcpe-semantic-surface-conformance-32w2`,
`jcpe-milestone-release-proof-pv1.1` (Q0), `.2` (R0),
`jcpe-ios-quality-verification-uo47`, `jcpe-mnsc` (physical),
`jcpe-60xy`, `jcpe-rh3a`, `jcpe-wyw5`, `jcpe-espf`, `jcpe-mnsc.9.4`
(human acceptance), and `jcpe-2nky` (host injection).

Branding work stays in `jcpe-0b8b`. JazzChords.org is the web product name.
Persisted `changes.*` schema/storage identifiers and the Vercel hostname are
compatibility identifiers, not a reason for blind replacement. That Bead records
a separately requested FrankenJazz native sibling name; reconcile that explicit
exception with the repository-wide naming instruction before changing native
identity. Do not misreport every such occurrence as accidental web branding.

### Three ambition rounds, incorporated into the bridge

1. **Complete a musician journey, not another engine wrapper.** Prioritize
   transposition and continuation after their correctness prerequisites; consume
   the finished `gdcw` service. No competing scheduler/schema/protocol. Existing
   semantic-surface build gets the current actual-consumer mismatch and adoption
   obligations; the simple web suggestion API is not falsely credited as G2.
2. **Make exactness audible and reversible.** Existing semantic-surface proof
   must compare registered notes and exact rational times through preview,
   Apply/Undo, recovery, JSON and independently parsed MIDI. Include duplicate
   Manual unisons, pickup/odd meter, source edits during search and explicit
   section key. Native bridge must not invent four-beat event semantics. Keep
   Apple's narrower first-release surface; do not add unrequested native G3–G9.
3. **Strengthen the algorithms rather than embellish scores.** Preserve bounded
   k-best tonal paths, route search, whole-sequence constraint propagation,
   registered voice paths and collision-checked exact fingerprints. Use finite
   exhaustive oracles on small cases, real counters and deterministic caps.
   Scores are model costs, not calibrated probabilities. G2/H1 build records
   receive the concrete positive/negative controls; no scope is dropped.

### Five refinement passes and convergence

| Pass | Decision and correction |
|---:|---|
| 1 — Scope | Separate the rebuild, discovery, September workflow and duel campaigns. Credit 11 duel builds without closing 13 proofs. Retain all original musical promises. |
| 2 — Dependencies | Recheck live Beads; retain owners and H0/np17 human constraints. Closed admission/u90y are no longer priorities. Do not equate bv importance with claimability. |
| 3 — Evidence | Replace stale 29-cast and M1-failure claims with fresh one-cast and 12/18 diagnostic results. Attach missing traceability commands to Q0. Distinguish spec checks, actual runtime proof and human acceptance. |
| 4 — Value and design | Put existing feature acceptance and exact transposition/continuation ahead of another idea campaign. Strengthen existing semantic integration and finite-oracle obligations, with no duplicate service. |
| 5 — Delivery and honesty | Correct stale hosted/source/budget claims; retain warnings, vacuous recovery, unavailable human proof and intermittent injection. Scope documentation reading and browser evidence honestly. |
| 6 — Convergence | Read back changed records and report; verify graph, source hashes, links and diff. No additional identified gap needs a new package. This is plan coverage, not implementation acceptance. |

Finishing the existing tasks **with their full named gates** covers the identified
vision gaps. It does not guarantee absence of undiscovered defects. There is no
meaningful project-completion percentage based on the 647 tracker records.

## Assessment acceptance and next work

The [implementation TODO](IMPLEMENTATION_TODO.md) tracks the concrete remaining
order; the duel TODO preserves each feature's detailed proof checklist. All
tracker edits use `br`, followed by `br sync --flush-only`. Only the assessment
may close from this work; no implementation or human leaf closes by report.

Final `bv --robot-triage`, `--robot-insights` and `--robot-plan` return 0;
authority is complete with 647 visible records, zero errors and no stale source.
`br dep cycles --json` reports zero cycles. `br ready --json` exposes 19 rows,
including human-only work; bv's 70 actionable nodes are not 70 claimable leaves.
All 365 tracked source mtimes are unchanged. Of 1,770 audited input hashes,
only the two deliberately edited report/TODO files differ. `git diff --check`
passes, local Markdown links resolve, and both frozen skill operators remain
verbatim. No tracked source, script, test or root-artifact diff exists.
Exact closeout is recorded on the assessment Bead.
The three untracked peer application panels remain untouched. The final Agent
Mail handoff timed out and was queued UNSENT; delivery is not assumed, and the
assessment Bead records the fallback. Fleet ownership of tracker commits remains. Report/TODO edits
do not require rebuilding or redeploying the unchanged app.

Anti-ceremony review: the recent marker fix is user-visible data-integrity work;
its tests/build are enablers, and release/tracker notes are process. This audit
itself is requested process work and adds no musician capability. Stop refining
reports after convergence and return to a ready feature-proof leaf. The honesty
inventory found no test relaxation, synthetic human approval or implementation
closure in this assessment. The prior scoped receipt's `failed:false` is disclosed
above alongside its red cast command, rather than reused as an aggregate pass.

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
