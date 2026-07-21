# P0 Independent Trace Review

Package: P0 exact playback-plan compiler  
Evidence owner: `P0/verify`  
Human acceptance: accepted

## Purpose

This is the project-owner acceptance surface for the first P0 golden set. The
checked-in expectations were authored before the production compiler and state
`productionOutputUsed: false` and `expectedValuesGenerated: false`. Automated
evidence may prove that production matches those expectations; it may not turn
that match into a human musical/editorial endorsement.

The acceptance decision covers exact musical data and policy, not code style:
absolute beat placement, PPQ-960 mirrors, loop clipping, stored-pitch authority,
transposition spelling, refusal precedence, and inclusive resource ceilings.

## Technical review checklist

- [x] timeline and loop goldens
- [x] manual and frozen pitch authority
- [x] transposition spelling witness
- [x] refusal precedence
- [x] work and memory ceilings

These boxes may be checked only after the exact owner suite and
`bun run verify:p0-evidence` technical portion have been inspected. The project
owner changes `Human acceptance` to `accepted` only after reviewing the
following witnesses.

## Witnesses to inspect

1. `P0-TIME-001` through `P0-TIME-010`: meters, empty/partial measures,
   section-reset chronology, source identity, tempo extremes, and literal
   event projections.
2. `P0-LOOP-001` through `P0-LOOP-014`: null/full loops, half-open boundary
   exclusion, start restart, end clipping, both-boundary clipping, silent
   ranges, and invalid ranges without repair.
3. `P0-REAL-002`, `P0-REAL-003`, `P0-LAW-005`, and `L-VOICE-01`: deliberately
   unsorted, doubled, enharmonically explicit Manual/Frozen pitches remain in
   exact source order and octave.
4. `P0-LAW-004`: C-major-seven to D-major-seven whole-step transposition keeps
   identity/timing fixed while exact spellings become D, A, C-sharp, F-sharp;
   the enharmonic near miss must fail written-spelling equality.
5. All typed refusal cases and all 16 exact/maximum-plus-one counter seams:
   one precedence-winning refusal, no fallback, no partial plan, and no
   wall-time semantic cutoff.

## Evidence interpretation

- The 42 reviewed controls are executed as explicit semantic
  counterfactuals. The ledger must say `sourceMutantsExecuted: 0`; it must not
  imply that 42 patched compiler binaries were built.
- Browser, accessibility, storage, real audio rendering/listening,
  cancellation, resume, and revision-token behavior are not P0 operations.
  Their owners are recorded in the P0 applicability matrix.
- The shared-consumer proof is a frozen value-handoff contract. It does not
  claim that downstream X1 audio scheduling or E1 MIDI serialization is already
  implemented.
- Wall time and resource usage are observations only. Exact work and memory
  counters are the musical termination authority.

## Acceptance record

Accepted by the project owner through an explicit instruction on 2026-07-17
and reaffirmed on 2026-07-18, after review of the checklist and named witnesses
above. This acceptance is limited to the P0 golden packet and does not waive
any downstream package, independent-proof, or release gate.
