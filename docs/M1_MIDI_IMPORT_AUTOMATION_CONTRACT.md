# M1 — Automated MIDI Import Contract (proposed)

Status: **proposed** (spec phase of bead `jcpe-ionn`, epic `jcpe-765f`).
This is an **additive amendment** layered over the frozen M0 import contract
(`src/export/midi-import-contract.ts`). Nothing in M0 is removed or altered:
the strict total decoder, the salvage vocabulary, the refusal codes, the
24-template reverse-T1 table, and the per-sonority forensic evidence all
remain. M1 adds the laws that turn a decoded file into a *playable, honest,
one-gesture* import: track roles, harmonic-rhythm segmentation, key-aware
resolution, settings transfer, groove selection, the automation envelope, and
the ImportTrace diagnostics schema.

The frozen machine-readable surface for this document is
`src/export/midi-import-automation-contract.ts`. The independent fixture
families live under `tests/fixtures/midi-import-automation/` and are validated
by `bun run validate:m1-contract` (`scripts/validate-m1-contract.ts`).
Production code (bead `jcpe-upbz`) must not land before this packet is
accepted; fixtures are independently authored and are never regenerated from
production output.

Scope decisions inherited from arbitration:

- Groove scope is **selection-only** among the six reviewed ids
  (`jcpe-61zo`, lane A). Lanes B (document-carried literal performance) and
  C (vocabulary growth) are documented extension points, not part of M1.
- Custom (unnameable) sonorities still write no chord (the T0 custom-syntax
  gap is `jcpe-1zfb`); M1 requires them to be *visibly accounted*, never
  silently absorbed.

---

## 1. Vocabulary

- **Role** — one of `percussion | bass | harmony | melody | silent`, assigned
  per decoded track by §2. Roles gate which notes may form chords.
- **Eligible note** — a paired note whose track role and channel admit it to
  chord-mass computation (§3.1).
- **Span** — a contiguous exact-tick interval inside one measure produced by
  the segmentation law (§3). Each span emits at most one chord.
- **Chord mass** — the exact integer tick-weight a note contributes to a
  span's pitch-class histogram (§3.1).
- **Feel features** — the exact-rational quantities extracted for groove
  selection (§6.1).
- **Starter destination** — a destination document in which every measure of
  every section is empty (`completion.kind === "empty"`). Only a starter
  destination may receive meter/key/title/tempo transfer (§5).
- **ImportTrace** — the frozen per-stage diagnostics record (§8).

All arithmetic in this contract is exact: integer tick sums and rational
comparisons via cross-multiplication. No floating point enters any law.

## 2. Track-role classification (law M1-ROLE)

Inputs per track: its paired notes (`SmfPairedNote[]`), `name`,
`instrumentName`, and channels used.

Definitions (exact integers):

- `attacks` — number of paired notes.
- `chordAttacks` — number of notes that share an identical `onTick` with at
  least one other note *of the same track*.
- `sumKeys` — sum of MIDI key numbers; `maxKey` — maximum key.
- A **name token match** tests each frozen token list against the
  lower-cased `name` and `instrumentName` by whole-token containment
  (tokens split on spaces, hyphens, underscores, digits).

Classification is evaluated in this frozen order; the first rule that fires
assigns the role. Every token rule precedes every statistical rule, so a
name always beats a measurement:

1. `silent-when-empty` — `attacks === 0`.
2. `percussion-by-channel-or-token` — every note is on channel 9, **or** a
   `M1_PERCUSSION_NAME_TOKENS` match.
3. `bass-by-token` — a `M1_BASS_NAME_TOKENS` match.
4. `melody-by-token` — a `M1_MELODY_NAME_TOKENS` match.
5. `bass-by-register` — `maxKey ≤ M1_BASS_MAX_KEY` and
   `4·chordAttacks ≤ attacks`.
6. `melody-by-line` — `4·chordAttacks ≤ attacks` and
   `2·sumKeys ≥ 2·M1_MELODY_MIN_MEAN_KEY·attacks`.
7. `harmony-otherwise` — otherwise.

A track named "Bass" whose part wanders high is still `bass`; a track named
"Lead 2" living in the bass register is still `melody`. Channel-9 notes are excluded from chord mass
even inside a non-percussion track (mixed-channel tracks exist in the wild).

Frozen constants: `M1_BASS_MAX_KEY = 55`, `M1_MELODY_MIN_MEAN_KEY = 64`,
and the three token lists in the contract module.

Proof obligations: positive fixtures per role; near-miss fixtures at each
threshold boundary (`maxKey = 56`, mean key one below the melody bound,
`4·chordAttacks = attacks + 1`); adversarial names ("Bassoon" must NOT token-
match "bass" — whole-token law); a mixed-channel track; transposition
fixtures proving register thresholds are the only pitch-sensitive parts.

## 3. Harmonic-rhythm segmentation (law M1-SEG)

M0's attack-window sonorities remain computed and reported (forensics,
Advanced mode). The *automatic chart* is built instead from spans:

### 3.1 Chord mass and eligibility

For a span `[a, b)` (exact ticks) a note with interval `[onTick, offTick)`
contributes `overlap = max(0, min(b, offTick) − max(a, onTick))` ticks.

- `percussion`/`silent` roles and any channel-9 note contribute **0**.
- `bass` and `harmony` notes contribute `2·overlap` (doubled so that…)
- `melody` notes contribute `1·overlap` (…melody carries half weight in
  integer arithmetic).
- A note whose overlap is less than `M1_MIN_SOUNDING_TICKS(ppq) = ppq / 8`
  (integer division) contributes 0 to that span — grace notes and bleed-over
  never smear a chord. Exception: a note *attacked exactly at `a`* always
  contributes.

The span's histogram is the per-pitch-class sum of contributions. A pitch
class is **present** in a span when `8·mass(pc) ≥ maxMass` where `maxMass`
is the span's largest class mass (i.e. at least 1/8 of the strongest class).
A span with `maxMass = 0` is **silent** and writes nothing (the previous
chord sustains, exactly like M0's unwritten sonorities — and it is counted
in the result card).

### 3.2 Split law

Every measure (per the file's own meter map, M0 measure math) starts as one
span. Recursively, a non-silent span splits at its exact midpoint when both:

1. its depth is below `M1_MAX_SEGMENT_DEPTH = 2` (bar → half → quarter-bar);
2. the symmetric difference between the halves' present-class sets has
   cardinality `≥ M1_SEGMENT_SPLIT_MIN_DIFFERENCE = 2`, where a silent
   half contributes the empty set.

A silent half therefore splits away from sounding material (two chords in
the first half of a bar followed by silence must not merge into one
unnameable cluster), while a chord sustained across the whole bar never
splits because both halves present the same set.

Midpoints are exact: a span of odd tick length puts the extra tick in the
left half. The recursion visits left before right; emitted spans are in
ascending tick order. This is the readability law: a bar holding one chord
emits `| Cmaj7 |`, a bar with a genuine change emits `| Dm7 G7 |`, and
sixteen surface attacks never emit sixteen chords.

### 3.3 Bass and resolution input

Per span: the bass pitch class is the lowest eligible `bass`-role note with
nonzero contribution; if none, the lowest eligible contributing note. The
span's present-class set plus that bass feed the **unchanged M0
`resolveSonority` law**, then §4 re-ranks the alternatives.

### 3.4 Grid discrepancy resolution (closes `jcpe-rnm6`)

M0 declared `MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT = 4` but implemented
beat-resolution quantization (divisor `ppq`, `midi-import.ts:496`). M1 rules:
the shipped *behavior* is the law for M0 sonorities (the byte-pinned fixtures
stay authoritative), and the M0 constant is re-documented as the *display*
grid. M1 spans never use the 40 ms window; their boundaries are the exact
bar/half/quarter-bar ticks of §3.2, so the discrepancy cannot recur here.

### 3.5 Pickup law

Notes before the first full bar (possible when the first meter entry starts
at tick 0 but the first attack precedes beat 1 by less than a bar — or when
`meterMap` starts past tick 0) form a pickup span; the emitted fragment
carries explicit beat durations for that measure so the A0 pickup completion
law applies. Nothing before bar 1 is dropped.

Proof obligations: sustained-pad fixture (one chord per bar, no splits);
two-chords-per-bar fixture; arpeggiated fixture where attack windows would
fragment but spans cohere; passing-tone fixture where melody half-weight and
the 1/8-presence law exclude non-chord tones; grace-note fixture; silent-span
fixture; odd-length split fixture; pickup fixture; meter-change fixture;
depth-cap fixture (a genuinely churning bar stops at quarter-bar spans).

## 4. Key inference and contextual resolution (law M1-KEY)

### 4.1 Key inference

Over the whole eligible stream (all spans' histograms summed), score the 24
candidate keys (12 major, 12 minor) with the frozen integer profiles
`M1_MAJOR_KEY_PROFILE` / `M1_MINOR_KEY_PROFILE` (contract module):
`score(key) = Σ_pc totalMass(pc) · profile[(pc − tonic) mod 12]`.
Highest score wins; ties break **major before minor**, then ascending tonic
pitch class. The result is a `KeyContext` (tonic spelled per
`M1_KEY_TONIC_SPELLINGS`, the flat-preferring table extended with the
sharp-side exceptions listed in the module).

Transposition equivariance is a law: shifting every input key by `k`
semitones yields the transposed winner and identical tie-break behavior.

### 4.2 Alternative re-ranking

For each span, M0's `resolveSonority` alternatives are re-ranked by the
frozen comparator (first difference wins):

1. **diatonic-root-first** — roots inside the inferred key's pitch-class set
   (major scale / dorian-tolerant minor set, frozen in the module) beat
   chromatic roots;
2. **bass-is-root-first** — `inversion === "root"` beats `slash`;
3. **M0 order** — the original M0 ranking settles everything else (so M1
   never *loses* M0's evidence, it only refines the winner).

The chosen alternative's symbol is spelled under the inferred key: diatonic
pitch classes walk letters from the tonic spelling through the natural mode's
degree set (F♯ major spells pc 5 as E♯, never F). In minor, the raised sixth
and raised seventh share their natural degree's letter (F♯ and G♯ in A minor,
never G♭ or A♭). Chromatic pitch classes fall back to the frozen M0 canonical
flat table, as does any spelling that would need a triple accidental. When
key inference is impossible (zero eligible mass), M0 spelling and ranking
apply unchanged.

Proof obligations: all-24-keys fixture matrix; equivariance sweep; re-rank
fixtures where diatonic beats chromatic and where bass-root beats slash;
near-miss where two keys tie and the tie-break decides; a rootless voicing
keeping its M0 outcome; spelling fixtures (F# major chart spells E#, not F).

## 5. Settings transfer (law M1-XFER)

Applied at commit, per this frozen truth table:

| Setting | Starter destination | Occupied destination |
|---|---|---|
| tempo (file's first tempo entry, rounded per `makeTempoBpm`) | applied | **not** applied, stated |
| meter (file's first meter entry) | applied | not applied, stated; explicit-duration fragments still refuse per A0 law and the card must predict that refusal *before* Add |
| key (inferred, §4.1) | applied | not applied, stated |
| title (first non-empty track name of track 0, else file stem) | applied | not applied |
| groove (§6) | applied | applied **only if** the document's stored groove is the canonical-absent default; an explicit user groove is never overridden, stated |

Mid-file tempo or meter changes beyond the first are never applied and never
silently ignored: their count and positions land in the result card and the
ImportTrace. Section names come from marker text when the file carries
markers (law M1-FORM below), else the file stem (M0 law retained).

**Form (M1-FORM):** marker entries split the import into named sections at
the marker's measure boundary (a marker mid-measure names the section
starting at that measure; empty/duplicate marker text gets the frozen
disambiguation suffix law). Files without markers import as one section.

Proof obligations: the full 2×5 truth-table fixture matrix; the
meter-mismatch prediction fixture (card must say "will refuse" exactly when
A0 would refuse); marker fixtures (mid-measure, duplicate names, empty text).

## 6. Groove selection (law M1-GROOVE)

### 6.1 Feel features (exact rationals)

Over eligible non-melody attacks (bass + harmony), within each beat of the
file's own meter/tempo maps:

- `tempoBpm` — from the tempo in effect at tick 0, `round(6·10⁷ / µspq)`.
- `swungShare` — attacks landing in the swung-eighth window
  `[2·ppq/3 − ppq/12, 2·ppq/3 + ppq/12]` versus the straight-eighth window
  `[ppq/2 − ppq/12, ppq/2 + ppq/12]`; the single shared boundary point
  (`ppq/2 + ppq/12 = 2·ppq/3 − ppq/12`) belongs to the swung window;
  share = swung/(swung+straight); `0/0` is defined as `0`.
- `sixteenthShare` — attacks whose nearest sixteenth cell (nearest-cell law,
  cell width `ppq/4`, half-cell ties up) is odd **and** which lie in neither
  eighth-feel window, over all attacks. The exclusion keeps swung eighths
  from double-counting as sixteenth activity.
- `attacksPerBar` — chordal attacks (harmony-role attack instants, counting
  simultaneous notes once) divided by `max(1, barCount)`, keeping the
  rational total even for a degenerate empty stream.
- `melodyCoincidence` — share of melody attacks that coincide (same tick)
  with a harmony attack.
- `bassTwoFeel` — share of bars whose bass-role attacks fall only on beats
  1 and 3 (in 4/4 segments).

### 6.2 Decision table

First row whose conditions all hold (rational comparisons) wins:

| # | Conditions | Groove |
|---|---|---|
| 1 | `swungShare ≥ 1/2` and `tempoBpm < 96` | `ballad-comp@1` |
| 2 | `swungShare ≥ 1/2` | `medium-swing@1` |
| 3 | `sixteenthShare ≥ 1/4` | `syncopated-sixteenths@1` |
| 4 | `bassTwoFeel ≥ 1/2` and `88 ≤ tempoBpm ≤ 132` | `bossa-nova@1` |
| 5 | `melodyCoincidence ≥ 3/4` and `attacksPerBar ≥ 2` | `block-chords@1` |
| 6 | `attacksPerBar ≤ 3/2` and `tempoBpm ≤ 92` | `ballad-comp@1` |
| 7 | `swungShare < 1/8` and `attacksPerBar ≥ 9/2` and `tempoBpm ≥ 96` | `syncopated-sixteenths@1` |
| 8 | `attacksPerBar ≥ 3` | `straight-eighths@1` |
| 9 | (default) | `medium-swing@1` |

Row 7 is amendment #1 (jcpe-gdyt, 2026-08-05): a dense unswung band
arrangement at pop tempo is the sixteenth idiom's measured signature —
including the double-time notation that writes its sixteenths as straight
eighths, which row 3's `sixteenthShare` can never see. Both owner-graded
reference recordings carry this signature (attacksPerBar 5.4 and 7.8,
swungShare 0.06 and 0.002 at 105/120 BPM) and both render measurably closer
to their source under `syncopated-sixteenths@1` than under the pop sketch
the original table sent them to (rhythm-profile distances 0.046 vs 0.474
and 0.087 vs 0.515, ledger `test-results/m1-local/m1-local-evidence.json`).

The chosen id, the row number, and every feature value are recorded in the
trace, and the result card must state the choice with its evidence sentence
(frozen template per row, e.g. row 2: *"Medium swing: swung eighths in
{swungShare} of beats at {tempoBpm} BPM."*). The choice is always
user-overridable in Advanced; the override is recorded as such.

Proof obligations: one positive fixture per row (9), near-miss fixtures at
every threshold, a 0/0 swing fixture, determinism double-run, and a
row-order fixture proving an input satisfying rows 3 and 4 lands on 3.

## 7. Automation envelope (law M1-ENV)

The commit gesture issues commands in a frozen, destination-dependent
order (amendment #1, jcpe-9m5q, 2026-08-05): a STARTER destination issues
`[settings (tempo/meter/key/title per §5), insert (one plan or chunked),
groove]`, and an OCCUPIED destination issues `[insert, groove]` with every
setting withheld-with-statement per §5. Settings must precede the insert on
a starter because the A0 exact-duration law locks the meter the moment any
chord exists: the original `[insert, settings, groove]` order made the §5
promise "starter: meter applied" unsatisfiable for any file whose meter
differs from the blank document's 4/4 — the meter step refused
`u1.meter_locked_by_content` and the whole gesture rolled back, a dead end
this contract forbids. Settings-first also means the inserted fragment
parses under the file's own meter, which is what its bars measure. The
envelope skips inapplicable entries, and
**must state the exact undo count** in the post-commit status line ("Added as
N edits; Undo N times returns the chart."). If a composite/labelled command
lands via `jcpe-h2v6`, the envelope collapses to one undo step and the law's
stated count becomes 1 — the *stated-count* obligation, not the number
itself, is the frozen law.

**Long imports:** when the emitted fragment exceeds 4 096 code points, it is
split at measure boundaries into the fewest chunks each ≤ 4 096 code points,
bounded by `M1_MAX_IMPORT_CHUNKS = 16`; chunks insert in order under the
same envelope and the count law covers them. A fragment needing more than
16 chunks refuses with the new code `import.automation_chart_too_large`
(this bound exceeds the document's own 8 192-event cap in practice, so the
code is a formal totality guarantee, and the card states the measured size).
The `replace-document` lane (origin `canonical-import`) is *documented* as a
starter-destination alternative but is **not** part of M1's automatic path.

Failure atomicity: if any command in the envelope refuses, previously issued
envelope commands are undone by the service before it reports, so a failed
import never leaves a half-landed gesture. The report carries the refusing
command, its refusal, and the rollback proof (history length before/after).

## 8. ImportTrace (law M1-TRACE)

Every preview carries a frozen machine-readable trace:
`schema "changes.import.automation-trace.v1"`, one record per stage in
`M1_TRACE_STAGES = [decode, salvage, classify, segment, infer-key, resolve,
groove, plan, envelope]`, each record holding: stage name, an exact input
digest (FNV-1a 64 over the stage's canonical JSON input, hex), deterministic
work counters, every decision with its reason string, and refusals if any.
The salvage stage record is present **whenever salvage ran — including when
the repaired bytes still refused** (closes `jcpe-a5uq`'s information loss at
the contract level). Unit and e2e suites assert on trace contents and dump
the full trace on failure; the trace is UI-surfaced in Advanced.

## 9. Determinism and bounds (law M1-DET)

Identical bytes yield identical previews, traces, plans, and envelopes.
Every stage declares integer work bounds: classification `O(notes)`,
segmentation ≤ `measures · (2^(depth+1) − 1)` span evaluations with depth ≤ 2,
key scoring exactly `24 · 12` multiplications, groove features `O(attacks)`.
Wall time is never a musical cutoff. A single-byte mutation over any M1
golden either changes the decode refusal (M0 law) or yields another total,
deterministic outcome — never a throw.

## 10. Non-goals of M1 (recorded so they are not "lost", they are deferred)

- Groove *creation* (lanes B/C of `jcpe-61zo`).
- Writing custom chords for unnameable spans (blocked on `jcpe-1zfb`).
- MusicXML or audio import; per-note voicing capture (Manual/Frozen import).
- Applying mid-file tempo/meter changes as document structure.

## 11. Fixture families and validator

`tests/fixtures/midi-import-automation/`:

- `m1-contract.json` — packet manifest: schema ids, constants echo, law ids,
  family inventory with SHA-256 digests.
- `classification-cases.json` — M1-ROLE positive/near-miss/adversarial.
- `segmentation-cases.json` — M1-SEG spans, splits, silence, pickup, depth.
- `key-cases.json` — M1-KEY winners, ties, equivariance pairs, spellings.
- `rerank-cases.json` — M1-KEY §4.2 orderings over M0 alternative lists.
- `groove-cases.json` — M1-GROOVE per-row positives, near-misses, order.
- `transfer-cases.json` — M1-XFER truth table + prediction + markers.
- `envelope-cases.json` — M1-ENV order, chunking, stated counts, rollback.
- `override-cases.json` — M1-OVR exclusion span sets, alternative-choice
  selection and stale-drop, groove-override short-circuit (amendment #2).
- `trace-golden.json` — one full ImportTrace golden for a small band case.
- `mutation-controls.json` — named single-field mutations that each named
  law must reject (validator applies them and requires the stated failure).

`scripts/validate-m1-contract.ts` re-derives every case with reference
implementations written *in the validator itself* from the laws above (never
importing production pipeline code), checks the packet digests, and fails on
any drift, missing family, or surviving mutation. It registers as
`bun run validate:m1-contract` and joins `scripts/verify.ts` after the M0
rows.

## 12. Advanced overrides (law M1-OVR, amendment #2, jcpe-qyyn, 2026-08-06)

The Advanced disclosure may override three — and exactly three — automatic
decisions. Every override re-runs the pipeline **on the retained decoded
model** (never on re-read bytes, never on the emitted chart text), and the
re-planned preview replaces the pending one atomically: the result card,
the chart text, the chunk plan, and the trace all restate the overridden
world. Overrides never touch the document; the commit envelope (§7) lands
whatever the pending plan says, exactly as before. The quantization-grid
and destination/section-name overrides remain deferred (recorded here so
they are not lost).

The frozen override set:

```
M1ImportOverrides = {
  excludedTrackIndices: readonly number[],   // sorted, unique, in range
  alternativeChoices: readonly {
    span: { measureIndex: number, startTick: number },
    alternativeOrdinal: number,              // 0 = the automatic choice
  }[],                                       // ≤ M1_MAX_ALTERNATIVE_CHOICES
  grooveStyleId: GrooveStyleId | null,       // null = the automatic match
}
```

**Track exclusion.** An excluded track keeps its §2 classification — the
display states what the file contains — but participates in nothing
downstream: for segmentation, key mass, resolution, and groove features it
is treated exactly as role `silent`. Excluding every contributing track
yields the ordinary `import.automation_nothing_to_write` refusal, never a
special case. An out-of-range index is dropped, with a trace decision. The
classify trace record carries one `excluded` decision per applied index
(`reason: "user override"`).

**Alternative choice.** A choice names a span by its exact
`(measureIndex, startTick)` identity in the RE-PLANNED span set and an
ordinal into that span's §4.2-ranked alternative list; ordinal 0 is the
automatic choice, and the chosen alternative's symbol replaces the span's
`symbolText` everywhere downstream (chart text, sonority list, card
counts). A choice whose span no longer exists after re-planning — track
exclusion can redraw the span set — or whose ordinal exceeds the ranked
list is **dropped, never clamped or repaired**, with a trace decision
naming the dropped key (`outcome: "dropped-stale"`). Applied choices are
recorded on the resolve trace record (`outcome: "alternative-<ordinal>"`).

**Groove override.** A non-null `grooveStyleId` must be one of the six
reviewed ids and replaces the matched groove in the plan: `row` becomes
`M1_GROOVE_OVERRIDE_ROW = 0`, the evidence sentence becomes the frozen
`M1_GROOVE_OVERRIDE_EVIDENCE = "You chose this groove yourself."`, and the
choice wins everywhere the match would have applied — the card, the §5
transfer, the §7 envelope. Features are still extracted and recorded in
the trace (the measurement is a fact about the file; the override is a
fact about the user).

**Determinism (extends M1-DET).** Identical `(decoded model, overrides)`
yield identical plans and traces. Override application adds no unbounded
work: exclusion is `O(tracks)`, choice application `O(choices · spans)`
with `M1_MAX_ALTERNATIVE_CHOICES = 512`, groove override `O(1)`.

Proof obligations (`override-cases.json`): exclusion cases pinning the
surviving span-key sets (including the all-silent refusal and the
out-of-range drop); alternative cases pinning applied ordinals, the
stale-key drop, and the over-range drop; groove cases pinning the
short-circuit over every decision row it can shadow; a determinism
double-run; and mutation controls for each law.
