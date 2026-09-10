# Neutral register and spacing observations

AGY5, campaign `jcpe-6ujg.13`. Extend the existing inspector's Motion tab; do
not add a new workflow, score or automatic voicing change. Existing incoming
and outgoing V1 assignments retain their 3–7 distinct-pitch admission rule,
enter/leave semantics and section resets. Static register observations remain
available for exact saved voicings of 1–16 notes even when transition assignment
is unavailable. They do not invent voice identities or an assignment.

## Exact facts

Every written occurrence retains its zero-based source index, full spelling,
octave and exact MIDI projection. Never sort, merge, octave-fold, respell or
repair the input. Report minimum/maximum MIDI, their semitone span, and count
of occurrences strictly below C3 (MIDI 48). Written B#2 is MIDI 48 and is not
below that boundary; Cb3 is MIDI 47 and is below it.

Visit each unordered occurrence pair once, in source-index order `(i,j)` with
`i < j`. An exact unison pair has equal MIDI values; enharmonic spelling and
repeated occurrences remain visible. Octave-separated pitch classes are not
unisons. Independently report pairs whose BOTH notes are below MIDI 48 and
whose absolute separation is 1–4 semitones inclusive. Zero is already covered
by unison pairs, and a 5-semitone separation is outside this explicitly named
view. These are browsing categories, not acoustic mud thresholds or errors.
No interval-quality name is inferred from semitones alone.

Output notes and pair records are immutable. At most 16 pitch validations,
120 pair visits and 136 retained note/pair records; counters and termination
are explicit. Empty, malformed, out-of-MIDI-range or over-16 input refuses
without returning partial observations. No audio, UI, content corpus, ambient
clock, randomness or network import in the pure theory operator.

## Studio behavior

Application reads the selected saved Manual/Frozen pitches or current exact
Auto realization under document ID, revision and event ID authority. A stale
or unavailable source refuses. Separately external bass is disclosed as absent
from both the observed voicing and the existing inspector audition.

Use a collapsed “Register and spacing” section inside Motion. Show exact
written notes, range/span/counts and separate pair tables. Keep lists bounded
and progressively disclosed; show the first eight rows with an explicit
show-all control when needed, never silently truncate the count. Every pair
labels the original occurrences and their spellings. Hear/Release reuse the
inspector's existing preview owner; stale or dirty drafts cannot audition this
saved-note view. No history, document, selection or persistence mutation.

Say explicitly that these observations do not rate musical quality. Keep the
existing unavailable transition explanation for oversized/duplicate frames;
new static facts never imply that a voice assignment succeeded.

## Named proof

Independently written fixtures cover exact duplicates, enharmonic unisons,
octave distinction, source-order preservation, C3 boundary/boundary-minus-one,
1/4/5-semitone separation, singleton, MIDI endpoints and 16/17 occurrences.
All chromatic transpositions within range preserve span, pair separation and
unison identity; below-C3 membership is recomputed, not assumed invariant.
Inverse octave shifts restore the exact written pitches and observations.

RCH Bun 1.3.14: pure operator and application integration tests plus existing
inspector/motion regressions, positive/refusal/mutation witnesses, types, lint,
source boundaries and guarded build. Four planted defects: octave-folded
unisons, inclusive C3 boundary, dropped duplicate, and admitted 5-semitone pair.
Real Node browser matrix exercises Motion, exact note tables, existing Hear/
Release, 320px layout, keyboard and both theme contrasts, no errors/network,
unchanged source revision and an honest unsupported-transition witness. Human
musical/usability acceptance remains the independent `.13.3` leaf.
