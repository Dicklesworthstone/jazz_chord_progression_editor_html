# Touch chord pads

CC3, `jcpe-6ujg.7`. An optional collapsed tool in the command lane plays exact
chart voicings with the user's timing. It neither records nor changes the chart,
selection, tempo, instrument, arrangement or history. This is not a latency or
expressive-controller promise; physical-phone cold/warm onset and usability
remain independent acceptance before making such claims.

## Notes and bounded projection

Use the existing full-context P0 literal realization, including current Auto
context and exact Manual/Frozen spelling, register, order and duplicates. The
separate external bass is omitted exactly as in P0 voicing audition and disclosed
per pad. Never substitute another voicing for an unavailable chord. Source
identity is document ID + revision + event ID. Stale identities refuse.

Admit at most 32 sections, 128 measures, 128 chord events and 16 occurrences per
chord. Empty measures remain in the chart but create no pads. Reject oversize
charts before realization. Cache the immutable full-context result only under
exact document object identity. Retain at most 128 pad records, 2,048 pitch
occurrences in the existing plan, and one active ownership record; report
section/measure/event/pitch counters and complete/refused termination. P0's own
finite work contract still applies. Page a selected section in groups of 16,
with explicit page/total counts, never silently drop chords or merge repeats.

## Gesture and ownership

Pointer down or a non-repeating Space/Enter keydown starts one pad; pointer up,
cancel, lost capture, keyup, blur, hidden document, page/section change, closing
the panel and unmount release its owner. A second simultaneous pointer is
ignored. A later accepted press replaces the prior pad; a late release from
that prior request cannot stop the replacement. Assistive-technology click
activation gets a bounded 1.2-second tap when no physical hold is in progress.
Holds use fixed velocity 96 and a maximum 8-second gate, independent of chart
tempo. Acoustic decay and release tails remain instrument-specific; no infinite
sustain is promised. A visible Release pads button handles explicit retirement.

Reuse the persistent audio graph and existing prepare/start/release generation
protocol. Set ownership before asynchronous preparation. Releasing or editing
during preparation prevents every late attack. An older pad's release cannot
cancel a newer unrelated note/inspector/import preview. Global Stop remains
stronger and retires all audio. No new scheduler, timer-based musical cutoff,
recording, strumming, velocity model or background audio engine.

## UI and proof

Show source labels, exact written occurrences, external-bass disclosure, section
and page navigation, preparation/refusal status and clear hold/tap instructions.
Use native buttons with keyboard support, at least 44px hit targets, two-column
phone layout and existing theme colors. Do not expose source hashes or internal
request IDs in the product UI.

Independent fixtures define MIDI projections, duplicate/order witnesses, exact
hold/tap gates, the 16/17 page boundary, 128/129 chart boundary and ownership
traces. RCH tests include positive/refusal, transposition/inverse, source-stale,
pending prepare cancellation, rapid replacements, stale pointer release,
unrelated preview ownership, global Stop and no document/history/selection edit.
Mutants drop duplicates, alter hold gate, permit stale source and release a
newer owner. Real three-engine phone/desktop tests exercise actual pointer and
keyboard holds, cancellation, page/section changes, native audio counts, source
immutability, offline/no errors, accessibility, and dark/light rendering.
Physical touch-to-sound measurements and listening remain `.7.3`; desktop
emulation must not be described as physical-phone evidence.
