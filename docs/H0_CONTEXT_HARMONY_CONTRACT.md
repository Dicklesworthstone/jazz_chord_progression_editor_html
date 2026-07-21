# H0 Context Harmony and Chord-Scale Contract

Status: reviewed pre-production specification

Package: H0

Public contract schemas: `changes.theory.harmony-analysis-contract.v1` and
`changes.theory.chord-scales-contract.v1`

Analysis table: `changes.harmony-analysis-rules@1`

Evidence-tier policy: `changes.harmony-evidence-tiers@1`

Ordering policy: `changes.harmony-analysis-order@1`

Exact-weight policy: `changes.harmony-exact-weight@1`

Chord-scale table: `changes.chord-scale-mappings@1`

Degree-containment policy: `changes.degree-class-containment@1`

This document, the public types in `src/theory/analysis-contract.ts` and
`src/theory/chord-scales-contract.ts`, and the reviewed records under
`tests/fixtures/harmony-analysis/` are the complete code-facing H0 authority.
An implementation agent must be able to build H0 from those artifacts without
consulting the product plan or the legacy HTML.

H0 is an offline, pure, deterministic description engine. It separates facts
that follow literally from a selected T1 realization, contextual readings that
require explicit evidence, and plural chord-scale options. It does not choose a
musically best interpretation, mutate a chart, infer and persist a key, or use
runtime network or model behavior. Production output may be checked against the
reviewed fixture package; it may never create, rewrite, or bless that package.

## 1. Purpose and product role

H0 owns three synchronous theory operations:

1. `deriveLiteralFacts()` reports only facts entailed by one selected T1
   realization.
2. `analyzeChordInContext()` carries those literal facts and reports zero or
   more evidence-bearing contextual readings for one selected chord snapshot.
3. `enumerateChordScaleOptions()` reports plural compatible scale and tension
   options for that same selected realization and explicit context.

The package makes jazz-theory claims inspectable. A user can see the exact
spelled evidence, missing evidence, counterevidence, rule IDs, match fraction,
and policy versions behind a reading. H0 never exposes a decimal confidence or
probability and never turns a reading or option into an edit command.

H0 must distinguish these outcomes without treating any of them as an error:

- a single supported contextual classification;
- several equally supported interpretations;
- a keyed chord whose function remains unresolved;
- a valid chord with no key;
- an explicitly modal or nonfunctional frame;
- a Custom chord for which degree analysis is unavailable.

## 2. Ownership and dependency direction

The H0 public source files are:

| File | Ownership |
|---|---|
| `src/theory/analysis-contract.ts` | snapshots, literal facts, Roman structures, classifications, evidence tiers, match fractions, contextual readings, refusals, bounds, and `deriveLiteralFacts()` / `analyzeChordInContext()` callable types |
| `src/theory/chord-scales-contract.ts` | scale families, mapping predicates, scale/tension/clash/exception records, plural option results, and `enumerateChordScaleOptions()` callable type |
| `src/theory/index.ts` | public re-exports only |

The later H0/build leaf owns production modules such as `analysis.ts`,
`chord-scales.ts`, and any private reviewed runtime rule tables. H0/spec does
not implement either algorithm.

All three operations belong to the pure `theory` layer. They may import only public
`domain` values and public T1 theory types. In particular:

- H0 consumes a selected, already-resolved T1 semantic realization. It does
  not parse a symbol, select a `7alt` realization, or repair a T1 refusal.
- H0 never imports `content`, the compiled Harmonic Atlas, UI, application,
  playback, audio, persistence, export, browser APIs, or test fixtures.
- Later content may be supplied through a read-only interface, but H0 v1 does
  not require Atlas data and cannot import an Atlas implementation.
- Production code cannot import `tests/fixtures/harmony-analysis/` as its rule
  table. The independent authority and production implementation must remain
  separate.
- H0 returns immutable data. No returned object or array may alias mutable
  request data or production scratch storage.

## 3. Explicit request snapshots

H0 never reads ambient document or application state. Each request supplies a
closed, immutable snapshot containing all semantically relevant input.

### 3.1 Request identity and revision

Every request shares:

- a request ID of 1 through 64 ASCII characters matching
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`; and
- `baseRevision`, a nonnegative safe integer no greater than
  `Number.MAX_SAFE_INTEGER`.

`deriveLiteralFacts()` then carries one exact T1 `ResolvedChord` source and its
selected realization ID. `analyzeChordInContext()` additionally carries one
required current event, at most one immediate previous and one immediate next
event, `key: KeyContext | null`, one frozen `declaredSpan`, and the requested
analysis-rule table ID/version. `enumerateChordScaleOptions()` carries that same
closed context snapshot plus the requested chord-scale mapping table ID/version.
Each embedded T1 value retains its own upstream schema/table versions. The
contract, evidence, ordering, exact-weight, and containment policy identities
are fixed public H0 constants rather than caller-selectable policy switches.

Every result repeats the request ID, base revision, selected realization ID,
and all applicable policy/table versions. Contextual results also repeat the
current event ID, key actually used, and declared span. Repeating the revision
makes later application staleness checks possible; H0 itself cannot observe a
newer revision and never applies an edit.

### 3.2 Chord snapshots

A contextual chord snapshot contains one stable domain `ChordEventId`, the
exact T1 resolved chord, and one selected semantic realization. The current
event is required. `previous` and `next` are nullable and mean immediate chart
neighbors; H0 cannot skip an intervening event or search farther away. The
literal-facts request carries the same resolved-chord/selection pair without
inventing an event ID that the operation does not need.

The maximum context is therefore exactly three events and two directed edges:

```text
previous -> current -> next
```

The snapshot preserves source spelling, root, slash bass, formula rule,
selected realization ID, degrees, required/optional/guide roles, pitch classes,
and T1 authority versions. H0 may derive evidence from those values but cannot
rewrite them. A Custom realization preserves its literal pitch-name order and
duplicates exactly.

A parsed chord with the T1 `literal` realization selects `literal`. A `7alt`
chord must select exactly one of:

```text
alt-b9-b5
alt-b9-sharp5
alt-sharp9-b5
alt-sharp9-sharp5
```

H0 never chooses among those four. A missing required selection returns
`harmony.selected_realization_required`. A selection absent from the supplied
T1 result, or one belonging to another event, returns
`harmony.selected_realization_unknown`. Both refusals have no partial output.

### 3.3 Key and declared-span snapshot

The request carries `key: KeyContext | null` and exactly one `declaredSpan`:

```text
tonal
modal
nonfunctional
unspecified
```

Only the existing domain `KeyContext` is persisted. Its modes remain exactly
`major`, `natural-minor`, `harmonic-minor`, and `melodic-minor`. Dorian,
Mixolydian, altered, diminished, and the other chord-scale families are not
added to `KeyMode`. `modal` and `nonfunctional` are explicit request-local span
descriptions, not inferred persisted keys. `unspecified` means no such
description was asserted.

The application resolves document key versus section override before H0 is
called. H0 receives only the resulting `key` value and does not inspect a
document or retain its source. `tonal` with a null key is a valid incomplete
context and produces visible missing evidence; it is not repaired. `modal` or
`nonfunctional` prevents H0 from manufacturing functional causality even if a
key value is supplied for reference. A null key is always valid.

## 4. Three disjoint semantic result classes

The public contract keeps literal facts, contextual readings, and options
structurally distinct.

### 4.1 Literal facts

A literal fact has `kind: "literal"` and follows only from the selected T1
realization. Literal facts may include source spelling, degree tokens, pitch
classes, chord quality, guide tones, alterations, additions, omissions, slash
bass, and the selected altered realization. They contain no Roman function,
evidence tier, probability, inferred key, or edit advice.

`deriveLiteralFacts()` is the sole H0 operation whose value is only this
literal projection. Every successful `analyzeChordInContext()` and
`enumerateChordScaleOptions()` value also carries the same immutable ordered
`literalFacts` projection in its common result base; context analysis and scale
mapping cannot replace or contradict it.

Literal facts are available with or without a key. Custom chords expose only
facts justified by their literal ordered pitch names and T1 limitations; H0
does not invent a root, degree roles, or chord quality for Custom.

### 4.2 Context readings

A contextual reading has `kind: "reading"`. It carries a stable reading ID,
classification, disposition contribution, evidence tier, exact match fraction,
Roman structure when applicable, governing target event ID when applicable,
satisfied evidence, counterevidence, missing evidence, rule IDs, and every
policy/table version used.

A reading is descriptive. Resolution language is phrased as a tendency, not an
obligation. It never contains a command, replacement chord, generated event,
or universal musical-quality score.

### 4.3 Chord-scale options

A chord-scale option has `kind: "option"`. It carries one scale family, exact
spelled degrees over the chord root, contained chord tones, available tensions,
minor-ninth clashes, declared exceptions, contextual notes, evidence tier,
mapping-rule IDs, and the selected realization ID.

Options are plural and never ranked by taste; their serialization order is the
frozen mechanical order in Section 12. The engine never returns
`chosenScale`, `bestScale`, a probability, or prose claiming “the scale.” If
several mappings are compatible, every nondominated compatible family remains
visible in deterministic family order.

## 5. Frozen vocabulary

### 5.1 Evidence tiers

The only evidence tiers, strongest first, are:

```text
exact
strong
plausible
speculative
```

They are ordinal policy labels, not numeric confidence values.

### 5.2 Dispositions

The only result dispositions are:

```text
classified
ambiguous
unclassified
not-applicable
```

- `classified` means one strongest supported contextual interpretation remains.
- `ambiguous` means two or more distinct readings remain tied at the strongest
  tier after every hard predicate and deterministic comparison.
- `unclassified` means literal/contextual evidence exists but no supported
  functional rule settles the chord. It may retain exact `chromatic-roman` and
  caveated `unresolved` readings rather than inventing a function; without a
  key, the Roman field remains null.
- `not-applicable` means functional analysis cannot legitimately run, as with
  a Custom degree-based operation. Its contextual reading/option collection is
  empty, while independently valid literal facts remain available.

### 5.3 Classifications

The closed serialization vocabulary is:

```text
diatonic
chromatic-roman
ordinary-dominant
secondary-dominant
secondary-leading-tone
tritone-substitute
backdoor-dominant
modal-mixture
passing-diminished
modal
nonfunctional
unresolved
```

`chromatic-roman` describes an exact chromatic Roman root without asserting a
functional rule. `modal` and `nonfunctional` preserve explicit request frames.
`unresolved` is an honest fallback, not a weakened dominant or mixture rule.

## 6. Exact chord-match fraction

Every reading exposes the same mechanical literal match model. The immutable
component weights are:

| Component | Weight |
|---|---:|
| root | 2 |
| third or structural suspension | 2 |
| seventh | 2 |
| fifth | 1 |
| each expected color | 1 |

At most 16 components may be examined for one reading. A component contributes
its full integer weight or zero; there is no partial credit. The public value is
the unreduced pair:

```text
matchedWeight / expectedWeight
```

The root is always expected, so `expectedWeight` is positive. Keeping the
unreduced denominator preserves what the rule expected. Neither the result nor
fixtures may replace this pair with a float.

Agreement is spelling-first. A root, alteration, or color that matches only by
enharmonic pitch class does not count as spelled agreement. For example `#9`
does not satisfy expected `b3`, and the seventh of `Db7` remains `Cb` even when
its pitch class is compared with `B` for tritone-substitution guide-tone
evidence. Exact pitch-class relations may be separate satisfied evidence, but
they do not rewrite the literal match fraction.

`exact` requires `matchedWeight === expectedWeight`, every hard rule predicate,
no hard counterevidence, and no required missing evidence. A complete fraction
alone cannot prove a contextual rule.

## 7. Roman structure and spelling

A Roman result is structured data. Its display label is a checked projection,
not the authority from which the structure is parsed. It contains:

- root scale degree 1 through 7;
- exact root alteration from -2 through +2;
- upper/lower case and a closed quality/seventh suffix derived from T1;
- an optional applied target degree;
- an optional governing target event ID;
- the exact active `KeyContext`;
- a canonical display string.

Root degree is selected by diatonic letter relationship to the key tonic, then
the accidental is calculated. Pitch-class minimization cannot respell `C#` as
`Db` or vice versa. Applied-target syntax is a separate field: `V/V` does not
mean slash bass, and a source slash bass never changes the chord root's Roman
degree or invents an applied target.

Diatonic roots have alteration zero. Chromatic roots retain their exact signed
alteration. A valid keyed chord may therefore receive a `chromatic-roman`
reading while remaining functionally unresolved.

### 7.1 Exact persisted-mode tables

H0 v1 uses the following ordered scale-degree and T1 quality tables. A quality
cell is `triad/seventh`; `none` means a triad with no seventh. A seventh chord
matches only the exact tuple. A triad matches the tuple's triad member with
`seventh: null`. Ninth, eleventh, and thirteenth formulas retain their T1 base
seventh quality and are compared through that base plus their exact colors.

| Key mode | Scale degrees relative to tonic |
|---|---|
| `major` | `1,2,3,4,5,6,7` |
| `natural-minor` | `1,2,b3,4,5,b6,b7` |
| `harmonic-minor` | `1,2,b3,4,5,b6,7` |
| `melodic-minor` | `1,2,b3,4,5,6,7` |

`melodic-minor` is the fixed harmonic use of the ascending collection shown
here. H0 does not substitute natural minor on a descending root motion.

| Mode | I/i | II/ii | III/iii | IV/iv | V/v | VI/vi | VII/vii |
|---|---|---|---|---|---|---|---|
| `major` | `I: major/major` | `ii: minor/minor` | `iii: minor/minor` | `IV: major/major` | `V: major/minor` | `vi: minor/minor` | `viiø: diminished/minor` |
| `natural-minor` | `i: minor/minor` | `iiø: diminished/minor` | `bIII: major/major` | `iv: minor/minor` | `v: minor/minor` | `bVI: major/major` | `bVII: major/minor` |
| `harmonic-minor` | `i: minor/major` | `iiø: diminished/minor` | `bIII+: augmented/major` | `iv: minor/minor` | `V: major/minor` | `bVI: major/major` | `vii°: diminished/diminished` |
| `melodic-minor` | `i: minor/major` | `ii: minor/minor` | `bIII+: augmented/major` | `IV: major/minor` | `V: major/minor` | `viø: diminished/minor` | `viiø: diminished/minor` |

The quality projection is exact:

```text
major/major           -> maj7
major/minor           -> dominant 7
minor/minor           -> minor 7
minor/major           -> minor-major 7
diminished/minor      -> half-diminished 7
diminished/diminished -> fully diminished 7
augmented/major       -> augmented-major 7
```

Roman case and suffix follow that tuple. H0 cannot decide quality from display
text or pitch-class sets. Suspensions, omissions, additions, and alterations
remain literal evidence and prevent an exact diatonic-quality match unless the
reviewed rule row explicitly permits them.

Parallel mixture in H0 v1 compares the exact major and natural-minor tables at
the same tonic. A harmonic-minor or melodic-minor chord can still receive its
own diatonic reading when that is the active persisted key mode, but it is not
silently added to the v1 parallel-mixture source table. A chord already present
with the same root and quality in the active table cannot be relabeled mixture
merely because it also occurs in another table.

## 8. Evidence records and tier derivation

Each reading may contain at most:

- 16 satisfied evidence records;
- 8 counterevidence records;
- 8 missing-evidence records;
- 8 stable rule IDs;
- 8 limitation records.

Evidence records use stable table-owned IDs and bounded closed statements. They
are ordered by rule-defined evidence order and then stable ID by Unicode code
unit. Caller prose, locale collation, object insertion order, and hash-map order
are never tie-breaks.

Tier derivation is frozen:

| Tier | Required derivation |
|---|---|
| `exact` | complete literal fraction; all hard predicates satisfied; exact target motion when the rule has a target; no counterevidence; no missing required evidence |
| `strong` | complete literal fraction and exact target motion, but one explicitly declared alternate contextual reading remains; no hard predicate failure |
| `plausible` | literal structure is compatible and no hard counterevidence exists, but permitted key or immediate-neighbor evidence is missing |
| `speculative` | the rule table explicitly permits the candidate with a named caveat; it is always visibly caveated and can never authorize an automatic edit |

A failed hard predicate eliminates that candidate rather than merely lowering
its tier. Missing a key cannot create a plausible Roman label because no Roman
root can be derived honestly. An unkeyed request instead succeeds with literal
facts and an `unclassified` plausible `unresolved` reading that names the
missing key. An explicit modal/nonfunctional span may instead supply the
corresponding exact non-Roman descriptive reading.

## 9. Context rule predicates

H0 evaluates only the current event and its immediate neighbors. It cannot scan
forward for a convenient target, skip a rest/event, or use a global progression
pattern to rescue a failed local predicate.

The frozen reading-classification order is:

```text
diatonic
ordinary-dominant
secondary-dominant
secondary-leading-tone
tritone-substitute
backdoor-dominant
modal-mixture
passing-diminished
chromatic-roman
modal
nonfunctional
unresolved
```

This order supplies output stability; it does not erase genuinely plural
compatible readings. Rule-specific exclusion still applies before sorting:
ordinary tonic dominant suppresses the secondary-dominant claim over the same
evidence. Results are ordered first by evidence tier, then this classification
order, canonical Roman label, primary rule ID, governing target event ID, and
stable reading ID. An `unresolved` reading appears only when no stronger
functional rule settles the chord.

### 9.1 Diatonic and chromatic Roman

With a valid key, H0 computes the exact Roman root and literal match. A chord
whose root and quality match an active-mode table row is `diatonic`. A chord
with an exact altered Roman root but no stronger function is
`chromatic-roman`. A chromatic label alone is not evidence of tonicization,
mixture, substitution, or incorrect harmony.

Near misses include a diatonic root with the wrong quality, an enharmonically
equal but differently spelled root, and a chromatic root lacking a supported
context rule. They must retain their literal Roman evidence without being
promoted.

### 9.2 Ordinary dominant

`ordinary-dominant` requires all of:

- a dominant-quality current realization containing exact degrees `1`, `3`,
  and `b7`;
- an immediate next event;
- current root a perfect fifth above the next root by pitch class;
- next root equal to the active key tonic with exact target spelling;
- no incompatible selected alteration or target identity.

`G7 -> C` in C is ordinary `V -> I`. The tonic target makes this rule win and
forbids reporting the same evidence as `V/V`.

Near misses include no next event, wrong root motion, an enharmonically
respelled target, and a non-tonic target. A missing next event may support only
a rule-declared plausible dominant tendency; it cannot be exact.

### 9.3 Secondary dominant

`secondary-dominant` requires all of:

- the same exact dominant core;
- an immediate next event whose root is a diatonic scale degree in the active
  key;
- current root a perfect fifth above that target root;
- target scale degree is not the active tonic;
- for `exact`, target quality is the declared diatonic quality in the active
  key; an exact target root with nondiatonic target quality is at most `strong`;
- an applied-target Roman structure and governing target event ID.

Required positive anchors include C major `D7 -> G` (`V/V -> V`), `A7 -> Dm`
(`V/ii -> ii`), and `C7 -> F` (`V/IV -> IV`). `G7 -> C` is the mandatory
ordinary-dominant near miss. `D7 -> F` is unresolved because it lacks the exact
target relation. `Db7 -> C` is not secondary dominant.

### 9.4 Secondary leading-tone

`secondary-leading-tone` requires:

- a T1 fully diminished seventh realization with its exact diminished
  spelling, including `bb7`;
- an immediate next event on a non-tonic diatonic target degree;
- current root one chromatic semitone below the target root;
- exact leading-tone and diminished guide-tone evidence;
- an applied-target Roman structure and target event ID.

A diminished chord approaching tonic is ordinary diatonic/chromatic leading
tone evidence, not secondary. A half-diminished chord, common-tone diminished
sonority, chord whose root is a whole tone below the target, misspelled
diminished seventh, or non-immediate target is a near miss. Pitch-class equality
cannot normalize `bb7` to degree `6`.

### 9.5 Tritone substitute

`tritone-substitute` requires:

- a dominant-quality current realization;
- an immediate next target;
- the current root a tritone from the ordinary dominant root of that target;
- the same dominant third/seventh pitch-class pair as the ordinary dominant,
  with each source spelling retained as evidence;
- exact target resolution evidence and no incompatible guide-tone structure.

In C, `Db7 -> C` is the mandatory tritone-substitution candidate and mandatory
secondary-dominant near miss. The pitch-class pair `F`/`Cb` may correspond to
`F`/`B` in `G7`, but `Cb` remains visible and does not earn spelled agreement as
`B`. A dominant a tritone away without the shared guide-tone pair, or one not
followed by the target, is a near miss.

### 9.6 Backdoor dominant

`backdoor-dominant` requires:

- a dominant-seventh current realization rooted on exact `bVII` of the active
  tonic;
- an immediate next event on the tonic;
- the declared whole-step root approach and semitone guide-tone tendencies;
- exact spelling and target identity.

In C, `Bb7 -> C` is the positive anchor. `Db7 -> C` is backdoor-adjacent but
does not satisfy the `bVII` root predicate. A bVII major-seventh chord, a bVII7
without tonic next, or a pitch-class-equivalent misspelling is a near miss.

### 9.7 Modal mixture

`modal-mixture` requires:

- a valid active key;
- a current root/quality absent from the active mode's diatonic table;
- exact membership in the reviewed parallel major or natural-minor source row;
- preserved spelling and a stable source-mode rule ID;
- no stronger dominant, leading-tone, tritone, backdoor, or passing-diminished
  predicate.

A chord already diatonic in the active mode is not mixture. A chromatic chord
that is absent from every declared parallel-mode row remains
`chromatic-roman` or `unresolved`. Modal mixture is a descriptive candidate,
not evidence that common-practice syntax governs the whole progression.

### 9.8 Passing diminished

`passing-diminished` requires:

- a diminished-seventh current realization with exact degree spelling;
- both immediate previous and next events;
- three exact spelled roots;
- previous-to-current and current-to-next root motion by one chromatic
  semitone in the same direction;
- distinct endpoint events and no repeated stationary root;
- target-relative spelling and exact evidence that the fully diminished chord
  occupies the middle event.

A single-sided diminished approach may qualify as leading-tone evidence but is
not passing diminished. Contrary-direction motion, a whole-tone or larger
step, missing neighbor, stationary endpoint, half-diminished/nondiminished
middle chord, enharmonic-only root, or non-immediate endpoint is a near miss.

### 9.9 Modal, nonfunctional, ambiguous, and unresolved

An explicit modal frame returns a `modal` reading and literal facts without
inventing a persisted key or functional Roman target. An explicit
nonfunctional frame returns `nonfunctional` on the same terms. These are valid
descriptions, not low-confidence failures.

If two distinct supported readings tie at the strongest tier, the disposition
is `ambiguous`; all tied readings remain. If no supported functional rule
settles the chord, disposition is `unclassified` and may retain ordered
`chromatic-roman` and `unresolved` readings. If no key or explicit span exists,
the `unresolved` reading has no Roman label, names the missing key evidence, and
never persists an inference.

## 10. Normative chord-scale table

Scale degrees below are exact simple degree tokens relative to the chord root;
tensions retain their compound `9`, `11`, and `13` roles. Containment permits
only the reviewed same-alteration equivalence classes `2<->9`, `4<->11`, and
`6<->13`. It never permits `#9=b3`, `#5=b13`, `bb7=6`, or `#4=b5`. Pitch-class
equality alone is insufficient. The frozen scale-family output order is:

```text
ionian
lydian
mixolydian
lydian-dominant
altered
whole-tone
half-whole-diminished
whole-half-diminished
dorian
melodic-minor
locrian
locrian-natural-2
```

Each option contains no more than eight scale degrees, eight tensions, eight
minor-ninth clashes, eight exceptions, eight limitations, and eight mapping
rule IDs. A mapping's required and forbidden predicates are hard gates. A
family may remain visible with a declared clash, but it cannot ignore a
forbidden chord tone.

| Mapping predicate | Family and exact ordered degrees | Required containment | Forbidden/conflicting containment | Available tensions and required reporting |
|---|---|---|---|---|
| major triad/6 or tonic `maj7` | `ionian`: `1,2,3,4,5,6,7` | `1,3,5`; the predicate separately checks declared `6`/`7` | explicit `#11` | `9,13`; natural `11` is present in the scale but reports a minor-ninth clash over chord degree `3` |
| non-tonic `maj7` with exact #4 context or explicit #11 | `lydian`: `1,2,3,#4,5,6,7` | `1,3,5,7`; the predicate separately requires contextual `#4` or explicit `#11` | explicit natural `11` | `9,#11,13` |
| unaltered dominant 7/9/13 | `mixolydian`: `1,2,3,4,5,6,b7` | `1,3,5,b7` and every named natural color | `b9`, `#9`, `b5`, `#5`, or explicit `#11` | `9,13`; natural `11` reports a minor-ninth clash over `3` |
| dominant `7#11` | `lydian-dominant`: `1,2,3,#4,5,6,b7` | `1,3,5,b7,#11` | explicit natural `11` | `9,#11,13` |
| selected `7alt` realization | `altered`: `1,b2,#2,3,b5,#5,b7` | `1,3,b7`; the predicate additionally requires the selected one of `b9/#9` and selected one of `b5/#5` | natural `5,9,11,13`, or no selected T1 alt realization | `b9,#9,b5,#5`; `b9` over root reports a minor-ninth clash but remains a named altered tension; the option retains the exact selected realization ID |
| augmented dominant or explicit #5 with no conflicting colors | `whole-tone`: `1,2,3,#4,#5,b7` | `1,3,#5,b7` | `5,b9,#9,11,b13` | `9,#11` |
| dominant b9/#9 with diminished evidence | `half-whole-diminished`: `1,b2,#2,3,#4,5,6,b7` | `1,3,5,b7`; the predicate additionally requires the selected altered ninth evidence | `b5,#5` | `b9,#9,#11,13`; `b9` clash remains visible and availability of `13` is explicit |
| fully diminished seventh | `whole-half-diminished`: `1,2,b3,4,b5,b6,bb7,7` | `1,b3,b5,bb7` | `b7` or normalized degree `6` substituted for `bb7` | `9,11,b13,7`; exact `bb7` spelling is retained |
| minor 6/7/9/11 in Dorian-compatible context | `dorian`: `1,2,b3,4,5,6,b7` | `1,b3,5,b7`; the predicate checks each declared color | `b13,7` | `9,11,13`; `13` is compound-role evidence corresponding only to same-alteration degree `6` |
| minor-major or tonic melodic-minor context | `melodic-minor`: `1,2,b3,4,5,6,7` | `1,b3,5`; the predicate checks minor-major or tonic melodic-minor evidence | `b7,b13` | `9,11,13` |
| half diminished | `locrian`: `1,b2,b3,4,b5,b6,b7` | `1,b3,b5,b7` | natural `9` | `b9,11,b13`; `b9` reports a minor-ninth clash over root `1` but is not called a universal avoid note |
| half diminished with natural-9 context | `locrian-natural-2`: `1,2,b3,4,b5,b6,b7` | `1,b3,b5,b7,9` | explicit `b9` | `9,11,b13` |

### 10.1 Suspended-dominant mapping predicate

The thirteenth mapping predicate is `suspended-dominant`. Its exact ordered
collection is `1,2,4,5,6,b7`; it maps an exact `1,4,5,b7` suspended dominant to
the compatible Mixolydian family. Degree `4` is a chord tone, not an avoid-note
claim and not a clash merely because an unsuspended dominant would contain `3`.
Exact degree `3` is forbidden for this mapping row.

If the source also explicitly contains `3` through the reviewed T1 `add3`
semantics, the suspended-dominant row no longer matches. Any separately
compatible option must report the `4`-over-`3` minor-ninth clash rather than
borrowing the suspension exception. A suspended triad without dominant `b7`, a
chord missing `4`, or a source whose `4` was silently rewritten to `3` is a near
miss.

The runtime evaluates 13 mapping predicates but emits no more than the 12
families. The ordinary Mixolydian row requires `3`, while the suspended row
forbids it; those two rows are mutually exclusive for one exact realization and
cannot create duplicate family cards.

The public exception-ID vocabulary is closed and ordered:
`suspended-fourth-is-chord-tone`, `altered-root-b9`,
`diminished-dominant-b9`, and `locrian-root-b9`. These IDs describe reviewed
treatments while preserving the underlying clash record; an implementation may
not substitute a prose-only or previously used placeholder ID.

### 10.2 Minor-ninth clash model

A clash is an explicit pair of exact degree tokens whose pitch classes form a
minor ninth when the tension is placed above the chord tone. It records the
tension, chord tone, directed interval class, rule ID, and exception status.
Clash reporting is descriptive and does not automatically remove an option.
Only a mapping's forbidden predicate removes it.

At minimum, fixtures must prove:

- Ionian/Mixolydian natural `11` over exact chord `3`;
- Locrian `b9` over root `1`;
- suspended-dominant `4` with absent `3` as the declared exception;
- suspended `add3` restoring the `4`/`3` clash;
- spelling-preserving near misses that share pitch class but not degree role.

### 10.3 Altered-realization selection

The altered family is evaluated against exactly the T1 realization selected in
the request. The option records that realization ID and its selected ninth and
fifth. H0 cannot merge the four T1 alternatives, choose the least-clashing
variant, infer a choice from voicing pitches, or substitute another variant to
make a mapping pass.

## 11. Custom chords and limitations

Custom T1 realizations have ordered pitch names and pitch classes but null
degree roles and no authoritative root. H0 must therefore return a successful
`not-applicable` result containing only justified literal pitch facts and
explicit limitations. It cannot:

- assign a Roman root or quality;
- classify dominant, mixture, diminished, modal, or functional behavior;
- compute the weighted degree match;
- enumerate a chord-scale family;
- infer a root from the lowest, first, most frequent, or bass pitch;
- deduplicate, sort, respell, or reinterpret custom pitch names.

The result carries the inherited T1 Custom limitations and H0's
degree-analysis/chord-scale limitations, up to the public maximum of eight.
Custom is not malformed merely because those operations are inapplicable.
The initial mandatory limitation IDs include `custom.no_degree_analysis` and
`custom.no_auto_voicing`; H0 preserves those exact upstream identities rather
than translating them into optimistic local prose.

## 12. Deterministic ordering and tie-breaks

All arrays have a normative order:

- input events are previous, current, next;
- literal facts follow the frozen fact-kind order, then exact degree order;
- evidence follows rule-local order, then stable evidence ID;
- readings sort by tier, classification order, canonical Roman label, primary
  rule ID, target event ID, and reading ID;
- scale options sort by tier, the 12-family order in Section 10, mapping-rule
  ID, and stable option ID;
- degrees use the exact row order, not pitch-class or lexicographic sorting;
- tensions, clashes, exceptions, limitations, and rule IDs use table order,
  then stable ID after merging duplicate family evidence;
- refusals use the global precedence in Section 14.

Repeated identical input and version fields must produce byte-equivalent
semantic output and ordering. Locale, wall time, CPU speed, random values,
iteration order, UI selection, audio state, and external content cannot affect
the result.

## 13. Exact limits, work, and memory

### 13.1 Public value and collection bounds

| Surface | Exact maximum |
|---|---:|
| request ID | 64 ASCII characters |
| base revision | `Number.MAX_SAFE_INTEGER`, minimum 0 |
| context events | 3 |
| T1 resolutions/selected realizations visited | 3 |
| context edges | 2 |
| contextual readings | 12 |
| chord-scale options | 12 |
| degrees in one T1 realization | 16, inherited unchanged from T1 |
| degrees in one scale option | 8 |
| satisfied evidence records per reading | 16 |
| counterevidence records per reading | 8 |
| missing-evidence records per reading | 8 |
| limitations per result item | 8 |
| rule IDs per reading or option | 8 |
| weighted match components per reading | 16 |
| tensions per scale option | 8 |
| clashes per scale option | 8 |
| exceptions per scale option | 8 |

These are simultaneous public ceilings, not minimum targets. Duplicate filler
cannot be used to reach them. If a valid request would require a thirteenth
reading or option, a ninth scale degree, or any other excess item, the operation
refuses all-or-nothing rather than truncating, ranking by taste, or dropping an
ambiguous interpretation.

### 13.2 Work limits

Every success and failure returns deterministic work evidence. The exact caps
per request are:

| Counter | Maximum |
|---|---:|
| context events visited | 3 |
| T1 resolutions visited | 3 |
| context edges inspected | 2 |
| analysis rule evaluations | 16 |
| chord-scale mapping evaluations | 13 |
| exact degree/component comparisons | 4,096 |
| semantic records emitted | 512 |

Counters advance according to the reviewed operation order, including failed
predicate comparisons. A semantic record includes every retained literal fact,
reading, Roman record, match component, evidence/counter/missing record, scale
option, degree, tension, clash, exception, limitation, and rule-reference
record. The validator and fixtures define the exact increment recipe.

Wall time is never a musical or semantic cutoff. There is no timeout-driven
partial answer. On the first attempted increment past a work cap, H0 returns the
aggregate `limit.harmony_work_exceeded` refusal with the attempted counter,
received value, maximum, and no semantic value.

### 13.3 Memory limit

The peak number of simultaneously retained semantic input, scratch, and output
records is 1,024. The evidence reports `peakTrackedRecords`. Per-item ceilings
do not imply that every ceiling can be reached simultaneously; a projected
result exceeding 1,024 records refuses before publication. H0 may stream or
reuse private scratch storage only if doing so leaves ordering, work evidence,
immutability, and the conservative tracked-record accounting unchanged.
Tracked-record overflow uses `limit.harmony_work_exceeded` with the
`trackedRecords` surface.

No unbounded cache, memo table, global result registry, document copy, or Atlas
index belongs to H0 v1.

## 14. Terminations and refusal precedence

The only operation terminations are:

```text
complete
input-refusal
limit-refusal
```

`complete` carries one of the four dispositions. `input-refusal` and
`limit-refusal` carry no semantic value but do carry deterministic work
evidence up to the refusal point.

All request validation is global code-major. The first applicable code in this
frozen precedence wins regardless of object key order:

```text
harmony.request_id_invalid
harmony.base_revision_invalid
harmony.upstream_contract_version_unsupported
harmony.rule_version_unsupported
harmony.selected_realization_required
harmony.selected_realization_unknown
harmony.duplicate_event_id
limit.harmony_context_events_exceeded
limit.harmony_readings_exceeded
limit.harmony_scale_options_exceeded
limit.harmony_evidence_records_exceeded
limit.harmony_work_exceeded
```

The public refusal-code declaration/inventory is not a validation-order table.
Its request-code order is request ID, base revision, selected realization
required, selected realization unknown, upstream version, rule version, and
duplicate event ID, followed by the five limit codes in the order shown above.
The separately frozen precedence above intentionally evaluates upstream and
rule versions before selected-realization validity. Implementations and
validators must preserve both orders and must not derive either one by sorting
the other.

The five aggregate limit codes own these exact surfaces:

- `limit.harmony_context_events_exceeded`: context events, T1 resolutions, and
  context edges;
- `limit.harmony_readings_exceeded`: contextual readings;
- `limit.harmony_scale_options_exceeded`: chord-scale options;
- `limit.harmony_evidence_records_exceeded`: satisfied, counter, and missing
  evidence; limitations; rule IDs; match components; tensions; clashes; and
  exceptions;
- `limit.harmony_work_exceeded`: selected-realization degrees, scale degrees,
  analysis-rule evaluations, scale-mapping evaluations, degree comparisons,
  emitted records, and tracked records.

Within an aggregate code, the surface order is exactly the order listed above.
Exact selected-realization absence is checked before unknown selection.
Analysis-table version precedes chord-scale-table version within
`harmony.rule_version_unsupported`.

Within one code, paths compare context position `previous`, `current`, `next`,
then field order declared by the public contract, then numeric array index.
Analysis validates the entire explicit request before evaluating rules. A
refusal contains one stable code, a precise path, and exactly the code-specific
diagnostic fields declared by the public refusal union: received value/count,
limit, version, component, position, or available-realization data as
applicable. Only `harmony.request_id_invalid` carries a `reason`, because its
closed enum distinguishes `empty`, `non-ascii`, and `too-long`; other codes do
not duplicate their typed diagnostics with free-form prose. A refusal never
contains literal facts, readings, options, or a partial result.

An honest `unclassified` or `not-applicable` success is not a refusal. Missing
key, modal/nonfunctional context, ambiguity, a reported scale clash, and Custom
limitations are semantic outcomes unless the request itself violates a public
shape or bound.

## 15. Independent fixture package

The exact reviewed authority root is `tests/fixtures/harmony-analysis/`:

```text
h0-harmony-analysis-contract.json
source-catalog.json
analysis-rules.json
literal-fact-cases.json
context-reading-cases.json
roman-root-mode-matrix.json
chord-scale-mappings.json
chord-scale-cases.json
transposition-cases.json
law-cases.json
limit-cases.json
operation-state-cases.json
mutation-controls.json
provenance-ledger.json
trace-ledger.json
```

Every file declares a stable schema, semantic fixture version,
`productionOutputUsed: false`, and `expectedValuesGenerated: false`. The root
manifest declares public contract identities, policy/table versions, frozen
vocabularies, bounds, and refusal-code inventory. The operation-state, trace,
and provenance companions own precedence, trace IDs, and authority IDs. The
validator freezes the exact 15-file inventory and pins every file's reviewed
byte and semantic digest; no file is required to contain a self-referential
digest.

The validator must reject:

- a missing or undeclared file;
- duplicate decoded JSON keys or unknown top-level fields;
- schema, version, vocabulary, ordering, or public-bound mismatch;
- null/unreviewed byte or semantic digests after the review freeze;
- production-generated expected values or a production import in an oracle;
- duplicate IDs, unsorted unique-ID collections, or filler-equivalent cases;
- unknown or nonreciprocal case/rule/trace/authority/mutation links;
- an authority claim whose class or source does not support the claim;
- a rule or mapping without direct positive, near-miss, transposition, and
  reviewed mutation ownership;
- a broken exact-plus-one boundary or unbounded text/collection field;
- any attempt to treat a semantic fixture edit as production-source mutation
  execution.

`source-catalog.json` contains complete, independently reviewed H0 input rows.
Its `t1AuthoritySnapshot` freezes only the upstream schema, table, spelling,
role-policy, and realization identities used during review; it is not imported
production output. `t1ReferenceOwners` closes each `t1Ref` over a named reviewed
T1 fixture collection, while the local root, formula, degree, spelling, and
realization fields remain sufficient to validate every H0 source row without
executing T1. A shallow field edit that leaves an invalid alternate realization
must therefore fail. If a later packet imports actual T1 result data instead of
a complete local input row, that imported snapshot must record its semantic
digest as well as its T1 identities.

### 15.1 Authority and provenance classes

The closed authority-class vocabulary is:

```text
reviewed-project-contract
upstream-reviewed-contract
project-policy
published-reference
```

The initial stable authority IDs are:

```text
H0-AUTH-PLAN
H0-AUTH-IDEA-WIZARD
H0-AUTH-T1
H0-AUTH-PROJECT-POLICY
H0-AUTH-OMT-APPLIED
H0-AUTH-OMT-MIXTURE
H0-AUTH-OMT-FUNCTION-CAVEAT
```

The first two own checked-in reviewed H0 decisions, `H0-AUTH-T1` owns inherited
domain/T1 definitions, `H0-AUTH-PROJECT-POLICY` owns repository-specific
determinism and offline boundaries, and the three OMT records own only their
explicit linked published claims and limitations. Independent fixture/oracle
policy is a reviewed project claim, not an external music-theory authority.

Project prose cannot promote itself to `published-reference`. H0 v1 claims no
`expert-reviewed` authority class. A citation does not turn a stylistic
convention into a universal law. Jazz exceptions, competing labels, modal
practice, and nonfunctional harmony remain explicit limitations of the table.

### 15.2 Trace obligations

The stable H0 trace IDs are exactly:

```text
H0-TRACE-LITERAL
H0-TRACE-SPELLING
H0-TRACE-ROMAN
H0-TRACE-MODES
H0-TRACE-DOMINANT
H0-TRACE-LEADING
H0-TRACE-TRITONE
H0-TRACE-BACKDOOR
H0-TRACE-MIXTURE
H0-TRACE-PASSING
H0-TRACE-NOKEY
H0-TRACE-OUTCOMES
H0-TRACE-EVIDENCE
H0-TRACE-ORDERING
H0-TRACE-SCALES
H0-TRACE-CONTAINMENT
H0-TRACE-CLASHES
H0-TRACE-SUSPENSION
H0-TRACE-ALTERED
H0-TRACE-PLURAL
H0-TRACE-TRANSPOSITION
H0-TRACE-CUSTOM
H0-TRACE-LIMITS
H0-TRACE-REFUSALS
H0-TRACE-VERSIONS
H0-TRACE-OPERATIONS
H0-TRACE-DETERMINISM
H0-TRACE-LAWS
H0-TRACE-MUTATIONS
H0-TRACE-INDEPENDENCE
```

Each trace owns concrete case IDs, mutation-control IDs, authority IDs,
`plannedProductionOwners`, and `plannedEvidenceTestOwners`. Planned owners are
handoff declarations, not claims that H0/build or H0/verify has already run.
The analysis-rule and chord-scale-mapping fixtures each carry a closed
`proofOwnership` row per public rule. Those rows link direct positive,
adversarial near-miss, all-root transposition, mutation-control, and reciprocal
trace evidence; a global link that merely keeps IDs internally consistent is
not sufficient.

## 16. All-root, near-miss, transposition, and mutation proof

The reviewed corpus must independently prove every rule and mapping. At
minimum:

- Roman/root-mode fixtures contain the 28 degree/mode seed rows (seven degrees
  in each of four persisted `KeyMode` values) and expand each through all 12
  reviewed roots for 336 independently checked cells, with separate enharmonic
  spelling adversaries;
- every functional rule has positive and adversarial near-miss cases across
  roots, including the required C-major anchors in Section 9;
- all 13 scale mapping predicates are projected through all 12 roots with exact
  spelling and inverse-transposition checks;
- altered tests cover all four selected T1 realization IDs and reject missing,
  stale, or mismatched selection;
- every evidence tier and disposition has a direct case;
- no-key, modal, nonfunctional, unresolved, ambiguous, and Custom outcomes are
  positive successes, not only negative tests;
- exact and exact-plus-one cases cover every public collection, work, output,
  and tracked-memory bound;
- identical input replay, recursive immutability, input nonmutation, and
  deterministic ordering are explicit laws.

The expansion evidence is materialized, not inferred from counts:
`roman-root-mode-matrix.json.matrix.cells` owns all 336 reviewed Roman cells,
and `chord-scale-cases.json.rootExpansion.cells` owns all 312
root-by-mapping-by-polarity cells. Each cell carries exact spelled output and an
inverse-to-C expectation so an implementation cannot certify itself with the
same transposition shortcut in both directions.

Every law record links a positive case, negative or near-miss case,
transposition proof where meaningful, and at least one reviewed semantic
mutation. Authority and trace ownership are recorded reciprocally through the
trace and mutation ledgers rather than duplicated as unverified prose on every
law row. Required mutation families include:

- ordinary tonic dominant relabeled secondary;
- non-tonic secondary target changed to tonic or unrelated root;
- leading-tone semitone/target/spelling changed;
- tritone distance or shared guide-tone pair removed;
- backdoor `bVII` changed to `bII` or target removed;
- mixture source mode or active-mode exclusion changed;
- passing bass direction, interval, or neighbor adjacency changed;
- Roman letter spelling collapsed to pitch class;
- root/third/seventh/color weights changed or fraction converted to float;
- evidence tier promoted despite missing or counterevidence;
- ambiguity truncated to one reading;
- family order randomized or “best” option selected;
- each scale degree, required/forbidden predicate, tension, clash, and suspended
  exception changed independently;
- selected `7alt` realization ignored or replaced;
- Custom root/roles inferred;
- exact caps changed, output truncated, partial result returned, or wall time
  used as a cutoff.

Semantic counterfactual execution must be reported separately from actual
production-source mutant execution. A fixture hash change is not a killed
source mutant.

## 17. Applicability and operation-state matrix

H0 is pure and synchronous. Browser, audio, playback, storage, download,
network, cancellation, worker, and UI state are not semantic inputs. The
operation-state fixture records the six boundary questions in the table as
inapplicable rather than mocking them and claiming integration proof. Playback,
download, network, worker, and UI exclusion remains an import/layer-boundary
obligation because none has a request field or adapter surface in H0.

| Surface | Applicability | Owning boundary |
|---|---|---|
| cancellation | not applicable; no token or callback exists | later bounded-search packages |
| resume | not applicable; no cursor or continuation exists | later bounded-search packages |
| browser | not applicable; no browser adapter exists | UI/release proof |
| audio | not applicable; no audio object or playback plan is consumed | audio/transport packages |
| storage | not applicable; H0 reads and writes no persisted state | application/persistence packages |
| stale application revision | not applicable inside H0; `baseRevision` is echoed | application revalidation before Apply |

`baseRevision` is echoed but not compared with ambient application state. A
later application command must reject a stale reading or option before Apply.
H0 neither applies options nor observes that later state. There is no internal
cancellation or resume point, retry, quarantine, random seed, wall-clock
deadline, or background task.

## 18. Non-goals and forbidden shortcuts

H0/spec and its later implementation do not authorize:

- runtime AI, prompts, telemetry, remote fonts/samples, or network access;
- a universal harmonic correctness, taste, tension, or quality score;
- inferred-key persistence or mutation of a document/section key;
- scanning beyond immediate neighbors for a target that makes a rule pass;
- parsing display Roman text back into semantic structure;
- pitch-class normalization that discards `Cb`, `bb7`, `#9`, or source root
  spelling;
- relabeling tonic `V-I` as secondary, or `Db7 -> C` as `V/V`;
- forcing modal, planed, constant-structure, or nonfunctional spans into a
  common-practice grammar;
- returning only one scale option, one altered realization, or one ambiguous
  reading because it looks preferable;
- treating every scale tone as an available tension or every minor ninth as a
  hard prohibition;
- hiding the suspended-dominant exception or applying it when explicit `3` is
  also present;
- inventing Custom roots, degrees, functions, or scales;
- reading fixtures as production content or generating expected fixtures from
  production output;
- silent limit relaxation, truncation, partial success, retries, skips, or
  elapsed-time cutoffs;
- mutable outputs or request aliasing.

## 19. Implementation handoff

H0/build is complete only when all three public operations implement every contract
above without widening or weakening it. It must use explicit immutable
snapshots, preserve T1 identity/spelling, return deterministic evidence and
resource accounting, and keep runtime rule data independent of the test
authority.

H0/verify must independently prove the complete rule and scale tables, exact
Roman spelling, all four key modes and all roots, target/neighbor near misses,
all four altered realizations, clash/exception behavior, Custom and no-key
success, deterministic replay, recursive immutability, exact work/memory
accounting, every reviewed counterfactual, and zero unexplained survivor,
skip, retry, quarantine, or relaxed limit.

The H0/spec exit gates are exactly:

```text
bun run validate:t1-contract
bun run validate:h0-contract
bun test tests/static/h0-contract.test.ts tests/static/h0-type-contract.test.ts --max-concurrency=1
bunx tsc -p tsconfig.h0-tests.json --noEmit --pretty false
bunx tsc -p tsconfig.app.json --noEmit --pretty false
bunx eslint src/theory/analysis-contract.ts src/theory/chord-scales-contract.ts scripts/validate-h0-contract.ts tests/static/h0-contract.test.ts tests/static/h0-type-contract.test.ts
git diff --check
bun run verify
```

`verify:h0-evidence` belongs to H0/verify. H0/spec may reserve its future
command name but cannot claim production conformance or evidence execution.
