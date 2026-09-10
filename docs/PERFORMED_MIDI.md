# Performed arrangement MIDI

COD3 / jcpe-6ujg.2. This adds an export mode; E1 literal export and its accepted
bytes remain unchanged. Initial supported groove: ballad-comp@1 in 4/4. A user
chooses the whole chart or one section, at most 16 written bars. The full source
has at most 128 chord events; the selected performance has at most 1,024 attacks
and 16,384 pitch occurrences. Refuse larger inputs before writing; never truncate.

Playback publishes explicit event/source/role provenance when it creates bass
and comp attacks. Export never parses event ID suffixes, infers roles from pitch,
or regenerates a different voicing. Capture the immutable performed plan using
the same compiler, continuity version and full-chart context as audition. Project
a selected section with the existing playback range operation. Its absolute ticks
are rebased once for the file. A section beginning inside a ringing event uses
the same restart/clipping law as section playback. Unsupported arrangements must
refuse rather than silently substitute a literal export.

SMF format 1, PPQ 960, exactly three tracks: conductor, Bass, Comp. Conductor
contains UTF-8 title, tempo rounded to nearest microsecond per quarter, 4/4 meter,
section and exact source chord markers. Report tempo rounding. Each pitch
occurrence keeps its performed note number, onset, gate and velocity. MIDI cannot
carry spelling as note data, browser instrument timbre/effects, indefinite loops
or count-in. Disclose those limits before delivery; markers retain source text.
No program change pretends to reproduce a browser instrument.

Use channels 0..15 except 9 (reserve General MIDI percussion channel 10).
Within each role allocate the lowest lane with no overlapping note at the same
pitch; release-before-attack at an identical tick permits reuse. Duplicate
occurrences remain distinct voices; different pitches can share a lane. Reserve
disjoint channel sets for Bass and Comp for the entire file, Bass lanes first.
This prevents ambiguous cross-track same-tick merging and lets a player assign
different instruments without one track changing the other's channel.

The sum of peak required lanes per role must fit 15 channels. Fifteen simultaneous
unisons in one role succeed; sixteen refuse. Two roles needing 8 lanes each also
refuse even if their peaks happen at different times: channels never migrate
between roles. No voice is dropped. Events within each track sort by tick,
note-off before note-on, then stable event/occurrence order. Every track ends at
the passage end. This role-separation amendment was found during implementation
before any writer output was accepted; the former cross-role reuse proposal could
make same-tick note pairing depend on a player's track merge order.

Validate all numeric mirrors before bytes: finite integer ticks, positive gates,
exact PPQ conversions, gate contained in duration/passage, note 0..127, velocity
1..127, chronological events, unique IDs and one matching provenance entry per
attack. Invalid/stale input produces no partial bytes. Text is 1..96 UTF-8 bytes
without controls; reject an invalid marker instead of silently repairing it.
VLQ values stay within 0x0fffffff. Retain at most 32,768 note messages plus bounded
metadata, and cap output at 1 MiB. Report deterministic attack/pitch/channel-check
and message counts; wall time never selects musical content.

Application preparation pins document identity/revision, range and groove. A
capacity-one registry owns private bytes and digest, checks identity after async
hashing and immediately before download, cancels stale preparation, and permits
one native download gesture. Reuse existing object-URL delivery accounting.
Preparation never changes chart/history/canonical Save state. UI only dispatches
application intents and renders results. Preview names range, groove, tracks,
notes, tempo loss and sound limitations; offers cancel, explicit download and
honest stale/refusal recovery.

Independent fixture cases.json is authored before implementation. Its tick and
channel expectations come from this law, not a writer output. Decode SMF with an
independent test reader: headers, track order, exact messages, release/attack tie,
overlapping unisons within/across roles, capacity refusal, fractional beats,
transposed pitches, malformed/nonintegral values and marker/tempo bytes. Kill
mutants for velocity flattening, gate shortening, unison collapse and reversed
release/attack ordering, alongside an unchanged success twin.

Build gates: RCH focused compiler/export/application tests, existing E1 and
performance regressions, full typecheck/lint and guarded build/size. Real Node
browser proof: select/prepare/cancel/stale/download, native downloaded bytes,
offline/no console errors and narrow keyboard layout. Independent acceptance
includes two external MIDI players/DAWs and applicable phone/device evidence;
automated decoding does not certify those human checks.
