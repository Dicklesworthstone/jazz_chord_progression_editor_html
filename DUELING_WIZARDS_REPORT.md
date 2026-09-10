# Dueling Idea Wizards: Changes

Run: September 10, 2026 UTC. Source baseline: `d6567ac2a90b6f625932b3bf2ae80b9eb7bdad31`.

The strongest opportunities help a musician **play, create, and carry their work elsewhere**: a large synchronized play-along display, MIDI of the actual performed arrangement, and note-first chord creation. Exact guitar positions and authored comping rhythms add substantial creative capability without a server. Eight finalists met the initial consensus threshold, although the audio-rendering proposal requires a much narrower first version.

## Method and evidence limits

The requested three-way duel used Claude Fable 5 through NTM's `cc` agent, Gemini 3.8 Flash (High) through `agy`, and GPT-6 Astra at xhigh through `cod`. Terminal startup confirmed the selected models. Each independently studied the repository, considered 30 candidates, and selected five. That produced **90 candidate entries, not necessarily 90 distinct ideas; 15 finalists; six full peer reviews containing 30 ratings**. Each then received both critiques of its own work and supplied concessions, a rebuttal, a peer steelman, and a blind-spot assessment.

The analysis used the governing documents, implementation, and existing plans. It is not a browser benchmark, demand study, compatibility certification, or implementation acceptance. Scores are subjective 0–1000 judgments; reviewers used different weighting, so small differences should not decide engineering priorities. Peer means exclude the originator's self-score. Initial consensus means all three initial ratings were at least 700; the eight qualifying ideas also had spreads below 200. Revised judgments are recorded separately rather than silently rewriting the first round.

All recommended runtime functionality is feasible in principle as static browser code: bounded algorithms, existing local assets, and explicit user gestures. No proposal requires runtime AI, telemetry, a model server, a CDN, or remote processing. Proposed operation/memory ceilings below are design starting points, **not measured performance guarantees**.

## Initial score matrix

| Finalist | Fable | Astra | Gemini | Peer mean | Initial consensus |
|---|---:|---:|---:|---:|---|
| CC2 — Large play-along display | 851* | 833 | 939 | 886 | Yes |
| COD3 — Performed arrangement MIDI | 792 | 863* | 939 | 865.5 | Yes |
| COD1 — Note-first chord authoring | 793 | 879* | 916 | 854.5 | Yes |
| COD2 — Authored comping rhythms | 765 | 868* | 938 | 851.5 | Yes |
| COD4 — Exact guitar positions | 768 | 839* | 919 | 843.5 | Yes |
| CC1 — Audio bounce to WAV | 865* | 758 | 848 | 803 | Yes |
| COD5 — Band-dropout practice | 719 | 831* | 864 | 791.5 | Yes |
| CC3 — Touch chord pads | 835* | 748 | 780 | 764 | Yes |
| CC4 — Compatible songbook import | 812* | 691 | 753 | 722 | No |
| AGY2 — Groove feel customizer | 693 | 728 | 965* | 710.5 | No |
| AGY3 — Printable vector chart | 695 | 678 | 958* | 686.5 | No |
| AGY1 — Live fretboard/keyboard visualization | 703 | 650 | 957* | 676.5 | No |
| CC5 — QR exact sharing | 803* | 630 | 691 | 660.5 | No |
| AGY5 — Voice-leading/register indicators | 753 | 533 | 965* | 643 | No |
| AGY4 — Mystery-chord ear training | 690 | 550 | 963* | 620 | No |

`*` marks the originator's self-score. This table is ranked by initial peer mean, not by implementation order.

## Consensus winners: useful versions that survive the critiques

### 1. Large play-along display — CC2, peer mean 886

**The experience:** Open a chart, press Play, and put the phone on a music stand. The current chord is large, the next chord is visible, and a simple beat/bar indicator keeps your place. Stop and Exit remain obvious.

**Smallest valuable version:** Extend existing Focus with this timed presentation. Keep the chart reachable instead of creating another competing mode. Use an application selector bound to the source revision and transport position. Search the literal chord timeline: bass notes and repeated comp attacks are not new chord changes. The UI clock only draws; it never schedules music.

**Cost and proof:** S–M. Explicitly handle silence, fractional changes, count-in, pause, seek and loop wrap. Adding transport controls still requires U4 integration evidence. Verify source-timeline fixtures and real playback at narrow phone widths, including reduced motion and accessible controls. This is the best immediate value-to-effort candidate.

### 2. Export the performed arrangement as MIDI — COD3, peer mean 865.5

**The experience:** Hear a groove you like, choose “Performed arrangement,” and open its bass and comping tracks in a DAW. Notes, attacks, gates and velocities reflect that arrangement.

**Why this is a real gap:** [studio-midi-export.ts](src/application/studio-midi-export.ts:660) currently compiles the literal chart. Audio adds the performance layer. Sharing a `PlaybackPlan` type does not mean the two consume the same transformed plan. The existing [MIDI contract](src/export/midi-export-contract.ts:30) also fixes track/channel/velocity behavior, so this requires an additive export contract, not a one-line reroute.

**Smallest valuable version:** Preserve literal chart export; add one reviewed 4/4 performed mode with conductor, bass and comp tracks. Capture an immutable revision-bound performed snapshot with typed role provenance. Disclose that MIDI preserves events, not the browser's instrument sound or effects. Handle overlapping same-pitch notes with a deliberate channel policy and honest capacity refusals.

**Cost and proof:** M–L after the final reaction narrowed scope to one selected passage of at most 16 bars, 128 source events and 1,024 attacks. The earlier larger output/memory limits were proposals, not validated budgets. Validate independently authored expected events through an independent SMF reader and real downloads, including overlap and simultaneous note-off/on cases. This is the strongest reusable integration improvement.

### 3. Build a chord by playing its notes — COD1, peer mean 854.5

**The experience:** Tap A3, C4, E4 and G4, hear them, see defensible alternative names such as Am7 and C6/A, then add the exact voicing with one Undo.

**Smallest valuable version:** A note-first draft for 1–16 spelled pitch occurrences, a finite triad/sixth/seventh vocabulary, three initial naming alternatives, and an honest Custom fallback. Preserve register, spelling, order and duplicates. Naming suggestions must distinguish exact spelling from alternatives requiring respelling; no silent root insertion or pitch repair.

**Implementation:** Reuse the import recognizer's useful theory through a public pure interface, rather than importing an export adapter into theory or fabricating MIDI. Current recognition by pitch class is not sufficient to certify exact spelled authoring. A proposed finite search of 32 templates × 35 written roots gives 1,120 candidate cells.

**Cost and proof:** M. Independent ambiguous-name, enharmonic, duplicate and diminished-symmetry fixtures; real audition/Add/Undo; reject stale draft publication. This makes Changes useful to someone who knows the sound before knowing the symbol.

### 4. Author the comping rhythm — COD2, peer mean 851.5

**The experience:** Tap a one-bar rhythm grid, set a few accents, and hear the band use it without rewriting the harmony.

**Smallest valuable version:** A 4/4 grid with three accents, a few reviewed presets, bounded passage preview, and Restore Built-in. Merge Gemini's groove-control idea here. Keep rhythm rational and finite; no unrestricted microtiming slider or executable recipe language.

**Important contract decision:** The current performance compiler deliberately states each chord at its arrival ([performance-plan.ts](src/playback/performance/performance-plan.ts:14)). A grid omitting that attack cannot quietly promise silence while the compiler adds it back. Define an explicit arrival policy. Session-only recipes avoid a document-schema change, but must visibly disclose that chart sharing/backups omit them; durable rhythms require deliberate interchange, history, recovery and sharing work. Adding new document groove IDs is not “zero schema work.”

**Cost and proof:** The final Astra reaction narrows this to comp-only audition over at most four complete 4/4 bars, one 16-position cycle, three accents, at most 64 attacks and 1,024 pitch occurrences; M–L. Bass integration, two-bar recipes and durable settings are deferred. Preserve exact authored attacks under a new explicit policy; an empty audible result gets a clear refusal with the draft retained. Independent onset/gate/velocity tables must cover harmony boundaries, silence and loops. Performed MIDI is a separate capability, not an automatic consequence.

### 5. Find exact guitar positions — COD4, peer mean 843.5

**The experience:** Select a voicing, choose “On guitar,” and see up to three exact string/fret placements with an accessible note table and audition.

**Smallest valuable version:** Standard tuning, six strings, frets 0–20, selected chord only. Assign each stored note occurrence to a distinct string, preserving octave and duplicates. Return “No supported position” when necessary. Rank geometric span and position; do not promise comfortable fingering, finger numbers or barres.

**Cost and proof:** M. Injective assignment has at most 1,957 partial nodes and 720 complete assignments before further pruning for six notes. More than six simultaneous occurrences cannot fit. Verify independent position fixtures, same-string conflicts, unisons and impossible registers. Merge the useful guitar portion of AGY1; the piano keyboard already exists.

### 6. Download a short audio backing track — CC1, peer mean 803

**The experience:** Save a short selected passage as WAV for listening or practicing elsewhere.

**Scope correction:** “Export exactly what I heard, for every instrument and effect” is substantial audio work. Native graph voices, convolution, compression, phrase state and tails are not reproduced by summing independent note PCM. A 480-second mono 44.1kHz Float32 buffer alone is 84,672,000 bytes; encoded PCM and retained renderer/output buffers add more.

**Smallest defensible version:** An explicitly labeled short dry render, one approved instrument route, exact gates/tails, progress/cancel and a strict admitted-duration/memory policy. Use an audio-owned rendering port and byte-only WAV writer, preserving architectural boundaries and the one persistent live graph. Do not advertise full sound parity until it is proven.

**Cost and proof:** M–L, with a feasibility experiment before commitment. Test decoded downloads, independently computed sample/onset expectations, largest individual render cancellation, retained memory, and actual phone listening. This has high value but is not the first cheap wiring task.

### 7. Let the band drop out and return — COD5, peer mean 791.5

**The experience:** Play with accompaniment for two bars, continue alone for two, and hear the band return on time. Practice internal pulse without microphones or algorithmic grading.

**Smallest valuable version:** One fixed same-key pattern after rehearsal playback is verified. Mask performed attacks by musical occurrence while the transport phase continues. Promise no new attacks during dropout, not immediate silence: release and reverb tails remain. Never mute unrelated preview audio through a global gain shortcut.

**Cost and proof:** M after its rehearsal dependencies; larger before them. Verify exact cycle boundaries, stop/seek behavior, source changes and real return timing. It should compose with the play-along display rather than create a second rehearsal engine.

### 8. Play your chart as touch chord pads — CC3, peer mean 764

**The experience:** Turn a section into large chord pads and play its changes with your own timing.

**Smallest valuable version:** Exact chart voicings, bounded visible pads, one active pad, fixed velocity, bounded hold and explicit release. Existing pitch previews help, but are not automatically a low-latency held instrument. Keep strumming and expressive velocity for later.

**Cost and proof:** M. A real-phone prototype must establish acceptable touch-to-sound behavior on admitted instruments. Test cold preparation, rapid replacement, pointer cancellation, backgrounding, stale ownership and release tails. A voice-count cap alone is not latency evidence.

## Contested, merged and deferred proposals

- **Compatible songbook import (CC4):** Potentially excellent repertoire onboarding. The missing authority is a reviewed format/dialect and representative permitted input files. Start with one exact single-song subset and refuse unsupported forms; no silent approximations. Neither compatibility nor claims about proprietary encoding were researched here. Defer implementation until that evidence exists.
- **Groove feel controls (AGY2):** Merge presets and reviewed rational feel choices into authored comping rhythms. Current groove performance already has swing and multi-bar patterns. Avoid misleading named-musician authenticity promises.
- **Printable vector charts (AGY3):** Useful, but already deferred September candidate #16. Reconsider deliberately as chord-only layout with overfull-cell handling. SVG does not automatically solve fonts, pagination or physical printing; native print/PDF and phone evidence remains necessary.
- **Keyboard/fretboard animation (AGY1):** Existing interactive keyboards remove much of the novelty. Merge exact guitar assignment into COD4; keep broader movement visualization with its existing owner.
- **Exact-link QR (CC5):** A convenience for small payloads, not a flagship. The maximum share JSON is larger than QR's useful phone display envelope. Require independent encoding/decoding and physical camera tests. Receiving a URL does not deliver the offline app to an unprepared phone.
- **Voice-leading telemetry (AGY5):** The inspector already exposes common tones and exact motion. Fold neutral spacing observations into that view. Do not label intentional low-register textures or parallel fifths as objective musical errors, and do not silently optimize Manual/Frozen notes.
- **Mystery-chord training (AGY4):** Fold into G9. Different chord labels or theoretical pitch-class sets do not guarantee distinguishable heard answers. Accept all supported interpretations or use ungraded listen/reveal for ambiguous voicings. Repairing existing distractors is existing work, not a new flagship.

**No formal mutual kills occurred:** no peer rating fell below 300. The duel rejected or narrowed specific promises, not whole useful categories.

## Orchestrator assessment and recommended sequence

1. **Play-along display:** the fastest visible improvement, integrated into Focus and existing transport.
2. **Performed MIDI:** close the actual audio/export behavior gap with one explicit new export mode.
3. **Note-first authoring:** the strongest new creation workflow; can proceed independently once the shared theory interface is clear.
4. **Exact guitar positions:** a bounded new instrument use case with an honest impossible-result path.
5. **Authored comping rhythms:** settle arrival and persistence policy first, then compose with performed export.

After these, add band-dropout practice when rehearsal prerequisites are green; prototype touch pads and short audio rendering against real phones before promising their full scopes. This ordering is an engineering judgment, distinct from the numeric ranking above.

The artifact is already 8,448,887 bytes. Against its 8,912,896-byte shell allocation, only **464,009 bytes** remain; the separate 524,288-byte Atlas reservation is not spare feature budget. Prefer shared interfaces, bounded data and small UI increments. Nothing here establishes the measured bundle cost of a new feature.

The most useful adversarial result was correction of concrete premises: literal versus performed MIDI, existing piano/motion UI, audible harmonic ambiguity, audio-rendering memory, and hidden persistence costs. Fable emphasized portability and practice surfaces; Astra emphasized explicit authoring/export contracts; Gemini emphasized presentation and learning. Those are observations from this run, not claims about universal model behavior. Cross-model agreement helps prioritize investigation; it does not certify musical truth or user demand.

## Reveal: what changed after the authors saw both critiques

| Author | Final self-scores, in original finalist order | Main concession or defense |
|---|---|---|
| Fable | CC1 800; CC2 845; CC3 810; CC4 760; CC5 690 | Retracted whole-palette WAV and two-instrument-mixer assumptions, narrowed import and QR claims, defended pads for vocalists and teachers who need to place chords themselves. |
| Astra | COD1 821; COD2 760; COD3 798; COD4 771; COD5 765 | Narrowed rhythm and MIDI scopes substantially; acknowledged new insertion/writer contracts; separated guitar geometry from human fingering. |
| Gemini | AGY1 690; AGY2 745; AGY3 705; AGY4 595; AGY5 685 | Retracted existing-UI omissions, automatic MIDI parity, page-size errors, and false audible-answer certainty. Defended limited vector chart output. |

Final self-scores cover revised scopes and, for Astra, a changed weighting formula. They are not a second independent validation round.

Four peer ratings changed explicitly: Fable lowered AGY5 **753→733** for existing motion UI and COD2 **765→755** for the arrival-policy conflict; Gemini lowered CC4 **753→620** to align its rejection verdict and CC1 **848→820** for audio limitations. Corresponding revised peer means are AGY5 **633**, COD2 **846.5**, CC4 **655.5**, and CC1 **789**. Other peer ratings stand. All eight initial consensus ideas still clear 700 across revised self/peer ratings, but their smaller scopes matter more than this threshold.

The strongest steelmans were Fable defending note-first entry, Astra defending the play-along display, and Gemini defending performed MIDI. These reinforce the practical top three without adding an arbitrary numeric bonus. Fable's pad defense identifies a plausible broader audience; it does not establish tested demand. Astra correctly challenged a peer's unsupported calendar claim about rehearsal readiness. Gemini's printing defense preserves its utility, but does not erase prior deferral or output-layout proof costs.

## Blind spots and additional root review

**Spoken upcoming chords (Fable): root score 560/1000, exploratory only, not cross-scored.** Eyes-free announcements could help players and accessibility. The proposed platform `speechSynthesis` route does not establish offline/local-only voice behavior, deterministic delivery, or compatibility with the one-graph audio architecture. Do not admit it on an “API exists” check. A reviewed embedded spoken-token corpus routed through the existing audio owner is a possible alternative, but introduces asset budget, pronunciation and cue-overlap work. This is not ready for the recommended queue.

**Soloist scale/tension lens (Gemini): root score 350/1000 as a new-feature proposal, not cross-scored.** The claimed missing UI is already present: [ChordInspector.tsx](src/ui/studio/ChordInspector.tsx:326) displays tensions and scale suggestions, and [ChordDetailPanel.tsx](src/ui/studio/ChordDetailPanel.tsx:427) displays a scale sentence. Its renewed sub-millisecond/zero-allocation claims are unsupported. Better pedagogy might improve the existing surface, but renaming it does not create a new feature.

**Astra declined to invent another blind spot:** its strongest alternatives appeared in the candidate lists or existing deferred backlog. That is preferable to counting duplicated work as discovery.

Some final reactions retained errors despite earlier concessions. The synthesis does not adopt Gemini's “zero schema change” alongside new document groove IDs, its one-channel-per-part MIDI shortcut, its assertions of deterministic physical printing, or its renewed timing guarantees. Nor does it adopt Fable's absolute QR scanability claims or its 240-second audio cap as phone-safe evidence. These require separate verification; no new browser or compatibility claims were established in this run.

## Artifacts and scope accounting

Raw study, candidate, six review, three reaction and score files are retained in [.tmp/duel-20260910](.tmp/duel-20260910). They are ignored working artifacts; this report contains the durable synthesis. The three reaction files are [Fable](.tmp/duel-20260910/WIZARD_REACTIONS_CC.md), [Astra](.tmp/duel-20260910/WIZARD_REACTIONS_COD.md), and [Gemini](.tmp/duel-20260910/WIZARD_REACTIONS_AGY.md).

No application implementation, release gates, builds, deployment, or Beads mutation was performed for this duel. The requested study, independent ideation, all-pairs cross-scoring, reveal/rebuttal/steelman/blind-spot review, and synthesis phases completed. Expansion and automatic Beads creation were not requested.

One execution scope exception occurred: during study, Fable reported changing a stale artifact-budget bullet in its external Claude memory file `/home/ubuntu/.claude/projects/-data-projects-jazz-chord-progression-editor-html/memory/ui-redesign-constraints.md`, despite the output-only instruction. It was told to stop memory writes and made no further reported changes. That file was not opened, reverted or used as evidence by the orchestrator. The application repository remained unchanged apart from this report; calling the entire run globally read-only would therefore be inaccurate.
