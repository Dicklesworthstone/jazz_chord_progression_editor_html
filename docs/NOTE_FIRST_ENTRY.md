# Note-first chord entry

COD1 / jcpe-6ujg.3. Enter 1–16 spelled pitch occurrences, hear those exact notes,
inspect plural chord names, and add one complete bar to an explicitly chosen
section as one Undo. This uses the existing arbitrary-pitch preview and A0
measure-insert command; it does not synthesize MIDI input or add an audio owner.

Input accepts whitespace/comma-separated scientific pitches, A–G (case
insensitive), natural/#/b/##/bb/x and corresponding single Unicode accidentals,
and an explicit signed octave. At most 256 code points and 16 occurrences.
Validate through domain constructors/projection; reject unsupported spellings,
triple accidentals, empty input and out-of-MIDI-range notes. Keep order, register,
spelling and duplicates. Delimiters/case are lexical choices, never enharmonic
repair. Display the normalized spelled note list before audition/insertion.

Move the existing M0 24-entry reverse-T1 template data unchanged into a pure
theory interface; keep M0's public aliases, IDs, ordering and inference behavior.
M0 package jcpe-v3c2 is closed. Note-first uses the complete triad/sixth/seventh
subset (including suspensions), excluding power, ninth and altered-dominant
families for this first surface. It does not inherit M0's omitted-fifth matching.
No absent root, missing tone, or additional pitch is invented.

Enumerate 35 supported written roots (seven steps times alterations -2..2),
retaining only roots whose sounding pitch class occurs in the input. At most
32 template cells per root, hence 1,120 candidate cells; at most 16 input records
and 1,120 retained candidates. Resolve candidate symbols through T0/T1, compare
complete pitch-class sets, then compare literal spelled-class sets independently.
A candidate may be an exact spelled reading or an explicitly enharmonic reading.
The lowest MIDI occurrence supplies the slash bass when distinct from the root
pitch class; equal minima retain the first input spelling as the stated bass.
No mutation changes any minimum, occurrence, or symbol behind the user's back.

Results distinguish exact spelling from enharmonic readings, showing the formula's
spelled tones. Prefer exact readings, root-in-bass and simpler root spellings in
stable deterministic order; ranking is navigation, not a correctness judgment.
Initially show at most three names, preferring exact-spelling readings when any
exist, with additional names available explicitly. Keep the chosen name visible
when collapsing alternatives, even when it is outside the initial group.
Always offer Custom with an explicit label. Enharmonic names need a visible
acknowledgement that naming uses different spelling while stored notes stay exact.
F3 requires literal formula spelling for parsed Manual chords: an acknowledged
enharmonic reading is therefore stored as a Custom chord bearing the chosen name
as its label, visibly disclosed before insertion. Exact readings remain parsed
chords. Never weaken F3 or forge a parsed AST to permit alternate spelling.
No candidate is labeled the single correct chord.

Draft analysis binds source document ID and revision. Insertion receives the raw
pitch text, chosen stable candidate symbol (or Custom label), explicit destination
section ID and the draft binding. Recompute/revalidate the choice immediately
before insertion; refuse stale document/revision, missing section, unavailable
name or missing enharmonic acknowledgement. Allocate measure/event IDs through
the existing factory, build a full-meter measure containing a Manual event with
included bass, then issue ONE existing A0 insert command. ID collision, validation
or publication refusal leaves history/document untouched. No custom quick-entry
syntax workaround and no intermediate Auto chord is inserted. Undo restores the
exact prior document; Redo restores the inserted IDs/notes. Preview is nonmutating
and uses the existing preparation/cancellation/Stop ownership.

Independent fixtures precede production: Am7 versus C6/A, complete triads,
enharmonic readings, doubled notes, diminished symmetry, no-match clusters,
written-octave boundaries, transposition and invalid/capacity cases. Independently
check declared interval sets; production output cannot certify itself. Mutants
must fail for pitch-class-only exact-spelling classification, missing-root
invention, duplicate loss and stale insertion. Record deterministic cells/retained
states; wall time is performance evidence only.

Gates: RCH focused theory/application tests, existing M0 reverse-recognition
regressions, strict typecheck, lint/boundaries and guarded artifact/size. Real Node
browser proof covers entry, exact-name/enharmonic disclosure, real audition,
Add/Undo/Redo, persistence, stale drafts, keyboard/320px and offline/no errors.
Independent musical/player and applicable physical-device acceptance remain a
separate verification leaf. This specification closes no implementation gate.
