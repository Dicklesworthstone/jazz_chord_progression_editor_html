# T0 Symbol and Chart Syntax Contract

Status: reviewed specification for `T0/spec`

This document is the self-contained implementation handoff for T0. The public
TypeScript surfaces in `src/theory/syntax-contract.ts` and
`src/theory/syntax-evidence-contract.ts` are normative. The former is exported
through `src/theory/index.ts`; the latter is an intentionally private deep
import for package verification, matching the F2 evidence-seam pattern. This file freezes the
lexical, grammatical, formatting, limit, diagnostic, trace, authority, and
deterministic-work decisions needed by the production and
independent-verification leaves. An implementation agent must not need
`REBUILD_PLAN.md` to decide how an input is interpreted.

T0 implements deterministic syntax. It does not resolve chord formulas, spell
chord tones, allocate persistent IDs, publish documents, select voicings, or
infer harmony.

## 1. Public boundary and ownership

The versioned public identifiers are:

- contract schema `changes.theory.syntax-contract.v1`;
- chord grammar `changes.chord-symbol`, version `1`;
- chart grammar `changes.chart-text`, version `1`;
- draft schema `changes.theory.chart-text-draft.v1`.

`SyntaxOperations` is the complete production surface:

```ts
interface SyntaxOperations {
  readonly parseChordSymbol: ParseChordSymbol;
  readonly formatChordSymbol: FormatChordSymbol;
  readonly parseChartText: ParseChartText;
  readonly formatChartText: FormatChartText;
}
```

All four operations are synchronous, total over their declared inputs, pure,
and deterministic. They do not read clocks, randomness, locale, storage,
browser state, mutable application state, or content corpora. Returned objects
and arrays are recursively immutable. T0 modules import only the public
`domain` entry point.

Cancellation and stale-result states are intentionally inapplicable at this
boundary: an operation neither yields nor retains a request handle, and its
result depends only on the complete arguments supplied to that call. The
application layer owns cancellation and revision checks around any later
asynchronous orchestration; T0 must not smuggle those states into syntax.

The public result unions in `syntax-contract.ts` are exact:

- symbol success has no warning vocabulary in version 1;
- symbol failure has no partial chord;
- chart success has a complete immutable syntax draft;
- chart failure has no draft and may expose independently insertable chords;
- formatter failure has no partial text.

`ChartTextDraft` is deliberately transient and ID-free. It contains no
persistent IDs, voicing, playback settings, revision, history, validation
brand, or publication authority. Its ordinals are zero-based source-order
coordinates local to one parse result, not persistent identities.

Section ordinal is draft-global section source order. Measure ordinal is local
to its containing section. Event ordinal is draft-global event source order
across every section and measure. Global event ordinals make repeat linkage
unambiguous across measures; repeat eligibility still resets at each section.

## 2. Shared lexical conventions

### 2.1 Source preservation and Unicode

Accepted source is preserved code-unit-for-code-unit. Parsing never trims,
normalizes, changes Unicode normalization form, changes case, or substitutes an
enharmonic spelling.

Every `SourceRange` is a zero-based half-open interval `[start, end)` in raw
JavaScript UTF-16 code units. A range therefore indexes the original
`sourceText` directly with `slice(start, end)`. Astral characters such as `𝄫`
and `𝄪` occupy two code units. Tests must include range goldens on both sides of
an astral character.

Both offsets are finite safe integers and satisfy
`0 <= start <= end <= sourceText.length`. A chart draft stores ranges against
its own `sourceText`; `formatChartText` refuses an out-of-bounds, reversed,
noninteger, or otherwise incoherent stored range as
`chart.draft_unformattable` rather than repairing it.

#### 2.1.1 Structured chart range ownership

Structured chart ranges use minimal syntax-node hulls. They never absorb
leading or trailing spacing, line endings, or comments merely because the
chart lexer skipped that material:

- `ChartDraftEvent.symbolRange` is exactly the literal chord-symbol span. For
  a repeat it is exactly the one `/` code unit and excludes its duration.
- `durationRange` is exactly the written duration from `:` through its final
  numerator or denominator digit. It is null for an allocated duration.
- `annotationRange` is exactly the event annotation's encoded JSON string,
  including its opening and closing quotes. It excludes the horizontal space
  before it. It is non-null even when the written annotation decodes to the
  empty string. A section annotation has no separate public range in version
  1; its spelling remains recoverable from `sourceText` but its presence is
  intentionally not semantic draft state.
- `ChartDraftEvent.range` is the minimal hull from `symbolRange.start` through
  the end of the last present duration or annotation. Required horizontal
  space between an event duration and annotation is therefore inside the
  event hull, while whitespace before the symbol or after the final component
  is not. For a repeat the same rule starts at the repeat `/`.
- A barred `ChartDraftMeasure.range` starts at its opening `|` and ends one
  code unit after its closing `|`. When adjacent measures share one boundary,
  the left measure's closing barline is also the right measure's opening
  barline, so their ranges overlap in exactly that one code unit. An empty
  measure still owns both boundary barlines and the spacing between them.
- A virtual measure range is the minimal hull from its first event start
  through its last event end. A virtual measure is nonempty by grammar.
- A named `ChartDraftSection.range` starts at the `[` of its marker and ends at
  the end of its final measure. An implicit section starts at its first
  measure. Section ranges consequently include marker/body separators and any
  interstitial spacing or comments between owned syntax nodes, but exclude
  spacing, line endings, and comments after the final measure and before the
  next section or end of input.

A line ending and intervening spacing/comment between two complete barred
sequences belong to neither measure. The next measure begins at its own opening
barline. This is distinct from two same-line boundary tokens, which delimit an
actual empty measure and therefore produce the overlapping barred-measure
ranges above.

A comment-warning range begins at `;` and ends after the final comment code
unit but before LF, before the CR of CRLF, or at end of input. A comment has no
structured draft node. A comment between owned syntax nodes may lie inside a
section's hull, but it never expands an event or measure range; a trailing
comment after the final measure does not expand the section range.

Range coherence for formatting means all of these ownership rules hold in
addition to ordinary bounds, containment, ordinal, grammar, and linkage rules.
The formatter validates ranges structurally; it never reparses `sourceText` or
uses production parser output as its oracle.

Text limits count Unicode scalar values, not UTF-16 code units or grapheme
clusters. Lone high or low surrogates are invalid. Accepted decoded strings are
not Unicode-normalized. Standalone symbol input reports
`symbol.invalid_unicode_scalar`; any raw chart source or decoded chart header,
section name, section annotation, or event annotation reports
`chart.invalid_unicode_scalar` at the exact offending code unit.

### 2.2 Case

Chord and key roots use uppercase `A B C D E F G` only. Quality tokens are
case-sensitive because `m`, `M`, and `maj` have different meanings. Inputs such
as `c7`, `CMaj7`, and `CMIN7` are rejected rather than case-folded.

### 2.3 Accidentals

Roots, slash basses, and key tonics accept:

| Meaning | ASCII | Unicode |
|---|---|---|
| double flat | `bb` | `𝄫` |
| flat | `b` | `♭` |
| sharp | `#` | `♯` |
| double sharp | `##` | `𝄪` |

Mixed spellings such as `b♭`, `#♯`, `♭b`, and repeated single Unicode glyphs
such as `♭♭` are not aliases for a double accidental. Triple accidentals are
reported as `symbol.accidental_out_of_range`.

Inline degree alterations are the narrower declared color vocabulary: one
flat or sharp in ASCII (`b`, `#`) or Unicode (`♭`, `♯`) before 5, 9, 11, or
13. Double-altered degree modifiers such as `bb9` and `𝄫9` are not version-1
syntax and report `symbol.modifier_unknown`. A structurally valid AST carrying
such an alteration is `symbol.ast_unformattable`.

`AccidentalStyle` affects formatting only. `ascii` emits `bb`, `b`, `#`, and
`##`; `unicode` emits `𝄫`, `♭`, `♯`, and `𝄪`. It affects roots, slash basses,
key tonics, and the supported single degree alterations consistently. The AST
always stores numeric alteration.

### 2.4 Deterministic tokenization

Lexers use longest-token precedence and never backtrack after committing a
token. The following combined tokens precede every constituent prefix:

1. `6/9`;
2. `maj13`, `maj11`, `maj9`, `maj7`;
3. `mMaj7`, `m7b5`;
4. `sus4`, `sus2`, `sus`;
5. `add13`, `add11`, `add9`, `add6`, `add4`, `add3`, `add2`;
6. `omit5`, `omit3`, `no5`, `no3`;
7. double accidentals before single accidentals;
8. two-digit degree numbers before their leading digit.

No substring classification is permitted. In particular, `maj` does not take
the `m` branch, `dim7` does not take a generic minor branch, and the absence of
the character `7` does not decide whether an extension is dominant.

## 3. Chord-symbol grammar

### 3.1 EBNF

The version-1 language is:

```text
symbol             := root body slash-bass?
root               := letter accidental?
letter             := 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
accidental         := 'bb' | 'b' | '##' | '#' | '𝄫' | '♭' | '𝄪' | '♯'

body               := power-body | quality-head? family-tail
power-body         := '5'
quality-head       := major | minor | diminished | augmented |
                      half-diminished
major              := 'maj'
minor              := 'm' | 'min' | '-'
diminished         := 'dim' | 'o' | '°'
augmented          := 'aug' | '+'
half-diminished    := 'm7b5' | 'ø' | 'ø7'

family-tail        := sixth-family post-family-item* |
                      extension-family? post-family-item*
sixth-family       := '6' ('/' '9')?
extension-family   := major-marker? ('7' | '9' | '11' | '13')
major-marker       := 'maj' | 'M' | 'Δ'
post-family-item   := suspension | modifier
suspension         := 'sus' | 'sus2' | 'sus4'

modifier           := modifier-group | inline-alteration | addition |
                      omission | seventh-modifier | 'alt'
modifier-group     := '(' modifier-item modifier-separator modifier-item
                      (modifier-separator modifier-item)* ')' |
                      '(' modifier-item ')'
modifier-separator := ',' ' '* | ' '+
modifier-item      := inline-alteration | addition | omission |
                      seventh-modifier | 'alt'
inline-alteration  := flat-or-sharp ('5' | '9' | '11' | '13')
flat-or-sharp      := 'b' | '#' | '♭' | '♯'
addition           := 'add' ('2' | '3' | '4' | '6' | '9' | '11' | '13')
omission           := ('no' | 'omit') ('3' | '5')
seventh-modifier   := 'maj7' | 'M7' | 'Δ7'
slash-bass         := '/' root
```

The expanded single-item branch for `modifier-group` is intentional. Nested
parentheses, empty groups, leading separators, trailing separators, repeated
commas are malformed. Tabs and newlines inside a group are forbidden whitespace
under section 3.2. A nested opening `(` and the second comma in a repeated-comma
sequence are each the smallest complete offending span for
`symbol.modifier_malformed`.

### 3.2 Strict whitespace rule

`parseChordSymbol` parses exactly one chord symbol and does not trim. Leading
or trailing whitespace is `symbol.whitespace_invalid`. Whitespace is forbidden
inside a symbol except ASCII space used as a separator between two modifier
items inside one parenthesized modifier group. Optional ASCII spaces may follow
a comma only when another item follows. Tabs, newlines, nonbreaking spaces, and
other Unicode whitespace are never chord-symbol separators. Any such whitespace
reports `symbol.whitespace_invalid` at the exact offending code-unit span,
including when it occurs where an ASCII-space modifier separator would
otherwise be legal. One or more ASCII spaces between items and zero or more
ASCII spaces after a nontrailing comma remain legal.

The chart lexer, not `parseChordSymbol`, owns whitespace between chart tokens.
It must retain a balanced parenthesized modifier group as part of one symbol
span even when that group uses its permitted internal spaces.

### 3.3 Supported semantic aliases

Aliases map to one `ChordSpec` while retaining exact `sourceText`:

| Meaning | Accepted forms rooted on C | Canonical ASCII base |
|---|---|---|
| major triad | `C`, `Cmaj` | `C` |
| minor triad | `Cm`, `Cmin`, `C-` | `Cm` |
| diminished triad | `Cdim`, `Co`, `C°` | `Cdim` |
| augmented triad | `Caug`, `C+` | `Caug` |
| half diminished seventh | `Cm7b5`, `Cø`, `Cø7` | `Cm7b5` |
| suspended fourth | `Csus`, `Csus4` | `Csus4` |
| suspended second | `Csus2` | `Csus2` |
| power chord | `C5` | `C5` |
| major seventh | `Cmaj7`, `CM7`, `CΔ7`, `C(maj7)` | `Cmaj7` |
| minor-major seventh | `CmMaj7`, `Cm(maj7)`, `CmΔ7` | `Cm(maj7)` |
| augmented-major seventh | `Caug(maj7)` | `Caug(maj7)` |
| altered dominant | `C7alt`, `Calt` | `C7alt` |

The parser also accepts major, dominant, and minor 9/11/13 families; major and
minor 6 and 6/9; declared additions, omissions, alterations, slash basses; and
dominant suspended 7/9/13 forms.

The apparent breadth of `quality-head? family-tail` is narrowed by the declared
family table: diminished accepts the triad or diminished seventh;
half-diminished accepts only its three complete aliases; augmented accepts the
triad or parenthesized major seventh; minor accepts 6/7/9/11/13 and the declared
minor-major seventh; and a major-marked extension uses a major triad. Forms such
as `Cdim9`, `Cø9`, `Caug7`, and `CmMaj9` are not version-1 aliases. They report
`symbol.extension_conflict` rather than creating an AST the formatter or T1
would have to reinterpret.

`C5` is the complete power body. A slash bass may follow it, but modifiers may
not. `C5/G` is therefore valid and `C5add9` is not.

Suspension without an extension creates a suspended triad. Suspension after an
unmarked 7/9/13 family rewrites the triad and is valid, including `C7sus4`,
`C9sus4`, `C13sus4`, and `C7b9sus4`. A suspension combined with a sixth,
major-marked, minor, diminished, augmented, half-diminished, or power family
is a modifier conflict in version 1.

Within `post-family-item*`, the one suspension token may occur before, between,
or after alteration/addition/omission tokens in source order. Thus mandatory
`C7b9sus4` parses successfully. Semantic normalization stores `triad: 'sus4'`,
and canonical order places suspension before alterations, so that source
formats as `C7sus4b9`. A second suspension token is never last-wins behavior; it
is the conflict defined below.

A parenthesized major-seventh modifier is valid only on major, minor, or
augmented triads without an existing seventh or extension. Other uses are
`symbol.extension_conflict`.

### 3.4 AST representation

T0 constructs the F1 `ChordSpec` exactly as follows:

- aliases differ only in `sourceText`, never in semantic fields;
- bare/major, dominant, and altered-dominant families have `triad: 'major'`;
- minor families have `triad: 'minor'`;
- half diminished has `triad: 'diminished'` and `seventh: 'minor'`;
- diminished seventh has `triad: 'diminished'` and
  `seventh: 'diminished'`;
- minor-major and augmented-major have `seventh: 'major'`;
- dominant families have `seventh: 'minor'`;
- major seventh families have `seventh: 'major'`;
- a sixth family has a natural degree 6 in `sixth` and no seventh;
- `6/9` has that sixth plus natural degree 9 in `additions`;
- `alt` sets `colorPolicy: 'altered-dominant'` and a minor seventh but does not
  choose or store one altered realization;
- inline alterations populate `alterations`;
- `addN` populates `additions` while retaining the written number, so `add2`
  is not `add9`;
- `noN` and `omitN` populate `omissions`;
- a slash bass populates `bass` and never chord membership.

Most importantly, `extensions` stores only the highest extension explicitly
named by the source. Thus `C9`, `C11`, and `C13` store natural degrees 9, 11,
and 13 respectively, one member each. They do not store implied closure tones.
T1, not T0, owns 9/11/13 closure during formula resolution.

All degree arrays are normalized into F1 number-then-alter order. Exact
duplicates within a normalized field are rejected. T0 never projects a spelled
root or bass to pitch class and reconstructs its spelling.

### 3.5 Modifier rules

The following are syntax-level rules:

- an exact modifier repeated through any accepted alias is
  `symbol.modifier_duplicate`;
- `b5` with `#5` is `symbol.modifier_conflict`;
- `sus2` with `sus4`, or any second suspension declaration, is
  `symbol.extension_conflict`;
- `no3` with `add3` is `symbol.modifier_conflict`;
- `no5` with `b5` or `#5` is `symbol.modifier_conflict`;
- a second seventh declaration is `symbol.extension_conflict`;
- exact natural-degree duplication such as `C9add9` is
  `symbol.modifier_duplicate`;
- paired `b9` and `#9` is legal and both are retained;
- a suspension with `add3` is legal;
- an altered degree may replace a natural member implied by a named extension;
  `C9b9` is therefore legal;
- `alt` with any explicit 5/9 alteration is a modifier conflict, because T1
  must expose the four altered-family realizations before an audition policy
  chooses one;
- additions or omissions not covered above remain explicit AST facts. T1/F3
  owns formula-level applicability and warnings about an omission whose degree
  is absent.

Order in accepted input does not change the normalized AST when the modifiers
are otherwise legal. Parentheses change grouping syntax, not modifier meaning.

### 3.6 Slash disambiguation

`6/9` is consumed as one sixth-family token before slash parsing. Once that
token is complete, a second slash may introduce a bass, so `C6/9/G` is valid.
`C6/E` is a sixth chord over E. A slash followed by `9` in any context that
cannot be the exact `6/9` token is `symbol.ambiguous_slash`, not an inferred
bass or extension. The reviewed `6/8` near-miss is ambiguous only when `/8`
immediately follows the complete sixth-family token; a later `/8`, or any other
digit-led malformed bass, is `symbol.bass_invalid`. A slash bass must be one
complete root and must terminate the symbol.

### 3.7 Canonical symbol formatting

Formatting ignores `ChordSpec.sourceText` and derives text only from semantic
fields. The order is fixed:

1. root;
2. triad/quality and sixth, seventh, or highest named extension family;
3. suspension embedded in that family;
4. structural 5 alterations;
5. color alterations ordered by degree number then alteration;
6. additions ordered by degree number then alteration;
7. omissions ordered numerically;
8. slash bass.

Canonical base forms use the spellings in the alias table. Additional rules
are:

- natural 6 plus the sole natural `add9` is emitted as `6/9` and that addition
  is not emitted again;
- `alt` is emitted as `7alt` and cannot duplicate explicit alterations;
- a single 5/9/11/13 alteration on an unmarked dominant 7/9/11/13 family is
  emitted inline, for example `C7b9` or `C7#11`;
- a natural addition on an otherwise plain major triad is emitted inline, for
  example `Cadd9`;
- every other modifier set is emitted in one parenthesized group;
- a group uses commas with no spaces, for example `C7(b9,#9)`,
  `C13(b9,#11)`, `Cm(add9)`, `C7(no5)`, and `Csus4(add3)`;
- a slash bass follows the closing parenthesis, as in `Cmaj7(#11)/G`;
- the requested accidental style is used consistently throughout.

An arbitrary F1 `ChordSpec` may be structurally well-typed while containing a
combination outside this grammar. `formatChordSymbol` must then return
`symbol.ast_unformattable`; it must not omit fields, choose a near syntax, or
use `sourceText` as an escape hatch. Examples include an extension without its
required seventh family, an unsupported minor-major extension, multiple highest
extension entries, or contradictory semantic fields.

The formatter-only diagnostic range for `symbol.ast_unformattable` is
`[0, chord.sourceText.length)` in UTF-16 code units, or `[0, 0)` when
`sourceText` is empty. Formatting still ignores `sourceText` when deciding
semantic output; the field supplies only this stable diagnostic coordinate.

Semantic equality for parser/formatter laws compares every `ChordSpec` field
except `sourceText`. Alias source and canonical source intentionally differ.

## 4. Symbol diagnostics and suggestions

### 4.1 Diagnostic selection

An empty string reports `symbol.root_missing` at `[0, 0)`. Whitespace does not
turn an otherwise missing root into a default. Invalid root letters report
`symbol.root_invalid`. A recognized root followed by a token that could only be
a quality reports `symbol.quality_unknown`; an unknown modifier after a valid
family reports `symbol.modifier_unknown`. A syntactically valid symbol followed
by unrelated input reports `symbol.trailing_input` over the unconsumed suffix.

Parenthesis diagnostics use these distinctions:

- no closing parenthesis: `symbol.modifier_unclosed` from `(` to end;
- empty group, bad separator, or nested group: `symbol.modifier_malformed`;
- well-delimited but unsupported item: `symbol.modifier_unknown` over the item.

For malformed separator structure, the diagnostic covers the smallest token
that proves the error: the nested `(`, the second comma of a repeated comma, or
the trailing comma plus any following ASCII spaces before `)`. Whitespace that
is forbidden by section 3.2 remains `symbol.whitespace_invalid`, not a generic
malformed-group diagnosis.

No failure returns a chord. A valid prefix is never accepted after stripping a
failed suffix.

After a complete token stream exists, the symbol parser collects every
independent recoverable modifier duplicate/conflict in source order rather than
returning after the first one. A lexical failure that destroys the remaining
token boundary (invalid scalar, exceeded limit, or unclosed group) stops that
symbol. Diagnostics caused only by an already-invalid earlier semantic choice
are suppressed; recovery must not manufacture cascades.

Preflight precedence is fixed. A lone surrogate reports
`symbol.invalid_unicode_scalar` without tokenization. Otherwise scalar length is
checked before the bounded lexer; scalar 257 reports
`limit.symbol_code_points_exceeded`. Token 65 and modifier item 33 report
`limit.symbol_tokens_exceeded` and `limit.symbol_modifiers_exceeded`
respectively at the first excess token/item. Earlier source-local diagnostics
are suppressed when a symbol resource limit is reached: that local symbol
result contains exactly the one limit diagnostic. The parser never scans beyond
the bounded stop to discover later errors. When this happens inside an already
delimited chart chord span, the chart may still collect independent diagnostics
from other spans; the delegated limit itself remains one diagnostic.

### 4.2 Did-you-mean

Suggestions are advisory strings only. They never authorize commit. Candidate
generation is restricted to replacing or removing the one failed quality or
modifier token, or replacing one ambiguous slash-family token such as `6/8`,
with a token legal in the same grammar position while retaining the exact root,
other valid tokens, and valid slash bass. Every candidate must successfully
parse.

Candidates are scored by case-sensitive Levenshtein distance over Unicode code
points with a maximum distance of three, then ordered by distance, canonical
form before an alias of the same semantics, and ECMAScript code-unit lexical
order. Exact duplicate suggestion strings are removed and at most
`MAX_DID_YOU_MEAN` (`3`) remain. The versioned replacement table contains at
most `MAX_SUGGESTION_COMPARISONS` (`64`) candidates for one failed slot;
generation stops at that deterministic cap rather than enumerating arbitrary
strings. No suggestions are produced for resource
limits, invalid Unicode, whitespace, or conflicting valid tokens. An ambiguous
slash may suggest the unique nearby declared combined token, for example
`C6/8` may suggest `C6/9`.

The checked-in policy is `changes.chord-symbol-suggestions` version `1`. Its
candidate source is closed: production may instantiate only these exact rows,
preserving the complete parsed root spelling and replacing only the failed
token in the declared grammar region:

| Grammar region | Failed token | Replacement token |
|---|---|---|
| quality | `foo` | empty body, yielding the preserved root |
| quality | `dom7` | `7` |
| quality | `mi7` | `m7` |
| quality | `Maj7` | `maj7` |
| sixth family | `/8` after the retained `6` | `/9` |
| quality | `x` | empty body, yielding the preserved root |
| quality | `x` | `m` |
| quality | `x` | `-` |
| quality | `x` | `dim` |

Thus `Cfoo` suggests only `C`, `Dbdom7` suggests only `Db7`, and `F#mi7`
suggests only `F#m7`. The engine does not compare every legal chord spelling;
in particular, `Cdim7` is not a suggestion candidate unless a later reviewed
policy version adds an explicit replacement row. `Cx` is the ordering probe:
all of `C`, `Cm`, and the accepted minor alias `C-` are one edit away, while
`Cdim` is three edits away. Canonical candidates precede the alias even though
`C-` sorts before `Cm` lexically, and lexical order breaks the remaining
canonical tie, so the exact bounded result is `C`, `Cm`, `C-`. Levenshtein
distance orders the finite instantiated rows; it never expands the candidate
universe.

### 4.3 Stable ordering

Diagnostics are deduplicated by `(code, start, end)` and sorted by:

1. `range.start` ascending;
2. `range.end` ascending;
3. `code` in ECMAScript code-unit lexical order.

Messages are explanatory and may improve. Code, range, ordering, and whether a
result succeeds are stable API.

## 5. Chart-text grammar

### 5.1 Document and fragment modes

T0 has one `parseChartText` operation with two explicit modes:

- `document` parses a complete chart-text document. It requires a declared
  `@meter` and at least one named section.
- `fragment` receives its active `Meter` from the caller. Headers are forbidden.
  It may contain named sections or one implicit section made from a single
  symbol, an unbarred sequence, or barred measures.

T0 never invents a title, section name, meter, tempo, key, ID, voicing, or
playback setting. In fragment mode `draft.headers.meter` is the caller-provided
active meter and all other headers are null. The formatter does not emit that
context meter as a header for a fragment.

An empty input is `chart.empty`. Document input without a named section is
`chart.document_section_required`. A fragment header is
`chart.header_forbidden_in_fragment`.

### 5.2 EBNF

```text
document          := spacing header* named-section+ spacing
fragment          := spacing (named-section+ | implicit-section) spacing

header            := title-header | description-header | meter-header |
                     tempo-header | key-header
title-header      := '@title' hspace json-string line-tail
description-header:= '@description' hspace json-string line-tail
meter-header      := '@meter' hspace integer '/' ('2' | '4' | '8') line-tail
tempo-header      := '@tempo' hspace integer line-tail
key-header        := '@key' hspace root hspace key-mode line-tail
key-mode          := 'major' | 'natural-minor' | 'harmonic-minor' |
                     'melodic-minor'

named-section     := section-marker section-body
section-marker    := '[' escaped-section-name ']' (hspace json-string)?
                     section-gap
section-gap       := line-end | hspace
escaped-section-name := section-character+
section-character := '\\]' | '\\\\' | any scalar except ']' or line break
section-body      := spacing barred-section | spacing virtual-measure
implicit-section := barred-section | virtual-measure
barred-section    := barred-sequence (line-end spacing barred-sequence)*

barred-sequence   := '|' measure-content ('|' measure-content)* '|'
measure-content   := spacing slot-sequence? spacing
virtual-measure   := slot spacing (slot spacing)*
slot-sequence     := slot (spacing slot)*
slot              := event | repeat
event             := chord-symbol duration? (hspace json-string)?
repeat            := '/' duration?
duration          := ':' positive-integer ('/' positive-integer)?
comment           := ';' text-to-end-of-line
line-tail         := hspace? comment? line-end
spacing           := (hspace | line-end | comment)*
hspace            := one or more ASCII space or tab characters
line-end          := LF | CRLF
```

Bare CR is not a line ending. A semicolon starts a comment only outside a JSON
string, section marker, and chord modifier group. JSON strings use ordinary JSON
string escapes and no other annotation quoting syntax.

Input may reuse one barline as the end of one measure and start of the next, as
in `| C | D |`. The lexer also accepts measures on separate lines. Canonical
formatting emits one barred measure sequence per section line and shares each
interior barline.

A line end between two complete barred sequences terminates the first sequence
and begins the next; it does not create an empty measure. Thus
`| C:4 |\n| Dm:4 |` is two measures. On one line, two adjacent boundary tokens
with only horizontal spacing between them deliberately enclose an empty
measure, so `| C:4 | | Dm:4 |` is three measures. Canonical formatting joins
the former as `| C:4 | Dm:4 |` and preserves the latter's empty interval.

A section body may begin on the marker's line after horizontal space or on the
next line. Thus `[A] | C:4 |` and a two-line marker/measure form are equivalent.
The section annotation, when present, is consumed before this separator.

A named section must contain at least one measure, including one empty measure,
or one virtual measure. A document may not contain an implicit section. A
fragment may not mix an implicit unbarred sequence with barred measures. Such
mixed syntax is `chart.unsupported_notation`.

### 5.3 Headers

Each header kind may appear at most once. A duplicate is
`chart.header_duplicate`, even when the repeated value is equal. Every header
must precede the first section or chart slot; a later header is
`chart.header_after_content`.

Before content, the five header kinds may appear in any order. Input order has
no semantic meaning. Canonical formatting always reorders present headers to
the fixed order in section 6.

Document mode requires `@meter`; its absence is `chart.meter_required`. Title,
description, tempo, and key are optional syntax values and remain null when
absent. T0 applies no hidden defaults.

Header values obey domain limits and vocabularies:

- title: nonblank under ECMAScript `String.prototype.trim()`, at most 256 code
  points; an empty or whitespace-only decoded title is `chart.header_invalid`
  over the complete encoded JSON string;
- description: at most 2,000 code points;
- meter numerator: integer 1 through 32;
- meter unit: 2, 4, or 8;
- tempo: integer 20 through 400;
- key root: the chord root spelling grammar and alteration range;
- key mode: exactly the four tokens in the EBNF.

Unknown directives, extra operands, malformed JSON, and out-of-range values are
`chart.header_invalid`. The range covers the smallest complete offending
directive/value span.

A lone surrogate in raw header source or the decoded title/description is
`chart.invalid_unicode_scalar`, not a length or generic header error.
When it came from a JSON `\uXXXX` escape, the diagnostic range covers the six
raw source code units from the backslash through the fourth hexadecimal digit;
a raw lone surrogate covers its one source code unit.

### 5.4 Sections and annotations

The only section-name escapes are `\]` and `\\`. Any other backslash escape is
`chart.section_name_escape_invalid`. A missing closing `]` is
`chart.section_name_unclosed`. The decoded name must be nonblank under
ECMAScript `String.prototype.trim()`; a blank name is
`chart.section_name_blank`. The name is limited to 256 code points and otherwise
preserved exactly.

Section and event annotations decode from one JSON string, preserve the decoded
value exactly, and are limited to 2,000 code points. A missing closing quote is
`chart.annotation_unclosed`; a lexically closed value that is not exactly one
valid JSON string or has an invalid JSON escape is
`chart.annotation_invalid_json`. A lone surrogate in the raw or decoded section
name or annotation is `chart.invalid_unicode_scalar`; it is not a length error.
For a decoded JSON `\uXXXX` surrogate the range covers that complete raw escape;
a raw lone surrogate covers its one source code unit.
Strings are inert data and are never evaluated or interpreted as HTML, CSS, or
a URL.

The decoded empty string means “no semantic annotation,” exactly like an absent
annotation. For an explicitly written empty event annotation, `annotation` is
`""` and `annotationRange` still covers the two quote code units; an absent
event annotation has the same semantic value and a null `annotationRange`.
Section annotations have no public component range in version 1, so only the
preserved `sourceText` distinguishes absent from explicitly empty section
syntax. Canonical formatting omits both forms. This is a reviewed intentional
syntactic normalization, not loss of musical or annotation content: parse of
the canonical text preserves the same annotation values, while source/range
metadata is compared only by source-preservation laws.

### 5.5 Symbol spans

The chart lexer delegates each complete symbol span to `parseChordSymbol` with
the requested accidental style. It does not remove characters, retry a prefix,
default a triad, or reinterpret a failure. Nested symbol diagnostic ranges are
prefixed exactly once by the symbol span start.

Delegated parse evidence is retained in the ordered `delegatedSymbols`
summaries defined in section 7.3, separate from the outer chart token domain. A
localized symbol limit is therefore retained as a source-ranged chart
diagnostic with its own exact nested termination, but it does not claim that the
outer chart operation stopped when the chart lexer already knows the complete
span boundary and can continue.

Whitespace normally terminates a symbol span, except for ASCII spaces inside a
balanced modifier group as allowed by the symbol grammar. A slash attached to a
rooted chord belongs to the symbol; a standalone slash at a slot boundary is a
repeat.

### 5.6 Repeats

A repeat copies only the previous expanded chord AST in the same section. The
search crosses measure boundaries but resets at every section boundary. A repeat
at the start of a section is therefore `chart.repeat_without_previous`.
Consecutive repeats all refer semantically to the preceding expanded chord.

Each repeat is a new draft event with its own ordinal, range, and duration.
`origin` is `repeat` and `repeatedFromOrdinal` is the ordinal of the nearest
preceding event whose expanded chord was copied. It never copies annotation,
duration, range, identity, or any future persistent ID. Version 1 repeat syntax
does not accept an annotation.

### 5.7 Exact duration allocation

One stored beat is one quarter note. All duration arithmetic delegates to F1
exact rational operations and uses integer/`BigInt` intermediates. Floating
point and nearest-tick rounding are forbidden.

An explicit duration is `:p` or `:p/q` where `p` and `q` are positive decimal
integers. Lexically malformed or zero values are `chart.duration_invalid`.
A positive denominator that does not divide 960 is syntactically complete but
not representable in the declared grammar, even if the fraction could reduce to
an allowed denominator; `:1/7` and `:7/7` are
`chart.duration_not_representable`. Leading `+`, minus, decimal point, exponent
notation, separators, and leading/trailing whitespace inside a duration are
invalid. Leading zeroes are accepted but canonical formatting removes them.

The reduced numerator must not exceed 2,147,483,647. Each decimal component is
first reduced to its significant digit slice by discarding leading ASCII zeroes
for comparison only; an all-zero slice is the invalid value zero. The original
source and range remain unchanged. `BigInt` is constructed only from a bounded
significant slice, never from the proportional raw source.

For integer `:p`, the significant numerator may have at most ten digits and,
at ten digits, must be lexically at most `2147483647`. For `:p/q`, the
significant denominator may have at most three digits, is compared lexically to
`960`, then is parsed and required to divide 960 exactly. With that bounded
denominator `q`, the unreduced significant numerator is compared by digit count
and lexical order to the decimal value of `2147483647 * q` (at most 13 digits).
Only a numerator at or below that bound may be converted to `BigInt` and reduced
by F1; the final reduced numerator must still satisfy the domain maximum.
Consequently `:00000000001` is accepted as one, and
`:2061584301120/960` is representable as the maximum normalized numerator,
while the next unreduced value is refused before numeric construction.

The independent hostile-number fixture pins leading-zero acceptance, integer
and rational lexical max+1 rejection, near-byte-budget significant numerator
and denominator rejection, and chart-byte precedence before duration lexing or
numeric construction.

For each nonempty barred or virtual measure:

1. compute exact meter capacity;
2. sum every explicit duration exactly;
3. if the explicit sum exceeds capacity, report `chart.bar_overfilled`;
4. if no slot is undurated and the sum is below capacity, report
   `chart.bar_underfilled`;
5. otherwise divide the exact remainder equally among undurated slots;
6. if the remainder is zero while an undurated slot exists, report
   `chart.bar_overfilled` over those slots because no positive allocation is
   possible;
7. reduce the quotient and require its denominator to divide 960;
8. if it does not, report `chart.bar_division_not_representable` and ask for
   explicit durations.

An entirely undurated measure is the same algorithm with an explicit sum of
zero. A partially explicit measure reserves its explicit values first. Every
successful nonempty measure sums exactly to capacity. `| |` creates one empty
barred measure and performs no division.

`chart.duration_not_representable` is reserved for one explicit duration whose
normalized F1 representation or PPQ tick projection is impossible.
`chart.bar_division_not_representable` is reserved for a valid set of slots
whose implicit equal share is impossible.

Aggregate draft time must not exceed 1,000,000 quarter-note beats. Exceeding the
domain timeline bound is reported as `chart.duration_not_representable` at the
event that first crosses it. In version 1 this defensive check is dominated by
the tighter syntax caps: 8,192 events times the maximum 32/2 meter capacity of
64 quarter-note beats is 524,288, below 1,000,000. The independent corpus proves
that arithmetic rather than fabricating an unreachable crossing input.

An opening barline without a coherent closing boundary reports
`chart.measure_unclosed` from that opening barline through the last source unit
that can belong to the measure. A token left after a complete header, section,
measure, event, or annotation that is not one of the explicitly deferred
notation forms reports `chart.unexpected_token` over the smallest unconsumed
token. Deferred repeat endings, nested forms, and rhythmic notation use the more
specific `chart.unsupported_notation`.

### 5.8 Partial-token recovery

Chart failure never returns or authorizes a partial draft. `insertableChords` is
an explicit recovery lane for individually valid literal or expanded repeat
events.

Malformed material attached directly to a section marker invalidates that
same-line body. Recovery may resume only after a later explicit line boundary:
LF and CRLF are boundaries, while bare CR is not. A complete, independently
valid chord after that LF or CRLF may therefore be delegated and exposed as an
insertable chord; the same source after bare CR must not be delegated or
exposed. The original attached-material diagnostic remains in every row, and
recovery never exposes rejected same-line material.

An insertable chord:

- comes only from a symbol that parsed successfully;
- retains its exact annotation if that annotation parsed successfully;
- has `layoutContextPreserved: false` unconditionally;
- has a resolved explicit or allocated duration only if that duration can be
  established without relying on invalid chart structure;
- otherwise has `duration.kind: 'requires-caller'` with
  `reason: 'chart.layout_invalid'`;
- never carries a source section, measure, ID, or permission to apply siblings.

The UI/application must expose one explicit Insert This Chord action whose copy
states that source bar/section layout will be lost. There is no “apply valid
parts” chart operation.

## 6. Canonical chart formatting

`formatChartText` validates the entire draft before emitting bytes. Schema,
grammar ID/version, mode, ordinals, ranges, header/mode invariants, event origin,
repeat linkage, exact durations, annotations, and structural limits must all be
coherent. Otherwise it returns `chart.draft_unformattable` or the more specific
applicable limit/symbol code and emits no text.

Every reached event chord is validated through `formatChordSymbol`. A nested
formatter refusal keeps its symbol code, but `formatChartText` replaces the
nested diagnostic range with that event's chart-coordinate `symbolRange`.
This rule is identical for literal and repeat events. In particular, a repeat
contains a copied `ChordSpec` whose `sourceText` belongs to an earlier literal;
the formatter never adds, clamps, or otherwise interprets those stale local
offsets as chart offsets. An incoherent event or `symbolRange` is rejected
earlier as `chart.draft_unformattable` under the validation order below.
A repeat whose copied chord differs from its nearest linked event is therefore
rejected at the repeat event `range` before nested symbol formatting. The
nested-range refusal is directly reachable through a literal event; a test may
not introduce a second repeat-coherence fault merely to force the unreachable
repeat branch.

The formatter never reparses `draft.sourceText` to manufacture a component
range that the draft does not store. If a decoded header, section name, or
section annotation violates a Unicode or text-length law whose required exact
source span is therefore unavailable, formatting reports
`chart.draft_unformattable` at `[0, 0)` for a top-level header or at the owning
section range for a section-local value. A decoded event annotation that
exceeds its code-point limit may use its stored complete `annotationRange`, as
that is the exact required encoded span; an invalid decoded scalar still has no
recoverable exact inner coordinate and is `chart.draft_unformattable` at the
event range. Raw `draft.sourceText` preflight retains the specific invalid-
scalar and byte-limit diagnostics because those exact source ranges are known.

Validation is source-order and first-excess. Top-level schema, grammar, mode,
header, and source/range-bound failures are checked before structural
traversal. During traversal the formatter first validates the current node's
own range and local shape, then increments the applicable section, measure, or
event counter. If that node is the first item beyond a structural maximum, the
formatter immediately returns the specific limit code at that node's exact
`range`; it does not validate that node's descendants or any later node. An
earlier incoherent node remains `chart.draft_unformattable`. This order makes a
coherent first-excess node a limit refusal without allowing malformed ranges to
hide behind a collection limit.

Canonical output uses UTF-8-compatible text, LF line endings, one ASCII space
between slots, no trailing spaces, and one final LF. It emits:

1. present document headers in the fixed order `@title`, `@description`,
   `@meter`, `@tempo`, `@key`;
2. each named section marker and its nonempty annotation;
3. one section body per line, with barred measures joined by shared barlines;
4. every event duration explicitly in reduced `:p` or `:p/q` form;
5. every nonempty event annotation through ordinary `JSON.stringify`
   semantics; empty section and event annotations are omitted;
6. literal events through canonical symbol formatting;
7. repeat events as `/:p` or `/:p/q` only when their linkage names the nearest
   reusable preceding event in the same section.

Document mode always emits its required `@meter`. Fragment mode never emits the
caller-supplied context meter as a header. An implicit fragment section emits no
section marker. A virtual measure emits no barlines. A barred sequence begins
with `| `, emits each measure's slots followed by ` |`, and uses that closing
barline as the next measure's opening barline. Two nonempty measures therefore
format as `| C:4 | Dm:4 |`, not `| C:4 | | Dm:4 |`. An empty measure contributes
no slot text between its boundaries; one empty measure emits `| |`.

Comments are ignored by semantic parsing and are not represented in structured
headers, sections, measures, events, or annotations. They remain present only
inside the draft's exact `sourceText`. If any comment was present, success returns one
`chart.comments_not_round_tripped` warning per maximal comment span, in source
order. Canonical formatting omits comments. A coherent repeat remains a repeat,
including origin and linkage on canonical reparse. Comments are the only
warning-bearing loss of nonempty source content. Section 5.4's explicitly empty
annotation spelling is the sole additional nonsemantic syntax normalization.

## 7. Limits and bounded work

### 7.1 Normative limits

| Limit | Value |
|---|---:|
| symbol Unicode scalar values | 256 |
| symbol lexical tokens | 64 |
| symbol modifiers | 32 |
| did-you-mean results | 3 |
| chart UTF-8 bytes | 2,097,152 |
| chart lexical tokens | 65,536 |
| chart sections | 64 |
| measures per section | 1,024 |
| events in one chart draft | 8,192 |
| title / section name | 256 code points |
| description / annotation | 2,000 code points |
| meter numerator | 1-32 |
| meter unit | 2, 4, or 8 |
| tempo | integer 20-400 |
| normalized beat numerator | 0-2,147,483,647; duration is positive |
| beat denominator | positive divisor of 960 |
| total draft time | 1,000,000 quarter-note beats |

`limit.chart_text_code_points_exceeded` applies to a decoded title,
description, section name, or annotation whose field-specific limit is
exceeded. Its range covers the complete encoded string or section-name span.

Limits are checked before allocating storage proportional to the exceeded
dimension. At a structural maximum, the parser accepts the last permitted
item and refuses the first item beyond it at that item's exact range.
The first section 65, measure 1,025 within one section, and event 8,193 report
`limit.chart_sections_exceeded`,
`limit.chart_measures_per_section_exceeded`, and
`limit.chart_events_exceeded` respectively.

Every limit diagnostic has an exact first-excess source range. A symbol scalar
limit covers the first excess scalar; the symbol token and modifier limits
cover the complete first excess token or modifier item. The chart byte limit
covers the complete Unicode scalar whose UTF-8 encoding crosses the byte
budget. The chart token limit covers the complete first excess chart token.
Section, measure, and event limits use the first excess structured node's range
under section 2.1.1. Decoded text limits use the complete encoded JSON string or
section-name span as stated above. The boundary fixtures spell out each source
construction, source length, first-excess ordinal, and literal UTF-16 range.

### 7.2 Token and modifier accounting

A symbol token is each root letter, accidental, combined quality/family token,
suspension, modifier item, parenthesis, comma, slash, and bass root/accidental.
Permitted ASCII spaces inside a modifier group are separators but not tokens.
Each normalized modifier item, including `alt`, counts once against
`MAX_SYMBOL_MODIFIERS`; quality, family, suspension, sixth, and slash bass do
not.

A chart token is each directive name, directive scalar/JSON operand, section
open, decoded section-name span, section close, section annotation, barline,
whole chord-symbol span, repeat, duration, event annotation, and comment.
Whitespace and line endings are not tokens. A chord span counts once at chart
level and is separately bounded by the symbol limits.

### 7.3 Deterministic work counters

The private evidence seam returns every semantic counter below. Each limit
fixture pins the exact terminating-counter projection and termination value;
the remaining counters are checked against independent semantic invariants and
bounds rather than implementation-specific allocation totals:

- `sourceUtf16CodeUnits`;
- `sourceCodePoints`;
- `sourceUtf8Bytes`;
- `maxDecodedTextCodePointsObserved`;
- `lexerCodePointsVisited`;
- `tokensProduced`;
- `parserTransitions`;
- `modifierItemsObserved`;
- `headersObserved`;
- `sectionsObserved`;
- `measuresObserved`;
- `slotsObserved`;
- `chordDelegations`;
- `allocationDivisions`;
- `numericComponentsCompared`;
- `maxSourceBigIntDigits`;
- `suggestionsCompared`;
- `diagnosticsProduced`;
- `insertableCandidatesProduced`;
- `peakTokenRecords`;
- `peakDraftNodes`;
- `peakSuggestionRecords`;
- `termination`.

`sourceUtf16CodeUnits` is `sourceText.length`, observed without traversal.
`sourceCodePoints` and `sourceUtf8Bytes` count the well-formed scalar prefix
visited by preflight; on well-formed input they cover the whole source, and on
an invalid scalar they stop immediately before it. `lexerCodePointsVisited`
counts scalars consumed after preflight by the current grammar layer.
`tokensProduced` and `parserTransitions` likewise belong to that layer: a chart
chord span is one chart token, while symbol tokens and transitions live in its
delegation summary below. One transition is counted for each produced token
consumed or explicitly skipped by deterministic recovery. Preflight visits each
UTF-16 code unit at most once, a grammar-layer lexer visits each valid scalar at
most once, and parsing never reparses a prefix. A measure duration fold makes at
most two visits per slot: one explicit sum pass and one allocation pass.

For a symbol operation, `modifierItemsObserved` counts complete normalized
modifier items, including the first item beyond the modifier limit, and
`suggestionsCompared` counts reviewed replacement candidates actually compared
with its failed slot. Both counters are zero in outer chart evidence; delegated
symbol values are not summed into the independently capped chart grammar
domain. `headersObserved` counts complete header directives.
`sectionsObserved` counts complete section records, including section 65;
`measuresObserved` is the global count of complete measure records, including
the first measure beyond a per-section limit; and `slotsObserved` counts
complete chord or repeat slots, including event 8,193. `chordDelegations` counts
complete literal chord-symbol spans actually delegated to the symbol parser and
is at most `MAX_CHART_EVENTS`. `allocationDivisions` counts successful exact
remainder-by-undurated-slot divisions.

`numericComponentsCompared` counts each explicit duration numerator and
denominator whose significant slice reaches the zero/bound comparison in chart
parsing: one for `:p`, two for `:p/q`, and zero when an earlier chart preflight
stops the operation. `maxSourceBigIntDigits` is the maximum significant decimal
source digits actually passed to `BigInt`; it is zero when every component is
rejected before construction and never exceeds 13. These are outer chart
counters. Symbol parsing, delegated symbol evidence, and both formatters report
zero for both fields. Thus the hostile-number fixtures distinguish bounded
lexical rejection from eager proportional numeric construction without using
wall time or RSS as a semantic oracle.

`ParseChartTextWithEvidence` additionally returns `delegatedSymbols`, one
`DelegatedSymbolWorkEvidence` for every `chordDelegations` increment. Entries
are ordered by ascending chart `symbolRange`, have consecutive zero-based
`delegationOrdinal` values, and store that exact chart-coordinate range. Each
entry's `evidence` is byte-identical to the `SyntaxWorkEvidence` obtained by
calling `parseChordSymbol` once on
`sourceText.slice(symbolRange.start, symbolRange.end)` with the requested
accidental style. The summary therefore owns the delegated source, lexer,
symbol-token, parser, modifier, suggestion, peak, and local `termination`
counters without changing the meaning of the outer chart counters. A symbol
limit may have local termination `symbol-code-points`, `symbol-tokens`, or
`symbol-modifiers`; when the complete chart span provides a safe recovery
boundary and chart parsing reaches end of source, the outer termination is
still `complete`.

`diagnosticsProduced` is the number of diagnostic records on the returned
branch: error diagnostics for failure or warnings for success.
`insertableCandidatesProduced` is the number of `insertableChords` entries on
the returned failure branch. Neither counter includes discarded internal
records, and no evidence field claims to count implementation-specific object
or array allocations.

Evidence is operation-specific. The parse operations bind source counters to
their `sourceText` argument and perform the bounded lexical/parser work above.
Both formatter operations first apply the same well-formed-Unicode source
preflight to their stored `sourceText`; their source counters therefore obey
the exact full-source/invalid-prefix rule above. This preflight does not lex or
parse the stored text. `formatChordSymbol` then validates and formats the
supplied AST and reports zero lexer, token, parser, modifier, header/section/
measure/slot, chord-delegation, allocation, numeric-component, source-BigInt,
suggestion, insertable, and peak-record counters. Its `diagnosticsProduced` is
exactly the number of diagnostics on the returned branch.

`formatChartText` likewise validates the supplied draft without reparsing its
text. After source preflight and top-level validation, it increments
`headersObserved` once per present header inspected in fixed canonical header
order. It increments `sectionsObserved`, `measuresObserved`, and
`slotsObserved` exactly when each complete record is reached in the validation
order specified in section 6, including a coherent first-excess record but not
its unvisited descendants. `chordDelegations` is exactly the number of reached
event chords delegated to the symbol formatter, and `diagnosticsProduced` is
exactly the number of diagnostics on the returned branch. It reports zero
lexer, token, parser, modifier, allocation, numeric-component, source-BigInt,
suggestion, insertable,
`peakTokenRecords`, `peakDraftNodes`, and `peakSuggestionRecords` counters.
Caller-owned draft records are inputs, not formatter scratch records.

`peakTokenRecords` is the maximum simultaneously retained operation-owned token
records. For chart parsing this includes outer chart records plus the one active
delegated symbol parser, for a cap of 65,600 retained records; a first excess
token may be observed and refused without being retained. `peakDraftNodes`
counts only draft root, section, measure, and event records allocated or copied
and simultaneously retained by the operation. Caller-owned formatter input is
excluded, so an arbitrarily oversized caller graph does not falsify the bound;
`formatChartText` reports zero. The parse cap is exactly one draft root plus 64
sections, 65,536 measures, and 8,192 events: 73,793.
`peakSuggestionRecords` is the maximum simultaneously retained suggestion
candidates, including the one active delegated symbol parser for chart parsing.
Its reviewed cap is 64. An implementation that truly releases records earlier
may report a smaller peak, but it may not omit retained operation-owned state.

`termination` is exactly one of `complete`, `symbol-code-points`,
`symbol-tokens`, `symbol-modifiers`, `chart-bytes`, `chart-tokens`,
`chart-text-code-points`, `chart-sections`, `chart-measures`, or
`chart-events`. The terminating limit matches the returned diagnostic in that
evidence scope. All counters include work through the terminating item and
exclude work that the bounded stop forbids. `complete` means no deterministic
limit stopped that scope; it includes an ordinary fully diagnosed syntax
failure such as `chart.invalid_unicode_scalar`. Outer chart and delegated symbol
termination are deliberately separate scopes as specified above.

Scratch memory is bounded by the source plus at most 65,600 token records,
73,793 retained draft records, and 64 suggestion records. The semantic result
counts and these aggregate live-record peaks are reported independently; the
contract does not pretend to measure engine-specific object or array
allocations. Caller-owned formatter input is not scratch memory. A streaming
implementation may report smaller peaks but may not weaken counters or
diagnostics.

Wall time and resident memory are performance observations. They never decide
musical syntax, truncate candidates, or replace the deterministic counters.

## 8. Chart diagnostic precedence and ordering

Unsafe global preflight failures stop further work:

1. `chart.invalid_unicode_scalar` at the first lone surrogate;
2. `limit.chart_utf8_bytes_exceeded`;
3. `limit.chart_tokens_exceeded` once the bounded lexer reaches token 65,537.

Otherwise the chart parser recovers at explicit chart token boundaries. In
particular, a failed complete chord span does not prevent delegation of a later
complete chord span, and both source-ranged failures are returned. An unclosed
JSON string, unclosed section marker, or unclosed modifier group stops the
affected lexical region because no later boundary can be identified without
guessing. A chart-level deterministic limit stops the outer operation and is
its sole diagnostic; earlier ordinary diagnostics are suppressed. A symbol
limit inside an already delimited complete chord span stops only that delegated
symbol operation; chart recovery resumes at the known span end and the nested
summary retains the symbol termination. Derived duration/allocation diagnostics
are emitted only for a measure whose complete slots are individually valid.

An empty source is checked after byte preflight. Structural limit diagnostics
are attached to the first excess item. Header, section, measure, slot, duration,
annotation, and delegated symbol diagnostics are otherwise collected wherever
recovery can continue without guessing token boundaries.

Chart diagnostics are deduplicated by `(code, start, end)` and sorted by:

1. `range.start` ascending;
2. `range.end` ascending;
3. `code` in ECMAScript code-unit lexical order.

When one malformed span admits several descriptions, lexical structure wins
before musical interpretation: unclosed delimiter, malformed delimiter,
resource limit, invalid local value, duplicate/conflict, then trailing input.
This rule prevents a missing quote or parenthesis from cascading into guessed
symbols. The exact expected code/range for every overlap is present in the
adversarial fixture corpus.

Warnings are sorted by source range and code. Human-readable messages are not
golden authority. Codes, ranges, ordering, counters, and outcomes are.

## 9. Deterministic laws

The T0 package must prove all of the following with independent positive,
negative/near-miss, transposition-of-root where applicable, boundary, and
mutation cases:

1. `parse(format(parse(x)))` yields a semantically equal `ChordSpec`, excluding
   `sourceText` from equality.
2. Canonical symbol formatting is idempotent.
3. Formatting never invents a modifier absent from the AST.
4. Every accepted alias reaches its declared canonical form.
5. ASCII and Unicode accidental forms produce equal semantics while preserving
   distinct source text.
6. Unknown, conflicting, truncated, or trailing source never becomes a major
   triad or shorter accepted prefix.
7. Longest-token behavior is invariant under every documented prefix overlap.
8. Legal modifier permutations normalize to one AST and canonical text;
   illegal permutations produce the same conflict code.
9. Diagnostic codes, ranges, order, and suggestions are byte-identical on
   repeated runs.
10. Canonical chart formatting reparses to an equivalent syntax draft after
    source text/ranges and comment warnings are excluded from semantic equality;
    repeat origin/linkage remains equal.
11. Canonical chart formatting is idempotent.
12. Every successful nonempty measure sums exactly to its meter capacity and
    every duration projects to an integer PPQ-960 tick count.
13. Repeat expansion preserves only chord semantics and its explicit duration.
14. A section boundary always resets repeat eligibility.
15. Chart failure never returns an applicable draft and insertable chords never
    claim layout preservation.
16. Same input, grammar versions, mode/context, and accidental style produce
    byte-identical output and ordering.
17. Every deterministic limit stops on the exact first excess item and reports
    the declared counters.

Root-interval transposition, formula resolution, degree spelling, and
resolve-then-format integration are downstream laws. T0 covers all supported
written roots and accidental styles but does not invent a transposition engine.

## 10. Required fixture coverage

The independently authored corpus includes every root where relevant and at
least these symbol families:

```text
C, Cm, Cdim, Caug, Csus2, Csus4, C5
C6, Cm6, C6/9, Cm6/9
Cmaj7, C7, Cm7, Cm(maj7), Cm7b5, Cdim7, Caug(maj7)
Cmaj9, C9, Cm9, C11, Cm11, C13, Cmaj13, Cm13
C7b5, C7#5, C7b9, C7#9, C7#11, C7b13
C7(b9,#9), C7(#9,#11), C13(b9,#11), C7alt
C9sus4, C13sus4, C7b9sus4
Cmaj7(#11)/G, Db7/Cb, F#m7b5/C
Cadd9, Cm(add9), C7(no5), Csus4(add3)
```

It also includes:

- every alias and ASCII/Unicode accidental;
- whitespace at every illegal boundary;
- all longest-token prefix overlaps;
- every duplicate and conflict pair;
- malformed/unclosed/nested modifier groups;
- repeated commas, nested opening parentheses, trailing comma-plus-space, and
  forbidden tab/newline/nonbreaking/other-Unicode whitespace at exact ranges;
- invalid/triple/mixed accidentals;
- unknown qualities and modifiers;
- valid prefix plus trailing source;
- 255/256/257-code-point and surrogate boundaries;
- astral-scalar 256/257 symbol and 2,000/2,001 decoded-text boundaries with
  exact UTF-16 ranges;
- 63/64/65-token and 31/32/33-modifier boundaries;
- formatter-only unrepresentable ASTs;
- full chart headers in canonical and deliberately scrambled valid order, plus
  duplicate and post-content invalid placements;
- empty and whitespace-only title refusal, every declared key mode, and
  canonical reordering from a valid scrambled header sequence;
- duplicate and post-content headers;
- section escape, annotation, and comment cases;
- repeat at section start, consecutive repeat, cross-measure repeat, and reset;
- empty, underfilled, overfilled, exactly filled, partially allocated, and
  nonrepresentable bars in all supported beat units;
- shared barlines and unclosed bars;
- explicit duration lexical and numeric boundaries;
- fragment single-symbol, unbarred, barred, named-section, and forbidden-header
  modes;
- every source/field/collection limit at max and max+1;
- an astral UTF-8 scalar that crosses the byte maximum, proving that the
  diagnostic uses the complete scalar's UTF-16 range rather than a byte offset;
- title, description, section-name, and annotation text limits independently;
- meter numerator 0/1/32/33, all three beat units, and tempo 19/20/400/401;
- at least one symbol and one chart failure with two independently recoverable,
  exactly ordered diagnostics;
- rejected material attached to a section marker followed by LF-positive,
  CRLF-positive, and bare-CR-negative recovery rows, with exact diagnostic,
  insertable, delegated-range, duration, and evidence-counter projections;
- every formatter mutation row has a stable subcase ID and an exact one-path
  `mutationProjection` containing its pre-mutation and post-mutation JSON values;
- comments as the only warning-bearing loss of nonempty source content, plus
  the declared nonsemantic normalization of explicitly empty annotations.

Expected ASTs, canonical strings, ranges, duration fractions, ordinals,
terminating-counter projections, counter invariants, and diagnostic order are
literal fixture data. Engine-specific allocation counts are deliberately not
used as authority. Fixture generation may not import production syntax modules.

## 11. Trace ledger

The stable T0 trace IDs are:

| Trace ID | Requirement |
|---|---|
| `T0-TRACE-SYMBOL-GRAMMAR` | complete declared chord EBNF and AST mapping |
| `T0-TRACE-LONGEST-TOKEN` | longest-token behavior and no substring classification |
| `T0-TRACE-ALIASES` | aliases preserve source and canonicalize deterministically |
| `T0-TRACE-UNICODE` | ASCII/Unicode spelling, scalar validity, and alteration bounds |
| `T0-TRACE-HIGHEST-EXTENSION` | highest-explicit-extension AST storage and dominant seventh |
| `T0-TRACE-MODIFIERS` | combined forms and duplicate/legal-pair/conflict matrix |
| `T0-TRACE-SLASH` | 6/9, slash bass, second slash, and ambiguity |
| `T0-TRACE-STRICT-WHITESPACE` | standalone whitespace refusal and modifier-list exception |
| `T0-TRACE-STRICT-REFUSAL` | failed/unknown source never defaults, repairs, or truncates |
| `T0-TRACE-FORMATTER` | canonical field order and typed unformattable AST refusal |
| `T0-TRACE-RANGES` | half-open UTF-16 ranges and deterministic diagnostic order |
| `T0-TRACE-DID-YOU-MEAN` | bounded root-preserving deterministic suggestions |
| `T0-TRACE-CHART-MODES` | document/fragment separation and context meter |
| `T0-TRACE-HEADERS` | header grammar, uniqueness, placement, values, and order |
| `T0-TRACE-CHART-STRUCTURE` | named/implicit sections, bars, virtual measures, and slots |
| `T0-TRACE-ANNOTATIONS` | section/event JSON strings and section-name escapes |
| `T0-TRACE-COMMENTS` | comment warnings and the only loss of nonempty source content |
| `T0-TRACE-DURATION` | PPQ-exact explicit/allocation/under/overfill behavior |
| `T0-TRACE-REPEAT` | repeat scope, copy boundary, linkage, and formatting |
| `T0-TRACE-TRANSACTION` | whole-draft success or explicit context-losing chord recovery |
| `T0-TRACE-ROUNDTRIP` | symbol/chart semantic round trips and idempotence |
| `T0-TRACE-DETERMINISM` | seeded replay, stable bytes, order, and counters |
| `T0-TRACE-LIMITS` | every source/token/modifier/structure/work boundary |
| `T0-TRACE-LEGACY-REFUSAL` | legacy theory regressions including unsupported-major fallback |

The mandatory legacy trace is also T0-owned:

| Trace ID | Regression | Required test | Evidence heading |
|---|---|---|---|
| `L-THEORY-02` | unsupported quality defaults major | `tests/unit/symbol-errors.test.ts` | `theory/refusals` |

Every fixture case cites one or more trace IDs and authority IDs. The trace
validator rejects an unknown/duplicate trace, a trace without positive and
negative evidence, a requirement without a case, a missing named test, or a
passing claim not present in the package evidence ledger.

## 12. Authority and provenance

Every expectation belongs to the versioned machine-readable T0 authority
ledger. The normative `authorityClass` vocabulary from the reviewed plan is:

- `definition` — derivable from the declared grammar, AST mapping, exact-time
  rules, or formatting table;
- `published-reference` — independently checked against a named external
  standard or notation reference;
- `expert-reviewed` — a judgment-bearing notation/usage decision reviewed and
  dated by a qualified musician;
- `compatibility` — a legacy input behavior intentionally accepted or rejected
  without calling it theoretically normative.

`sourceKind` records where that authority came from without replacing the
normative class:

| Authority ID | `authorityClass` | `sourceKind` | Scope |
|---|---|---|---|
| `T0-AUTH-GRAMMAR` | `definition` | `reviewed-project-policy` | grammar, aliases, modes, diagnostics, canonicalization, refusal |
| `T0-AUTH-DOMAIN` | `definition` | `reviewed-project-policy` | spelling-first `ChordSpec` representation |
| `T0-AUTH-TIME` | `definition` | `reviewed-project-policy` | exact beat, meter, PPQ, reduction, and allocation rules |
| `T0-AUTH-JSON` | `published-reference` | `external-definition` | RFC 8259 string parsing and escaping |
| `T0-AUTH-UTF16` | `published-reference` | `external-definition` | ECMAScript UTF-16 source coordinates |
| `T0-AUTH-LEGACY` | `compatibility` | `compatibility-regression` | confirmed legacy failure behavior that may not recur |
| `T0-AUTH-INDEPENDENCE` | `definition` | `verification-policy` | fixture independence, seeded laws, and mutation controls |

T0 currently has no `expert-reviewed` row and makes no false claim of expert
review. The allowed class remains available only for a future row with an exact
reviewer, date, scope, and reviewed expectation. A future judgment-bearing
notation claim cannot be inserted under `definition` merely for convenience.

The ledger states that production output was not used and expected fixture
values were not generated by the production parser or formatter. Every fixture
references at least one existing authority. External claims use exact source
references; project policy is not laundered into an external claim. The
validator rejects duplicate keys/IDs, unknown classes, missing review state,
self-citation, circular generated authority, and unreviewed judgment-bearing
rows.

Development-time AI may propose fixture candidates only outside shipped
authority. It cannot certify notation or theory. A proposed row enters the
reviewed fixture corpus only after its expected AST/text/range data and authority
classification are independently checked.

## 13. Downstream ownership

T0 stops at a syntax draft and `ChordSpec`:

- T1 owns extension closure, exact formulas, required/optional/guide roles,
  altered-dominant realization sets, degree spelling, and formula refusals.
- F3 owns `sourceText`/AST semantic agreement for decoded documents, cross-field
  formula validity, measure semantics, voicing compatibility, and the combined
  publication gate.
- A0 owns persistent ID allocation, insertion placement, commands, history,
  undo/redo, and atomic application of a valid draft/event.
- E0 owns transactional JSON/chart import and document text export, including
  explicit losses outside this chart draft grammar.
- U1 owns parsed preview, token underlining, Apply Entire Draft availability,
  Insert This Chord copy, keyboard/touch interaction, and accessibility.
- H1 owns spelling-preserving transposition laws.
- T1 and later engines own resolution/context/suggestion behavior. T0 never
  imports the Harmonic Atlas or a content adapter.

Unsupported polychords, nested repeats, first/second endings, rhythmic notation,
publisher-specific dialects, prose interpretation, and arbitrary chart repair
remain source-ranged diagnostics. T0 does not create a `CustomChordSpec`
automatically from a parse failure; that is an explicit later user/import
decision.

## 14. Forbidden shortcuts

Implementers and verifiers must not:

- classify quality or function with substring search;
- accept a valid prefix and discard an unknown suffix;
- default a missing/unknown quality to major;
- strip characters and retry a failed symbol;
- conflate `6/9` with slash bass;
- collapse spelling to pitch class and reconstruct a preferred name;
- trim, case-fold, normalize, or respell accepted source;
- use floating point or nearest-tick rounding for chart duration;
- silently underfill, overfill, rebalance, or create an incomplete measure;
- split chart input on whitespace without balanced modifier/JSON/bar context;
- copy annotation, duration, identity, or section context through a repeat;
- apply the valid subset of an invalid chart;
- allocate persistent IDs, default voicings, or playback settings in T0;
- format an unrepresentable AST by dropping fields;
- generate expected fixtures from production output;
- let parser/formatter import resolver, application, UI, audio, storage, export,
  content, Atlas, or test-support code;
- introduce a model client, prompt, runtime AI, network request, telemetry, CDN,
  remote font, or remote sample;
- weaken a limit, golden, trace, or diagnostic merely to pass an implementation;
- ship skipped, retried, quarantined, or silently relaxed named evidence.

T0 is complete only when another agent can implement the package from
`syntax-contract.ts`, this document, and the independent fixtures, and every
trace above is green without a production-generated oracle.
