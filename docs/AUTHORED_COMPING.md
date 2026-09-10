# Authored comping — version 1

Campaign `jcpe-6ujg.5` implements the merged COD2/AGY2 finalist. This is an
explicit, bounded comp-only audition and MIDI tool. It does not change ordinary
Play, the built-in bass arrangement, chart history, recovery, chart sharing or
JSON backups. The panel says so. “Use” means use the visible recipe for this
audition/export; no dormant main-transport override is represented as active.
Durable rhythm settings require a future versioned document migration and
recovery/share/backup fixtures; v1 instead has a separate portable recipe file.

## Musical law

A recipe has exactly sixteen sixteenth-note slots in one 4/4 bar. Each slot is
0 (silent), 1 (soft, velocity 48), 2 (medium, 80), or 3 (strong, 112). Onsets are
exact multiples of 240 ticks at PPQ 960. Gate choices are 120, 240 or 480 ticks
(1/8, 1/4 or 1/2 quarter-note beat). No randomization, swing inference, humanize,
microtiming or musical wall-clock cutoff exists.

The selected passage contains one to four complete 4/4 bars; empty bars are
valid silence. Pickups/incomplete bars, other meters and larger passages refuse
without shortening. Phase zero is the selected passage's first bar, even after
a pickup earlier in the source. The source is compiled in full chart context,
with at most 128 source chord events, then read without mutation. The literal
P0 comp voicing is used, including Manual/Frozen order, duplicates, spelling
and register; no bass line is synthesized and separately external bass remains
excluded exactly as P0 declares it.

Only nonzero authored slots may attack. At an attack, use the source event
whose half-open interval contains that absolute tick. A rest emits nothing.
A chord arrival between authored slots never adds an attack. At a boundary the
new event owns the tick. A gate is the minimum of the selected gate, remaining
source event duration, remaining passage duration and time to the next authored
attack. No gate crosses a harmony boundary, even if the next chord has no attack.
Release-envelope tails belong to the instrument and are not silently encoded
as extra MIDI gate time.

Output is one finite, zero-based passage. Source event/section/measure identity
and absolute source timing remain available; each emitted attack gets a distinct
transient ID and explicit `comp` provenance. Audio and performed MIDI consume
this same immutable snapshot. Existing loop projection is not applied afterward
because its 24-tick articulation would overwrite authored gates. Repeating this
one-pass preview, bass integration and two-bar recipe cycles are not v1 features.

## Bounds and authority

At most 128 input events, 64 visited grid slots, 64 attacks and 1,024 retained
pitch occurrences. A monotonic event cursor visits each input event at most
once while looking up slots. Inputs are validated before emission; malformed
recipes, overlapping/unsorted source intervals, mismatched exact tick mirrors,
unsupported passages and empty audible output return typed refusals without a
partial plan. Counters report source records checked, slots visited, cursor
advances, emitted attacks and retained pitch occurrences. Output storage is
bounded by 64 event/provenance pairs plus 1,024 copied immutable pitch records.

The application binds preparation to document identity/revision, passage and
recipe. Editing any input invalidates prepared bytes and cancels this tool's
pending/sounding preview. Cancellation cannot release a newer unrelated preview.
Late preparation/hash completion cannot resurrect canceled state. Preview,
recipe export and MIDI delivery use existing application-owned adapters. One
native delivery owns and revokes one object URL. Recipe files use closed schema
`changes.comp-recipe.v1`, exact slots and gate ticks; maximum input 2,048 UTF-8
bytes, no executable content or implicit coercion. Import previews a valid
recipe; applying it changes only session settings. Invalid input retains draft.

## Presets and proof

Presets are explicit authored examples, not claims about a performer's style:
Quarter pulse `[3,0,0,0,2,0,0,0,2,0,0,0,2,0,0,0]`; Offbeats
`[0,0,2,0,0,0,2,0,0,0,2,0,0,0,2,0]`; Charleston
`[3,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0]`. Restore resets Quarter pulse
and the 240-tick gate. Slots cycle off → soft → medium → strong → off, with
accessible beat/subdivision and current level; controls remain touch sized.

Independently authored fixture tables precede implementation. Named gates:
RCH Bun 1.3.14 unit/integration tests against literal onset/gate/velocity/source
expectations, exact pitch occurrences and independently decoded MIDI; source
boundary/type/lint checks; four mutants (implicit arrival, lost duplicate,
wrong boundary owner, unbounded gate) each killed with an honest success twin;
guarded size-preserving build. Real Node browser gates exercise all three
engines at phone/desktop widths, real audio scheduling/cancel and native recipe
and MIDI downloads, source edits and stale refusal, no page/console errors or
runtime requests. Human phone/listening acceptance remains a separate open
verification leaf and cannot be inferred from automation.
