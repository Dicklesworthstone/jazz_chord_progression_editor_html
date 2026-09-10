# Focus play-along display

Owner request: all duel finalists, 2026-09-10. Package jcpe-6ujg.1 (CC2).

Focus offers a reversible large current/next chord display. It never changes
selection, document, history, transport scheduling, or stored voicings. Stop
and Exit remain visible. The existing chart stays reachable below the display.

The application builds an immutable source timeline once per published document
identity, using domain PPQ 960 conversion. One span per chord or explicit silent
measure retains exact source text, section name, one-based bar and measure start.
Empty measures occupy meter capacity; pickup/incomplete bars occupy their actual
written duration. No performed bass/comp event supplies a chord label.

A binary search uses half-open [start,end) spans. At an exact change the arriving
chord wins. Silence is labeled Rest. Next is the immediately following span,
including a rest; at a loop end it is the span containing the exact loop start.
Ranges that clip a chord retain that chord's label. Outside the current span
range (including the non-loop chart end) current is absent, never clamped to a
plausible chord. Meter beats count in the denominator unit, from the actual bar
start. Source integer ticks are exact; display conversion is not a musical clock.

The live controller reads the audio port's numeric display beat and actual loop.
It requires matching document and plan/view revision authority. If unavailable,
preparing, failed or stale, show an honest status instead of a purported live
chord. Ready state may show a clearly labeled starting cue; paused state retains
the paused position. During count-in the audio display clock holds at the start:
show the starting chord and chart beat, not an invented countdown or elapsed-beat
animation. No platform timing or real-device performance guarantee is inferred.

The display samples at most 10 times/second while mounted. The timer only reads
selectors. It is canceled on unmount; DOM and focus do not depend on chord count.
Timeline allocation is bounded by existing F3 event/measure limits, one retained
cache per controller. Lookup uses O(log spans) comparisons plus one successor
lookup. No new network, Web Audio graph, browser API, or production dependency.

Independent expectations: tests/fixtures/play-along/cases.json. Cover exact
boundaries, fractional events, explicit rest, end, loop wrap and clipped ranges;
transpose labels without changing times and mutate boundary/next/rest results.
Unit tests exercise the real selector. Integration proves stale authority,
count-in, pause/seek/stop through the controller. Real browser tests exercise
Focus/Exit/Stop, 320px keyboard and reduced-motion states with no forbidden
requests or console/page errors. Human phone play-along remains distinct evidence.

Gates: RCH Bun focused tests and strict typecheck; RCH lint/boundaries and guarded
build; sequential real Node Playwright focused suite. Independent acceptance and
applicable U4/device gates remain open until executed; this document certifies none.
