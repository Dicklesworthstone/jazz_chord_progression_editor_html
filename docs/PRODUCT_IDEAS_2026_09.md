# Product ideas for the working Changes studio

Date: 2026-09-06 (New York). Source baseline: `658baddd620d2060d215280ec34efdb858be8bc3`.
Status: idea-wizard phases 1–6 completed, including four refinement passes. The owner authorized implementation of all fifteen ideas on 2026-09-06; execution is tracked below and in IMPLEMENTATION_TODO.md. This document itself certifies no runtime capability.

The strongest direction is to make a useful musical decision easy to hear, apply and undo. The studio already has substantial parsing, voicing, playback, recovery and import/export machinery. More of that power should be accessible through a small number of clear actions on the chart.

This pass reviewed the complete 495-record open/closed Beads inventory, read the relevant live issue context, AGENTS.md, README.md, architecture and rebuild contracts, both earlier idea-wizard documents, and current UI/application source. Earlier broad plans are preserved; this pass addresses the current working web studio. Apple capabilities remain under their existing owners and conformance work.

The rankings are design judgments grounded in those observations, not usage analytics, interviews or measured demand. Scores use the skill's ten dimensions, with usefulness/pragmatism weighted 2x and accretive value 1.5x. They describe a correctly implemented proposal, not the reliability of today's incomplete engines. Scope, overlap and dependencies decide which ideas survive; a high-scoring feature already shipped does not become new work.

Planning scope: the owner requested these ideas and their operationalization through idea-wizard. This document helps choose implementation order; it prevents duplicate work and proposals that silently lose exact data. Retire it as an active checklist when the selected Beads are completed or explicitly declined. It earns no implementation credit and changes no accepted release requirements.

## The best five

### 1. Play in the key you need

Select a chord, range, section or whole chart, choose **Transpose**, hear a preview, and apply one undoable change. A target-key action is separate from changing the analysis context. When the tonic is unknown, offer a spelled interval instead of inventing one.

This is the clearest everyday usefulness gap: the same chart becomes usable for another singer, instrument or practice key without re-entry. It also multiplies the usefulness of every reviewed example and the practice workflow. Preserve slash-bass spelling, alterations, exact durations and IDs; explicitly choose whether Manual/Frozen pitches transpose or remain exact.

There is existing H1 code to repair, not merely a hidden finished button to expose. Its recorded `C6/9/E`, Unicode and fractional-time counterexamples must pass before the UI ships. The new package owns only the application/preview/UI connection and depends on H1's existing specification and independent proof. Effort: medium, with a substantial correctness prerequisite.

### 2. Choose, hear and keep a voicing

Offer the current voicing and a few valid alternatives, with a short family/range description and **Hear**. **Keep this voicing** explicitly chooses Frozen; **Edit notes** enters Manual. Keep the full inspector and all supported choices available under disclosure.

This puts the project's strongest musical machinery directly in the musician's hands. The voice-leading engine can already make decisions; being able to select, audition and retain a result turns those decisions into an expressive tool. It also makes the difference between automatic optimization and a deliberate exact voicing understandable.

Extend U2/U6, whose scope already includes this. Reconcile the known U2 contract conflicts, preserve its active owner, and prove actual heard notes, ordered duplicates, all supported exact pitches, preview release and one-step Undo. The existing preview keyboard should be reused. Effort: medium; much of the musical foundation exists.

### 3. Practice this passage—with the band intact

Select the difficult bars and choose **Practice**. Start with the current key and tempo, a count-in and four passes. Put tempo progression and an explicit key sequence under More. Show which pass is playing and keep Stop reachable. The session leaves the source chart untouched.

This creates a reason to return to the studio daily. It joins chart authoring to an immediate musical job: work on the part that needs attention. A bounded sequence of repeated plans is more approachable than a practice dashboard or a grading system.

The current `playProgression` source documents a real seam: looped plans lose the band-sketch arrangement and fall back to literal chord playback. Preserving the chosen groove/bass/comp through loop boundaries is part of this proposal, with actual native-source proof. Build same-key rehearsal first; a separate key-sequence leaf depends on H1. The existing graded G9/U11 practice laboratory remains intact and separate. Effort: medium-large, with real transport work.

### 4. My Charts, with an honest portable backup

Give users an explicit local collection: find, rename, duplicate and reopen their charts. Provide **Download backup** and **Restore backup**, alongside ordinary per-chart JSON files. Label the collection **Kept in this browser**; browser recovery remains best-effort.

This makes the product a place to keep working. A growing personal collection supplies repeated value without accounts, a backend or cloud synchronization. Explicit file backup makes that collection portable and prevents local convenience from being mistaken for durable storage.

Reuse the existing validated documents, persistence and stop-and-replace lifecycle. Add a separate collection index with atomic publication, explicit same-ID conflicts, safe duplicate identity allocation and protection against stale writers. Failed quota/restore operations must preserve every prior chart. U5 verification is a prerequisite, not a requirement this new proposal erases. Effort: medium-large; the storage semantics matter more than the list UI.

### 5. Three audible next-chord choices

At the insertion point, show up to three genuinely different, law-valid possibilities. Each gets a short reason, **Preview** and **Insert**; More opens the complete bounded results and policy controls. Show fewer choices when fewer valid results exist.

This is the most compelling creative extension: the user hears possibilities exactly where they are composing. A small initial choice makes the theory approachable, while visible reasons and a larger optional result set preserve its depth. It also gives the reviewed library, context analysis and voice-leading engines a common useful destination.

Finish the existing G2/U8 path. The current next-option panel is a deliberately narrow substitute, and the deeper engine has unresolved semantic work. Do not rebrand that substitute as the full continuation engine or manufacture contrasting categories. Preview must leave the chart unchanged; Insert must preserve exact time and be one Undo. Effort: large, so it follows the necessary law/execution repairs.

## The next ten

| Rank | Idea | Why it adds value | First useful increment and ownership |
|---:|---|---|---|
| 6 | Share the exact chart you made | A teacher or arranger should send the chosen voicings and notes, not a reduced reconstruction. | Add a bounded lossless v2 fragment and exact-file fallback; keep v1 links readable. Current `studio-share.ts` explicitly omits Manual voicings, annotations and section names. |
| 7 | Compare Original and Variation | Hearing a controlled comparison makes a theoretical suggestion a practical choice. | Extend G5/U9 with the same passage, tempo, groove and instrument by default; show the literal diff and one Apply/Undo. |
| 8 | Hear and see the moving voices | Connect an audible result to an understandable musical reason. | Extend U3/U6 using actual registered notes, common tones and entering/leaving voices; provide voice audition and an equivalent note table. |
| 9 | Find a fragment by musical goal | “A minor turnaround” or “a pedal vamp” is a useful way to browse. | Extend G1/D0/U8 with goal filters, exact-duration previews and range insertion. Reuse reviewed material; the existing 250-seed D0 obligation remains. |
| 10 | Fix the exact chart-entry token | One syntax mistake should be easy to locate without retyping the draft. | Reuse the Library's existing prose/ranges in the command lane; activate an error to select its source span, then choose a repair. No automatic rewriting. |
| 11 | Focus chart | Make the lead sheet comfortable to read while playing. | One reversible presentation preference using the existing shell, with reachable Stop/Exit and all editing tools still available. |
| 12 | One-minute listening lessons | Teach a useful sound through an experiment inside the editor. | Extend D1 with reviewed miniature examples and “what to listen for”; keep subjective listening separate from G9/U11 objective grading. |
| 13 | Keep a bass or top note while varying harmony | Let the musician state the musical fact they care about most. | Extend G4/U9 with explicit registered pins and genuine all-slot constraint solving; never silently loosen a pin. |
| 14 | Connect sections in the available bars | Answer a concrete arranging problem with an exact destination and time budget. | Extend G3/U9 with an endpoint-first flow, contrasting legal routes and honest no-route/conflict results. |
| 15 | Review uncertain MIDI interpretations | Preserve trust when converting a performance into a chart. | Extend M1's existing Automatic/Advanced review with links from ambiguities to source notes/segments; reconcile its symmetric-input law before claiming certainty. |

All fifteen retain the offline deterministic product boundary. Search work and memory remain bounded; preview is nonmutating, changes require explicit Apply, and advanced functionality stays available without dominating the first interaction.

## All thirty candidates and disposition

The raw dimension scores follow the order Robustness, Reliability, Performance, Intuitiveness, User-friendliness, Ergonomics, Usefulness, Compelling value, Accretive value, Pragmatism. Weighted values are editorial estimates on a 1–5 scale, not product metrics.

| # | Candidate | Dimension scores | Weighted | Disposition and reasoning |
|---:|---|---|---:|---|
| 1 | Play in the key you need | 5/5/5/5/5/5/5/5/5/4 | 4.84 | Select: Medium: repair H1, then expose its real workflow. |
| 2 | Choose, hear and keep a voicing | 5/5/4/5/5/5/5/5/5/4 | 4.76 | Select: Medium: finish U2/U6; preserve the current owner and exact pitches. |
| 3 | Practice this passage with the band | 4/5/4/5/5/5/5/5/5/3 | 4.52 | Select: Medium-large: looped playback currently loses the band arrangement. |
| 4 | My Charts, with portable backup | 5/4/4/5/5/5/5/5/5/3 | 4.52 | Select: Medium-large: explicit multi-document storage and conflict handling. |
| 5 | Three audible next-chord choices | 4/4/4/5/5/5/5/5/5/3 | 4.44 | Select: Large: real G2 semantics and U8 integration still need completion. |
| 6 | Share the exact chart you made | 4/4/4/5/5/5/4/4/5/4 | 4.36 | Select: Medium: v1 currently omits exact voicings, annotations and section names. |
| 7 | Compare Original and Variation | 4/4/4/5/5/4/4/5/5/4 | 4.36 | Select: Medium-large: complete existing G5/U9; reuse safe audio ownership. |
| 8 | Hear and see the moving voices | 4/5/4/4/4/4/4/5/5/4 | 4.28 | Select: Medium: extend U3/U6 using registered, actually realized notes. |
| 9 | Find a fragment by musical goal | 4/5/4/4/4/5/4/4/5/4 | 4.28 | Select: Medium-large: reuse current reviewed library and G1/D0/U8. |
| 10 | Fix the exact chart-entry token | 5/5/5/4/4/4/4/4/4/4 | 4.24 | Select: Small-medium: reuse existing prose/ranges; add focus-to-repair. |
| 11 | An uncluttered Focus chart view | 4/5/5/5/4/4/4/4/4/4 | 4.24 | Select: Small-medium: compose existing shell rather than introduce more modes. |
| 12 | One-minute guided listening lessons | 4/4/4/4/4/4/4/5/4/4 | 4.08 | Select: Medium: reviewed examples and existing D1/U11, no subjective grading. |
| 13 | Keep a bass or top note while varying harmony | 4/4/3/4/4/4/4/5/5/3 | 3.96 | Select: Large: G4 must first satisfy every hard constraint at every slot. |
| 14 | Connect sections in exactly the available bars | 4/4/3/4/4/4/4/5/4/3 | 3.84 | Select: Large: real bounded G3 search, exact endpoints and time. |
| 15 | Review uncertain MIDI interpretations | 4/4/4/4/4/4/4/4/4/3 | 3.84 | Select: Large: reconcile M1 symmetry/tie law and extend existing Advanced review. |
| 16 | Print a rehearsal lead sheet | 4/5/5/5/4/4/4/4/4/4 | 4.24 | Defer: Useful, but print/PDF capability is explicitly deferred in the current release scope; first preserve the core editing/listening flow. |
| 17 | Ordered multi-chart setlists | 4/4/4/5/4/5/4/4/4/3 | 4.00 | Fold into My Charts later: Do not create a separate collection or promise seamless auto-transition audio. |
| 18 | All-key practice cycle | 4/4/4/5/5/5/4/4/4/3 | 4.08 | Fold into #1/#3: A separate rehearsal key-sequence leaf retains this feature without blocking same-key practice on H1. |
| 19 | Bass-only and guide-tone listening | 4/4/4/5/4/4/4/4/4/3 | 3.92 | Fold into #8/#3: Only solo actual supported plan roles; no claimed stem source the renderer does not expose. |
| 20 | A clickable chord-building palette | 5/5/5/5/5/5/4/4/4/5 | 4.64 | Already shipped: LibraryPanel and jcpe-8idn cover this; refine discovery rather than rebuild it. |
| 21 | Bar notes and annotation shortcuts | 5/5/5/4/4/4/4/3/4/4 | 4.16 | Fold into U2/#12: Existing U2 owns exact annotations; do not invent a second notes schema. |
| 22 | Harmonic-rhythm variations | 4/4/4/4/4/4/4/4/4/3 | 3.84 | Defer within G7: Useful after its exact-time laws and U10 integration are sound. |
| 23 | Whole-chart tonal journey overview | 4/4/4/4/4/4/4/4/4/3 | 3.84 | Defer within G0/U8: Keep plural context and fix H0/G0 first; the immediate entry point is stronger in #5/#9. |
| 24 | Find structurally similar progressions | 4/4/4/4/4/4/4/4/4/3 | 3.84 | Fold into #9 and existing G1/U8: Use real fingerprints, not a new semantic-search dependency. |
| 25 | A focused cadence-ending assistant | 4/4/4/5/4/4/4/4/4/3 | 3.92 | Fold into #5/#14 and G7: Choose an endpoint and exact time; avoid a separate competing suggestion panel. |
| 26 | Hide chords for recall practice | 4/4/4/4/4/4/4/4/4/3 | 3.84 | Fold into existing G9/U11: #3 is rehearsal; objective recall exercises still require the existing answer/rubric contract. |
| 27 | A much larger reviewed progression library | 4/4/4/4/4/4/4/4/4/3 | 3.84 | Existing D0 obligation: Improve finding and using the current material first; all250 reviewed seeds remain required by D0. |
| 28 | Concert versus transposing-instrument notation | 4/4/4/3/3/4/4/4/4/2 | 3.52 | Defer: Written-pitch display is distinct from changing sounding key; requires its own explicit contract. |
| 29 | Runtime AI composition chat | 2/2/2/3/3/3/4/5/1/1 | 2.52 | Reject: Breaks the offline deterministic product boundary and adds a second interaction language. |
| 30 | Accounts and automatic cloud synchronization | 3/3/3/4/4/4/4/4/2/1 | 3.04 | Reject: Violates the no-account/no-service boundary; #4 addresses returning to work locally. |

## Practical execution order

Product-value ranking is different from dependency readiness. Keep the current U5 and release liabilities visible and preserve existing assignees.

1. Finish U5's remaining lifecycle proof and repair H1/U2's known contract defects. Those foundations enable exact sharing, safe chart collections and reliable transposition/voicing controls.
2. The entry-repair and chart-focus specifications are small, independently useful starting points. Implement them only after their reviewed fixtures, preserving the current shell and input behavior.
3. Deliver the transposition workflow and selectable exact voicings as their existing engines pass independent proof. Add exact sharing and My Charts after U5.
4. Deliver same-key rehearsal with the real band arrangement; add the separately gated key sequence after H1. Do not hold the first rehearsal increment behind all of G9.
5. Finish the existing G2/G1/D0/U8 path, then build the deeper branch, pin and route interactions through their existing engines. Guided examples should accompany each actual capability.

This ordering preserves all planned functionality. A delivered increment does not close the parent while its remaining phases or advanced requirements are unfinished.

## Concrete Beads and remaining TODO

### Entry repair specification (2026-09-07 UTC)

The first implementation leaf uses T0's existing zero-based, end-exclusive
UTF-16 offsets directly with textarea selection APIs. Newline, flat glyph,
astral and combining-text fixtures live in `tests/fixtures/entry-repair.ts`.
No scalar-index conversion, trimming, normalization or second parser is allowed.
Both entry surfaces retain multiline text. A diagnostic action validates the
entire captured draft, range bounds and exact selected slice against the current
field before moving focus; an old diagnostic cannot act on a newer draft.

Activating an error selects its source characters and starts a local repair
session. Typing is the explicit draft edit; existing diagnostic prose gives
grammar-supported examples without guessing a replacement. **Keep repair** ends
the session without committing a chart. **Cancel repair** or Escape restores the
pre-repair draft and source selection. Escape is consumed during repair; outside
repair the existing Library Clear and command-dialog Close behavior remains.
Insert is still the sole whole-draft publication, followed by one exact Undo.
Clear explicitly abandons repair. A new diagnostic selection starts a new repair
from the current draft. No focus or selection effect runs on ordinary rerenders.

Composition start/end and keyboard `isComposing` suppress Enter/Escape and repair
actions while IME owns the field. Shift+Enter inserts a newline. Diagnostic rows
share the Library's complete prose vocabulary and fallback. The command lane
shows each resolved exact duration plus the existing insertion-plan label;
neither UI calculates a new approximate beat total. **Next error** cycles the
bounded diagnostic rows in source order, surfaces the matching explanation beside
the input and selects its source, including when recovered rows fill the preview allocation.
The existing 4096-code-point/16384-byte input limits and 2048-row preview bound
remain unchanged. Selection validation is linear only in the bounded draft;
navigation visits at most the current bounded token list. No audio, storage,
document schema, export marker or runtime network capability is added.

Proof: hand-authored selection/refusal fixtures and real controller tests,
followed by retry-free Chromium/Firefox/WebKit over file and loopback at desktop,
320x568 and390x844, with keyboard/IME, reduced motion and200% layout coverage.
The tests retain request and console/page-error diagnostics and compare actual
drafts and document/history before repair, after Insert and after Undo. These
are UI repairs, so musical transposition laws do not apply; original T0/U1
parser, limits and atomic-insertion regressions remain required.

Six new workflow packages contain 19 leaf tasks, including the separate rehearsal key-sequence leaf. The original ideation pass left them open and unassigned; implementation status now follows the checklist and live Beads. Existing feature work was refined through 13 comments on seven ownership groups, covering nine finalist ideas; the ideation pass did not rewrite existing titles, descriptions, priorities, statuses or assignees.

- [ ] **Transpose a chord, range, section or chart with an audible preview** — `jcpe-transpose-workflow-nazh`
  - [ ] Review specification and independent fixtures — `jcpe-transpose-workflow-nazh.1`
  - [ ] Implement the production workflow — `jcpe-transpose-workflow-nazh.2`
  - [ ] Complete independent real-adapter proof — `jcpe-transpose-workflow-nazh.3`
- [ ] **Practice a selected passage with intact accompaniment and bounded repetitions** — `jcpe-rehearsal-session-6y2b`
  - [ ] Review specification and independent fixtures — `jcpe-rehearsal-session-6y2b.1`
  - [ ] Implement the production workflow — `jcpe-rehearsal-session-6y2b.2`
  - [ ] Add the explicit transposed key sequence — `jcpe-rehearsal-session-6y2b.3`
  - [ ] Complete independent real-adapter proof — `jcpe-rehearsal-session-6y2b.4`
- [ ] **My Charts: an explicit local chart collection with portable backup** — `jcpe-my-charts-zt9z`
  - [ ] Review specification and independent fixtures — `jcpe-my-charts-zt9z.1`
  - [ ] Implement the production workflow — `jcpe-my-charts-zt9z.2`
  - [ ] Complete independent real-adapter proof — `jcpe-my-charts-zt9z.3`
- [ ] **Share the exact chart, including Manual/Frozen voicings and notes** — `jcpe-exact-share-1ric`
  - [ ] Review specification and independent fixtures — `jcpe-exact-share-1ric.1`
  - [ ] Implement the production workflow — `jcpe-exact-share-1ric.2`
  - [ ] Complete independent real-adapter proof — `jcpe-exact-share-1ric.3`
- [ ] **Repair a chart-entry error where it occurs without retyping the draft** — `jcpe-entry-repair-0h1g`
  - [x] Review specification and independent fixtures — `jcpe-entry-repair-0h1g.1` (solo packet review; implementation proof remains separate)
  - [ ] Implement the production workflow — `jcpe-entry-repair-0h1g.2`
  - [ ] Complete independent real-adapter proof — `jcpe-entry-repair-0h1g.3`
- [ ] **A reversible chart-focus view with reachable editing and transport** — `jcpe-chart-focus-7iz1`
  - [ ] Review specification and independent fixtures — `jcpe-chart-focus-7iz1.1`
  - [ ] Implement the production workflow — `jcpe-chart-focus-7iz1.2`
  - [ ] Complete independent real-adapter proof — `jcpe-chart-focus-7iz1.3`

Existing packages receiving the complementary details:

- Ideas 2: `jcpe-milestone-reliable-studio-l3a.11` — Choose, hear and keep a voicing.
- Ideas 2, 8: `jcpe-milestone-advanced-craft-ulj.10` — Make voicing choices and actual voice motion audible.
- Ideas 5, 9: `jcpe-milestone-musical-intelligence-qqy.9` — A few useful next chords and goal-based reusable fragments.
- Ideas 7, 13, 14: `jcpe-milestone-advanced-craft-ulj.12` — Hear a variation, preserve chosen outer voices, and connect sections.
- Ideas 8: `jcpe-milestone-musical-intelligence-qqy.8` — Explain one audible voice movement at a time.
- Ideas 12: `jcpe-milestone-advanced-craft-ulj.15` — One-minute listening lessons inside the working chart.
- Ideas 15: `jcpe-ionn` — Review the uncertain parts of a MIDI import without losing exact notes.

Every new leaf contains the user outcome, current source evidence, intended interaction, layer boundaries, risks, phase-specific work, independent fixtures and concrete unit/integration/browser proof locations. Spec and verify leaves also have feature-specific acceptance checklists. Proposed bounds require reviewed specification; they are not silently installed as new runtime limits.

## Four refinement passes

1. **Product scope and duplication:** read back all 25 new records, checked their source seams and existing owners, and removed an irrelevant rehearsal-only sentence from the other five epic descriptions.
2. **Dependencies:** bound transpose specification to repaired H1 specification; confirmed every build/verify chain and the separate key-sequence dependency. Same-key rehearsal does not depend on H1. Queried the current export path returned by `br info`, because bv's default discovery selected the historical base snapshot.
3. **Proof quality:** added concrete acceptance for repeated groove attacks, exact source offsets/IME, collection rename and conflicting writers, lossless-share limits/version caveats, and real small-viewport Stop/Exit behavior. No existing test or gate was weakened.
4. **Usability and completeness:** checked all fifteen ideas have ownership, all original advanced capabilities remain, and compact defaults do not manufacture musical results or hide unsupported operations. Read back the existing refinement comments and verified old record fields remain unchanged.

Final graph check: `bv --db <br-info-jsonl-path> --robot-insights` and `--robot-plan` succeed; 520 nodes, 574 blocking edges, zero cycles. `br ready --json` remains the claim authority. All tracker mutations used `br`, followed by `br sync --flush-only`.

No application code, generated artifact, tests, runtime dependencies or deployment changed during this ideation pass. The graph checks validate the plan structure; they do not prove that these proposed features work. This is solo design review, not independent product validation.
