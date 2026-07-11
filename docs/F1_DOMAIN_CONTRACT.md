# F1 Domain Contract Handoff

Status: reviewed specification for `F1/spec`. This document freezes decisions
needed by the production and independent-verification leaves. It does not
authorize a decoder, theory rule, document publication cast, or UI behavior.

## Scope and ownership

F1 owns immutable value/document shapes, nominal identities, exact musical
time, limits, stable diagnostic codes, and synchronous operation contracts.

- `domain` imports no project layer, browser adapter, Preact, storage, audio, or
  theory code.
- F1 constructors may establish one local value invariant. They do not publish
  a semantically validated document.
- F2 owns total `unknown` decoding, strict unknown-field rejection, structural
  limits, duplicate-ID reporting, and transactional candidate construction.
- F3 owns chord `sourceText`/AST agreement, degree-category/formula rules,
  custom pitch/voicing correspondence, measure semantics, and playback
  realizability.
- `ValidatedDocument` is a declaration-only opaque brand. Domain exports no
  constructor, assertion, or cast. Only
  `application/document-validation.ts` may cast after the combined F2+F3 gate.

The v2 document currently stores no cross-node ID reference. F1 remaps every
node identity during copy/lesson instantiation; later reference-bearing fields
must extend the remap contract before they ship.

## Identity contract

Document, section, measure, and event IDs have distinct TypeScript brands but
share one global wire-uniqueness namespace.

- Wire grammar: `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`.
- IDs are case-sensitive and never trimmed or normalized.
- Production prefers `crypto.randomUUID()` and may use
  `crypto.getRandomValues()` for an RFC-4122-style value. It must refuse when
  cryptographic entropy is unavailable; `Math.random()` is forbidden.
- An injected factory supplies one candidate per requested node. A collision
  with an original ID or any earlier allocation fails the whole copy. The copy
  command does not silently retry an injected collision.
- Allocation order is structural preorder: copied document, then each section,
  each section's measures, and each measure's events in array order.
- Copy preallocates and validates the entire remap before constructing or
  publishing the result. Failure leaves source and destination state unchanged.
- Requested and previously allocated collision locations use paths relative to
  the copied root; occupied locations use paths relative to the containing
  destination document. The typed `pathRoot` field makes those scopes explicit.
- Reorder preserves IDs. Copy and lesson instantiation replace the copied root
  and every descendant ID exactly once.
- Duplicate-ID diagnostics report both paths, ordered by document traversal
  path and then stable issue code.

## Spelling and pitch projection

Spelling is identity. Pitch class, MIDI, and frequency are projections.

- Steps are ordered `C D E F G A B` only where a comparator is explicitly
  requested. Source arrays otherwise preserve their stored order.
- Alteration is exactly `-2..2`; triple accidentals are refused.
- A written octave is a finite safe integer. A `SpelledPitch` may exist outside
  the MIDI range; MIDI projection returns a typed refusal.
- Pitch-class projection uses Euclidean modulo 12.
- Scientific pitch notation fixes `C4 = MIDI 60`, `A4 = MIDI 69`, and
  `frequency = 440 * 2^((midi - 69) / 12)`.
- `B#3` and `C4` are unequal spelled pitches but both project to MIDI 60.
  `Cb4` projects to 59. `C-1` and `G9` are the inclusive MIDI boundaries;
  `Cb-1` and `G#9` refuse.
- Enharmonic pitches at the same MIDI value have the same frequency without
  losing their written identity.
- Degree identity retains diatonic number and alteration. `#9` is not `b3`.

## Exact musical time

One stored beat is one quarter note. Canonical `BeatValue` values are reduced,
nonnegative, constructor-only rationals.

- PPQ is 960.
- A normalized denominator must be one of:
  `1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 32, 40, 48, 60, 64, 80,
  96, 120, 160, 192, 240, 320, 480, 960`.
- Normalization and arithmetic use `BigInt` intermediates. A safe raw input may
  reduce into the canonical range: `7/7` becomes `1/1`, and
  `4294967294/2` becomes `2147483647/1`.
- The normalized numerator may not exceed `2,147,483,647`.
- Position permits zero; duration is strictly positive; subtraction refuses
  underflow; a range requires `0 <= start < end`.
- Generic value arithmetic enforces the canonical numerator/denominator bounds.
  The separate document-timeline fold enforces at most `1,000,000`
  quarter-note beats.
- `midiTicks = beats * 960` is exact. `1/960` is one tick.
- `measureCapacity = beatsPerBar * 4 / beatUnit` is exact. Meter numerator is
  `1..32`; beat unit is `2`, `4`, or `8`.
- Tempo is a finite integer `20..400` quarter notes per minute.
- Floating point appears only at frequency and seconds boundaries.

## Chords and voicings

Chord/degree arrays are readonly. Chronological, manual-pitch, custom-pitch,
and source arrays preserve input order. A specific canonical degree comparator
orders by degree number and then alteration; exact duplicate degrees are
invalid within each individual degree array. Cross-category duplication or
conflict between extensions, additions, alterations, and omissions is a formula
decision owned by F3; F1 never moves a degree between categories. Formula/category
and source-text agreement remain F3 concerns.

`CustomChordSpec` is an explicit literal sonority, not a parser error bucket.
It requires a nonblank label and at least one written pitch class. Its event may
use only Manual or Frozen voicing.

### Automatic matrix

- `rootless-a` and `rootless-b` require `external` bass in every chord context.
- A slash chord permits `generated` or `external`, never `none`.
- A non-rootless, non-slash chord structurally permits `generated`, `external`,
  or `none`.
- Range endpoints are inclusive MIDI `0..127`, with `low <= high`.
- Voice count is the application-generated count `3..7`; an external bass is
  excluded from it.

### Stored-pitch matrix

Manual and Frozen voicings are nonempty, hold at most 16 pitches, and add an
explicit `bassPolicy: 'included' | 'external'` to close a gap in the original
plan.

- Order, spelling, octave, and duplicate/unison entries round-trip exactly.
- No constructor or later engine may sort, deduplicate, respell, optimize, or
  silently repair stored pitches.
- With a slash chord and `included`, the lowest stored pitch must match the
  slash-bass spelling. With `external`, the delegated bass is not in the stored
  or sounded voicing: exclusion compares sounding pitch class, so an enharmonic
  spelling of the delegated bass is also refused.
- A non-slash chord cannot use `external` in a Manual/Frozen voicing.
- Freeze copies the exact realized pitches and stable engine version/family.
- Returning from Frozen to Auto requires a complete new Auto configuration;
  missing range/count/bass settings are never reconstructed by guesswork.
- Full Custom pitch-class/voicing correspondence is checked at F3. F1 only
  makes Custom+Auto and empty stored pitch lists impossible/refusable.

## Measure and document states

Chronology is sections, measures, and events in array order, never ID order.

- A blank document (`sections: []`) is valid.
- A named section with `measures: []` is valid.
- `empty` requires zero events.
- `complete` requires event-duration sum equal to meter capacity.
- `pickup` and `incomplete` require event sum equal to their declared
  `expectedDuration`, `0 < expectedDuration < capacity`, and a nonblank reason.
- Every overfilled state is invalid.
- Pickup position and a complementary final bar are not F1 restrictions.
- A later editing command changes events and completion declaration in one
  explicit atomic transaction; completion is never silently toggled.
- Key may be absent. Analysis never silently persists an inferred key.

F1 defines these states and exact capacity arithmetic; F3 owns the semantic
completion fold. That fold reports every independently true issue, sorted by
the diagnostic comparator below, rather than hiding additional faults behind a
local first-refusal rule.

## Persisted limits

Text length counts Unicode scalar values/code points, not UTF-16 code units or
grapheme clusters. Lone surrogates are invalid. Required nonblank strings are
tested after Unicode whitespace trimming; values are otherwise preserved.

| Field | Limit / rule |
|---|---:|
| Import bytes (F2) | 2,097,152 UTF-8 bytes |
| JSON nesting depth (F2) | 32 |
| ID | 1-128 ASCII grammar characters |
| Chord source text | 1-256 code points |
| Document title | 1-256 code points |
| Section name | 1-256 code points |
| Custom label | 1-256 code points |
| Description / annotation / completion reason | 0-2,000 / 0-2,000 / 1-2,000 code points |
| Frozen engine version | 1-64 code points |
| Sections | 64 |
| Measures per section | 1,024 |
| Events per document | 8,192 |
| Custom/Manual/Frozen pitches | 16 |
| Master volume / reverb | finite `0..1` |
| Count-in bars | `0`, `1`, or `2` |

F2 rejects unknown persisted fields. Optional properties are absent rather than
present with `undefined`.

## Results, diagnostics, and ordering

Public fallible operations return discriminated results. Failure contains no
partial value. Success may contain warnings. Stable API comprises the issue
code and path; prose is explanatory and may improve.

Issue families cover identity syntax/collision/remap, pitch/degree projection,
beat normalization/arithmetic/range/timeline, meter/tempo, voicing
count/range/bass/custom compatibility, measure completion, strings and
collections, schema/instrument/playback values, and publication boundaries.

When multiple issues are available, compare path segments from left to right:
numeric segments numerically and string segments lexically; a shorter equal
prefix sorts first. Then compare issue code. Schema field declaration order,
object insertion order, and `Set` enumeration order are never diagnostic
contracts.

F1 operations are synchronous and revision-free. Cancellation and stale-result
cases are explicitly not applicable here; they belong to later application and
bounded-search contracts.

## Independent authority and forbidden shortcuts

The fixtures rooted at `tests/fixtures/domain/f1-domain-contract.json` are
hand-authored authority. They separate external SPN/MIDI/frequency facts from
project decisions such as PPQ, supported modes/instruments, bass policy, limits,
and completion semantics.

Implementers must not:

- generate expected fixture values from production code;
- copy MTDT's permissive arbitrary-MIDI pitch construction, nonempty-only ID
  validation, or panic-based rational arithmetic;
- use floating-point equality for beat time;
- conflate spelled equality with MIDI equality;
- partially publish a failed copy/remap;
- introduce a public `ValidatedDocument` constructor or domain-layer cast;
- invent theory/category rules inside F1 to make a fixture pass;
- weaken a limit, skip a matrix cell, or silently normalize user-owned data.
