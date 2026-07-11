# Theory Engine Idea Wizard: The Harmonic Discovery System

Status: phases 1-6 complete; selected ideas integrated into the reviewed plan
and polished Beads implementation graph

Date: 2026-07-11
Scope: ambitious deterministic music-theory capabilities for chord progressions

## Decision

The rebuilt product should grow beyond a correct chord parser plus a few
substitution buttons. Its differentiator will be a **Harmonic Discovery System**:
an offline, deterministic collection of analyzers, law-checked transformations,
bounded search engines, and validated corpora that help users answer:

1. What could come next, and why?
2. How can I connect this chord or section to a target?
3. What can I change while preserving my bass, melody, rhythm, or destination?
4. What are several defensible ways to hear this progression?
5. Which harmonic device am I using, and what other forms can it take?

There is no model, network call, learned black box, or runtime generative AI.
Every runtime result comes from canonical chord data, declared rules, bounded
algorithms, checked-in corpora, and visible policy choices. Development-time AI
may propose candidate presets or continuation examples, but it has no authority;
the quarantine and validation protocol below determines what can ship.

This focused pass treats the existing spelling-first AST, exact timeline,
context analysis, voice-leading engine, and suggestion-law concept as
foundations. It ranks additions to those foundations rather than re-proposing
the foundational rebuild.

## Idea Wizard method

Phase 1 reread the repository evidence, legacy audit, current rebuild plan,
MTDT chord/theory findings, and the complete Beads backlog. There is no
`AGENTS.md` in the current repository; the tracker snapshot was empty before
the plan-to-Beads conversion began.

Three independent Phase 2 passes generated 90 raw ideas from musician,
algorithm, and product-accretion perspectives. Overlaps were normalized into the
30 candidates below. Each candidate was scored 1-5 for Robustness, Reliability,
Performance, Intuitiveness, User-friendliness, Ergonomics, Usefulness,
Compelling value, Accretive value, and Pragmatism. Usefulness and Pragmatism have
2x weight and Accretive value has 1.5x weight, for a weighted score from 1-5.

Hard-cut ideas have a score of 1 in at least one dimension. Synergy decides close
rankings: a capability that supplies reusable laws, corpus data, or explanations
to several other winners outranks an isolated widget.

## Thirty normalized candidates

Legend: Rb robust, Rel reliable, Pf performant, Int intuitive, UF user-friendly,
Erg ergonomic, Use useful, Cmp compelling, Acc accretive, Prg pragmatic.

| # | Candidate | Rb | Rel | Pf | Int | UF | Erg | Use | Cmp | Acc | Prg | W |
|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | Contextual Continuation Engine | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.76 |
| 2 | Validated Progression Atlas and Preset Compiler | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.76 |
| 3 | Goal-Directed Harmonic Route Planner | 5 | 5 | 4 | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 4.68 |
| 4 | Constraint Harmonization Workbench | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 4.60 |
| 5 | Proof-Carrying Reharmonization Branches | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.60 |
| 6 | Harmonic Tension/Release Curve Designer | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4.52 |
| 7 | Multi-Hypothesis Tonal Journey Map | 5 | 5 | 5 | 4 | 4 | 4 | 5 | 4 | 5 | 4 | 4.52 |
| 8 | Progression Fingerprint and Similarity Explorer | 4 | 5 | 4 | 5 | 5 | 5 | 4 | 4 | 5 | 4 | 4.44 |
| 9 | Dedicated Modulation/Pivot Planner | 4 | 4 | 4 | 5 | 5 | 4 | 5 | 5 | 5 | 3 | 4.36 |
| 10 | Melody-Anchor Harmonizer | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 4.48 |
| 11 | Bass-Line-First Harmonizer | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4.56 |
| 12 | Guide-Tone Line Designer | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4.40 |
| 13 | Harmonic Skeleton/Elaboration Engine | 4 | 4 | 5 | 4 | 4 | 4 | 5 | 4 | 5 | 3 | 4.20 |
| 14 | Cadence, Phrase, and Approach Builder | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4.48 |
| 15 | Lead-Sheet Harmonic Query Language | 4 | 5 | 5 | 4 | 4 | 5 | 4 | 4 | 5 | 4 | 4.36 |
| 16 | Motif and Sequence Transformation Engine | 4 | 4 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 4.40 |
| 17 | Interactive Chord-Space Neighborhood | 4 | 5 | 5 | 4 | 4 | 4 | 4 | 5 | 4 | 4 | 4.24 |
| 18 | Harmonic-Rhythm Transformation Engine | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4.40 |
| 19 | Seeded Deterministic “Surprise Me” | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 4.48 |
| 20 | Chart-to-Practice Laboratory | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4.48 |
| 21 | Standalone Harmonic Ambiguity Explorer | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4.24 |
| 22 | Voicing-Aware Substitution Suggestions | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 4.48 |
| 23 | Nonfunctional/Common-Tone Transformation Atlas | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 4 | 5 | 3 | 4.12 |
| 24 | Explicit Ranking/Taste Profiles | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 3 | 4 | 5 | 4.48 |
| 25 | Counterfactual Compare Matrix | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 4.56 |
| 26 | Theory Evidence and “Why Not?” Inspector | 5 | 5 | 5 | 3 | 4 | 3 | 4 | 3 | 5 | 4 | 4.12 |
| 27 | Contextual Color and Upper-Structure Laboratory | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 4.44 |
| 28 | MIDI Phrase-to-Progression Harmonizer | 3 | 4 | 3 | 4 | 4 | 4 | 4 | 4 | 4 | 2 | 3.52 |
| 29 | Universal Harmonic “Correctness” Score | 2 | 2 | 5 | 2 | 2 | 2 | 2 | 2 | 1 | 4 | 2.44 |
| 30 | Runtime Generative-AI Composer | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 1 | 1 | 2.44 |

Candidates 29 and 30 are hard cuts. A universal score would disguise taste and
context as fact. Runtime AI breaks offline determinism, reproducibility,
explainability, privacy, and the explicit product boundary. Candidate 28 is
deferred because browser MIDI capture and phrase interpretation expand beyond
the chord-progression center. A user-extensible harmony DSL was also rejected
from the normalized list: it is powerful but makes safety, discoverability, and
validation disproportionate to first-release value.

## Selected top five

### 1. Contextual Continuation Engine

This becomes the signature “what could come next?” workflow. At an insertion
point, independent deterministic providers inspect the prior one to four events,
declared and inferred context readings, metric/phrase position, recent root and
bass motion, guide-tone continuity, repetition, cadence setup, and color trend.

Providers cover diatonic continuation, dominant resolution, secondary
dominants, ii-V expansion, tritone and backdoor approaches, modal interchange,
passing/common-tone diminished motion, sequence continuation, dominant chains,
chromatic approaches, pedal/line-cliche motion, and explicitly nonfunctional
modal/constant-structure continuation. Each candidate carries:

- stable rule/provider/version IDs;
- exact source event IDs and base revision;
- satisfied preconditions, counterevidence, and missing evidence;
- literal chord ASTs and exact proposed timing;
- bass, guide-tone, common-tone, cadence, color, and voice-leading cost axes;
- the reason it belongs to a category such as Resolve, Continue Pattern,
  Increase Color, Stay Modal, Approach Target, or Explore.

Hard-invalid options are removed; dominated options are Pareto-pruned. Visible
policies—Smooth, Functional, Colorful, Exploratory—supply versioned weights but
never masquerade as a probability or objective best chord. Suggestion cards show
symbol, context, motion, Preview, Insert, and Why This Appears. Editing any source
event makes the card stale and disables application until recomputed.

Why it is first: it answers the editor's most frequent creative question exactly
where the user is working, while making every other engine—analysis, corpus,
voice leading, cadence detection, and transformations—more valuable.

### 2. Validated Progression Atlas and Preset Compiler

Replace a small mutable preset list with an exceptional offline atlas of harmonic
devices, progression fragments, complete forms, transformations, and exercises.
Source templates encode relative roots or exact nonfunctional relationships,
canonical ASTs, exact meter/durations, key/mode assumptions, cadence/phrase
roles, legal transformations, a structural skeleton, “what to listen for,” and
provenance/review state.

The compiler expands only declared parameters across keys, modes, meters,
lengths, and law-backed transformations. It rejects malformed symbols, broken
measures, failed laws, unsupported spelling, transpose/inverse-transpose errors,
and duplicate fingerprints. The initial atlas should cover at least:

- major and minor ii-V-I families;
- turnarounds and dominant cycles;
- blues and backdoor devices;
- modal vamps and constant-structure planing;
- passing/common-tone diminished uses;
- deceptive, plagal, and chromatic approaches;
- rhythm-changes-derived harmonic skeletons without artist imitation;
- major-third/symmetric cycles and chromatic-mediant sequences;
- line cliches, pedal harmony, and slash-bass motion;
- reharmonization before/after pairs and targeted practice gaps.

Users browse by goal, start/end function, length, key, meter, device, complexity,
bass contour, tonal/modal character, or fingerprint. A result can open as a new
chart, insert into an exact range, or remain a read-only lesson.

Why it is second: the atlas makes the engine useful immediately, turns abstract
rules into audible material, and supplies verified examples to continuation,
search, lessons, tests, and route planning.

### 3. Goal-Directed Harmonic Route Planner

This answers “how can I get from here to there in exactly this musical space?”
The user chooses source, destination chord/key/function/cadence, available beats
or slots, allowed devices, chromaticism, bass direction, fixed notes/chords,
tension shape, and required/forbidden material.

Nodes preserve literal chord spelling plus relevant context. Edges are only
revalidated continuation/transformation laws. A bounded A*, dynamic program, or
multi-objective beam search returns deliberately contrasting direct, functional,
chromatic, modal, and voice-leading routes. Results are Pareto-ranked across
target fit, evidence, voice motion, bass behavior, repetition, complexity, and
color; every edge has a derivation ledger.

Hard semantic limits cover slots, branching, explored states, deterministic work
quanta, and tracked memory. Wall time is a performance budget and cancellation
surface, never a candidate-selection input. A no-route result identifies
conflicting constraints and never silently relaxes them. Preview is nonmutating;
Insert replaces/fills the selected gap as one revision-checked command.

Why it is third: it composes the same laws and costs as continuation into a much
more ambitious tool for turnarounds, gap filling, section bridges, and modulation
without adding an opaque generator.

### 4. Constraint Harmonization Workbench

Users can pin the musical facts they care about, then ask for progression
alternatives that satisfy them. Hard constraints include melody/top-note anchors,
bass notes or contour, guide tones/pitch classes, fixed events/ranges, key/mode,
allowed chord/color families, exact harmonic rhythm, instrument range, maximum
voice leap, and destination/cadence.

The solver enumerates a bounded canonical chord universe, filters each slot,
constructs legal transition edges, and runs exact dynamic programming for small
spaces or bounded beam search for larger ones. Preferences order results but do
not weaken hard constraints. Unsatisfiable requests return a small conflict set
and explicit relaxations; the engine never drops a pin.

Optional melody, bass, and guide-tone lanes align to chord slots. Users can lock
part of a result and regenerate the rest, compare Pareto alternatives, audition,
and transactionally replace only the selected range. This remains a progression
composer, not a general melody editor.

Why it is fourth: real music often begins with an outer-voice line or destination
tone, and this gives the mechanical engine genuine user intent rather than
guessing taste.

### 5. Proof-Carrying Reharmonization Branches

Turn substitutions into a reversible laboratory. Each transformation operator
has a stable versioned ID, exact match preconditions, a pure patch, explicit
preserved/changed properties, machine-checkable postconditions, and limitations.
Initial operators include secondary-dominant insertion, ii-V expansion,
tritone/backdoor substitution, modal interchange, dominant chaining,
passing/common-tone diminished insertion, turnaround expand/contract, sequence
transposition, pivot reinterpretation, and carefully labeled nonfunctional moves.

An ephemeral branch tree shows original and stacked variants, transformation
lineage, chord/timing diffs, analysis differences, bass/guide-tone effects, and
voice-leading costs. A/B audition never mutates the document. Every intermediate
branch revalidates; stale source revisions disable Apply. One chosen branch is
committed as one undoable patch.

Why it is fifth: the theory becomes a creative instrument rather than a passive
annotation, while proof-carrying operators make composability and correctness
testable.

## Selected next ten

### 6. Multi-Hypothesis Tonal Journey Map

Run a bounded k-best dynamic program over tonic/mode, tonicization, modal,
nonfunctional, and unclassified states. Show key-area spans, phrase/cadence roles,
pivot reinterpretations, modulation boundaries, alternate paths, supporting and
contradicting evidence, and user-pinned readings. Literal chord identity never
changes. This supplies longer-range context to continuation, routes, color, and
transposition without claiming one true analysis.

### 7. Guide-Tone Line Designer

Extract or propose third/seventh/suspension/alteration paths through selected
events, preserve spelled degree identity, and display common, contrary, oblique,
entering, and leaving motion. Users can pin a line, set maximum motion, audition
several noncrossing paths, then feed the chosen targets into voicing or the
Constraint Workbench. This makes the abstract voice-leading engine directly
compositional and teachable.

### 8. Contextual Color and Upper-Structure Laboratory

For a selected chord in context, enumerate compatible tension sets, chord-scale
options, altered-dominant choices, and upper-structure triads. Every option lists
its exact degrees, omitted/replaced tones, melody clashes, guide-tone retention,
required bass support, scale assumptions, and resulting symbol/voicing. Preview
can audition color sets; Apply changes the AST or voicing explicitly. No panel
calls a scale or upper structure uniquely correct.

### 9. Cadence, Phrase, and Approach Builder

Detect phrase boundaries and cadence evidence from meter, duration, repetition,
and harmonic motion. Offer law-backed completions and approaches—authentic,
minor, plagal/backdoor, deceptive, ii-V, diminished, chromatic, and modal—at an
exact target and duration. Positive and near-miss fixtures prevent every dominant
from becoming a cadence. The detector improves suggestion relevance while the
builder gives users a focused workflow.

### 10. Harmonic-Rhythm Transformation Engine

Treat duration placement as musical data. Expand, contract, anticipate, delay,
split, or consolidate a progression skeleton using exact bar-preserving
templates. Users compare the same harmony with one-per-bar, two-per-bar,
turnaround acceleration, pedal holds, or cadence-weighted rhythm. All transforms
declare whether chord identity, endpoints, total duration, and metric accents are
preserved; nothing silently overfills a measure.

### 11. Harmonic Tension/Release Curve Designer

Show separate, inspectable axes—chromatic distance from active context, altered
color density, unresolved tendency tones, guide-tone motion, common-tone loss,
register crowding, and cadence evidence—rather than one correctness score. A
user-drawn target contour can rank continuation or route options that increase,
hold, or release chosen axes. The curve is a planning preference, not a universal
measurement of musical quality.

### 12. Progression Fingerprint and Similarity Explorer

Compute layered fingerprints for exact symbols/spelling, root intervals,
functional readings, harmonic rhythm, bass contour, cadence structure, and
transformation lineage. Search the atlas for exact, transposed, functionally
similar, or surface-different relatives with visible matching layers. This turns
the preset corpus into a discovery system and supports robust deduplication
without collapsing meaningful enharmonic/context differences.

### 13. Motif and Sequence Transformation Engine

Recognize a selected harmonic cell and repeat it through spelled interval,
scale-degree, dominant-cycle, chromatic, or declared constant-structure motion.
Users choose count, direction, destination, and whether function or literal
shape is preserved. The engine emits exact timed event drafts, checks every
symbol and measure, and reports when a sequence cannot land on the target without
an explicit adjustment.

### 14. Nonfunctional/Common-Tone Transformation Atlas

Add an honest lane for harmony that a functional grammar should not force into
Roman-numeral causality: common-tone substitutions, pedal-point motion,
constant-structure planing, chromatic mediants, augmented/diminished cycles, and
bounded Neo-Riemannian P/L/R moves for supported triads. Each relation states
only its mechanical pitch/common-tone property and contextual caveats. These
edges also broaden Route Planner results beyond chains of dominants.

### 15. Chart-to-Practice Laboratory

Generate deterministic exercises from the current chart or atlas: hide selected
symbols, identify guide tones, choose among law-valid next chords, compare two
reharmonizations, complete a cadence under constraints, or reconstruct a
function/voicing path. Each exercise has a finite answer set or rubric derived
from the same engine, optional hints, replayable seed, and an explanation after
submission. It compounds the value of every analysis and corpus feature for
students and teachers.

## Consolidation and overlap decisions

Several highly scored candidates are not lost; they become modes or presentation
layers of the selected system:

- Melody-anchor and bass-line harmonizers are modes of the Constraint Workbench.
- Dedicated modulation/pivot planning is a Route Planner mode informed by the
  Tonal Journey Map.
- Counterfactual Compare is the presentation layer for Reharmonization Branches.
- Smooth, Functional, Colorful, and Exploratory taste profiles belong to the
  Continuation/Route ranking policy.
- Seeded Surprise Me samples deterministically from validated continuation or
  atlas results and always exposes its seed and derivation.
- “Why this?” and “Why not?” evidence is mandatory across every engine rather
  than isolated in a diagnostic page.
- Voicing-aware substitutions are a cost/policy dimension shared by
  Continuation, Routes, and Branches.
- Reduction layers—skeleton, function, guide tones, colors, realized
  voicing—are shared views in the inspector and Tonal Journey Map.
- The harmonic query language is initially a bounded facet/filter grammar for
  the atlas, not unrestricted natural-language interpretation.

The existing rebuild plan already contains smaller suggestion, contextual
analysis, and lesson concepts. These winners replace/expand those clauses rather
than creating duplicate systems. The initial tracker snapshot was empty, so
there was no pre-existing issue conflict.

## Development-time AI quarantine and corpus protocol

Development-time AI may accelerate breadth, but it cannot certify theory. The
pipeline is:

1. Candidate records enter an unshipped quarantine directory with generator
   metadata, prompt/version, declared source or `synthetic-unverified` status,
   and intended rule IDs.
2. A total decoder rejects unknown fields, excessive size, invalid symbols,
   timings, IDs, or prose.
3. Mechanical gates parse/format every chord, validate measures, revalidate
   claimed laws, transpose through every declared key, inverse-transpose,
   realize bounded voicings, compile playback/MIDI plans, and fingerprint/dedupe.
4. A candidate cannot cite itself or production output as independent theory
   evidence. Authority/review tier comes from the theory ledger.
5. Judgment-bearing examples require explicit human review; purely
   definition-derived transpositions can inherit the reviewed seed plus compiler
   version.
6. The compiled atlas is deterministic, checked in, golden-tested, license/
   provenance inventoried, and usable with network access denied.
7. Runtime code reads only compiled validated records. It contains no prompt,
   model client, network endpoint, or “AI-generated means correct” branch.

This boundary permits hundreds of rich authored seeds and thousands of safe
mechanical variants while preserving the product's offline, explainable,
reproducible character.

## Shared acceptance laws for all fifteen

- Same validated input, engine/rule/corpus version, policy, and seed produces
  byte-identical results and ordering.
- Every result carries source revision, exact inputs, rule/corpus IDs,
  assumptions, evidence, counterevidence, costs, and limitations.
- Every candidate is revalidated immediately before Apply; stale or missing IDs
  cannot mutate the document.
- Hard constraints are never silently relaxed. No-result/degraded results name
  the binding limit or a small conflicting set.
- Search spaces have explicit candidate, depth, state, deterministic-work, and
  memory caps; exceeding one is a typed visible outcome. Interactive time is a
  performance gate, never a semantic cutoff.
- Transposition metamorphic tests cover all supported roots/keys and preserve
  spelling semantics.
- Independent goldens and mutation tests—not self-generated fixtures—prove each
  law family.
- Preview, branch, search, and practice generation are nonmutating. Apply is one
  revision-checked undoable command with exact timing.
- Results are plural options/readings. Nothing is labeled the best, correct,
  authentic, or in the style of a named musician.
- All corpora, indexes, rules, and explanations ship inside the offline artifact
  and make zero network requests.

## Phase 4-6 tracker result

`br list --json` returned an empty backlog during Phase 4. The top fifteen
therefore introduced no duplicate tracker issues. Phase 5 integrated them into
the same dependency graph as the foundational rebuild rather than creating a
detached ideas backlog.

Phase 6 completed five refinement passes:

1. all 45 reviewed plan packages are present exactly once;
2. all 110 package dependencies match the reviewed acyclic DAG;
3. each package is a self-contained epic with specification, implementation,
   and independent-verification child tasks;
4. every verification task requires named tests, real adapters where
   applicable, detailed machine-readable evidence, and clean-invocation proof;
5. all 23 confirmed legacy regressions and HD-01 through HD-15 have explicit
   owning-package trace comments.

The resulting graph has 185 issues, 180 parent-child edges, 310 blocking edges,
and zero cycles. `br ready --json` exposes only the first foundation
specification task, so implementation begins without bypassing prerequisites.
