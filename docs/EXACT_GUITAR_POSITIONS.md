# Exact guitar positions

COD4 + AGY1 / jcpe-6ujg.4. An optional guitar view beside the existing inspector's
piano/voicing controls. It maps the current saved voicing's exact occurrences to
strings; it neither reharmonizes nor applies a guitar-friendly replacement.

Standard six-string tuning, low to high: E2 A2 D3 G3 B3 E4, MIDI
40 45 50 55 59 64. String numbers run 6 through 1 in that order. Frets are integers
0–20 inclusive, with open strings allowed. Each original occurrence uses exactly
one distinct string. Preserve spelling, octave, order and duplicate occurrences.
An unused string is muted, never implicitly sounded. No capo, alternate tuning,
finger assignment, barre, stretch threshold or promise of hand playability.
Rank geometric fret span (excluding opens), highest fret, fret sum and a stable
low-to-high string vector. Show at most three distinct positions. Explicitly
state that these are exact positions, not guaranteed comfortable fingerings.

The pure theory solver projects spelled inputs using domain constructors and
never imports audio/Atlas. Admit 1–16 input occurrences, with an immediate honest
no-position result above six. For at most six notes, enumerate injective string
assignments in original occurrence order and fixed low-to-high string order.
A string's fret is MIDI minus its open MIDI; no pitch-class substitution is legal.
At most 1,957 partial states including the root, 720 complete assignments and
7,422 string trials; no wall-clock cutoff. Return counters and deterministic
termination. Retain at most three full assignments plus one temporary comparison candidate, six choices per note, seven
stack levels and 720 distinct position keys. Equal-note permutations may describe
the same fret vector: count complete assignments separately, deduplicate vectors
for display, and retain the first deterministic occurrence-to-string assignment.

Application reads bind document ID, revision and event ID, obtain the existing
inspector's actual active pitches (Manual/Frozen literal or current selected Auto
realization), then call the pure solver. Do not use the teaching keyboard's
presentation register or spectrum's synthetic bass. No-position, unresolved
voicing and stale source are explicit. Current saved voicing is distinguished
from uncommitted inspector drafts. External slash bass is outside this voicing
view and its existing inspector audition; disclose this when applicable.

Use the existing inspector's current-voicing Hear/release path, with its source,
selection and cancellation checks. Diagram choice cannot change the pitches,
instrument, document or history. Display an accessible table linking every
original spelled note/occurrence to string and fret. SVG is presentation only;
its string ordering and fret labels must agree with the table. Keep the existing
piano and tab contracts intact; no competing modal or replacement workflow.

Independent fixtures cover all open strings, open Em and C shapes, unisons,
pigeonhole/same-string conflict, written-octave boundaries, out-of-register notes,
more-than-six notes and positive/inverse transpositions. Every emitted placement
must independently reproject open MIDI + fret to the fixture MIDI, use each string
once and contain every original occurrence. Mutation proof rejects register folding,
duplicate collapse, string reuse and false no-position results. Application proof
covers current Auto/Manual/Frozen authority and stale reads. Real Node browser
proof covers displayed positions/table, exact native audition/release, unchanged
history, keyboard, phone layout and absence of runtime requests/errors. Physical
guitarist usability is an independent verification leaf, not an algorithm result.

## Note-first draft preview (COD1 + COD4 integration)

The same optional diagram/table is available before a note-first draft becomes
a chart chord. An application read takes the draft's document ID, revision and
literal text, refuses stale authority or invalid text, and passes the existing
parser's exact ordered occurrences to the existing bounded guitar solver.
The selected chart chord is never a substitute for the draft. No new tuning,
search law, pitch repair, chart publication or automatic sound is introduced.

Compute only while the draft's disclosure is open. A successful keyboard edit
refreshes the open view; unfinished typed edits remove it until analyzed. A
source change hides positions and audition until explicit reanalysis. Position
selection resets for changed input and never edits notes. Reuse the saved-chord
diagram/table presentation, retaining source-specific copy. Hear/release uses
the note-first owner, preserving pending-preparation cancellation and unrelated
previews. Closing the guitar disclosure releases only that owned audition.

The checked-in note-first-guitar fixture packet is independently hand-written:
literal unisons, enharmonic unisons, exact open strings and transposition twins,
same-string conflicts, out-of-register pitches, seven occurrences and invalid
text. Verify source binding and unchanged application state; independently
reproject every displayed occurrence from string tuning plus fret. Real browser
proof covers live draft changes, stale hiding, 320px/desktop, native audio,
keyboard, exact Add/Undo/Redo and the existing saved-chord guitar path. Physical
guitarist/device acceptance remains the existing separate verification phase.
