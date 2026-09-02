# PHS7 Whole-System Physical Synthesis Acceptance Contract

Status: proposed normative specification for `jcpe-mnsc.9.1`; it governs multi-rate acoustic proof, listening acceptance rubrics, and release gate verification.

## Cross-Instrument Verification Matrix

The physical synthesis suite verifies all 9 physical and hybrid model targets:
1. `clarinet` (PHS2 single reed / cylindrical bore)
2. `flute` (PHS3 transverse jet / headjoint)
3. `clean-archtop` (PHS4 hollow-body jazz guitar)
4. `steel-dreadnought` (PHS4 acoustic guitar)
5. `lightly-driven-electric` (PHS4 solid-body overdrive electric guitar)
6. `ukulele` (PHS4 nylon re-entrant ukulele)
7. `physical-upright-bass` (PHS4 pizzicato acoustic bass)
8. `trumpet` (PHS5 brass lip reed / bell horn)
9. `physical-vibraphone` (PHS6 free-free undercut bar / fan tremolo)

Each instrument is tested across 3 sample rates (44.1 kHz, 48 kHz, 96 kHz) and 3 register pitch anchors (low, middle, high), forming an 81-cell exhaustive measurement matrix.

## Whole-System Laws & Release Invariants

1. **Deterministic Execution**:
   - Bit-identical audio rendering across multiple runs under identical seeds and plans.
   - Wall time performance variation does not affect generated sample values or musical event timing.
2. **Resource & Bundle Budgets**:
   - Single-file standalone HTML distribution size $\le 9\text{ MiB}$ ($9,437,184\text{ bytes}$).
   - Compiled WebAssembly DSP binary $\le 256\text{ KiB}$ ($262,144\text{ bytes}$).
3. **Transport & Safety Guarantees**:
   - Hard Stop guarantee: serialized Stop command silences all sounding physical resonators within $<80\text{ ms}$ without clicks or residual oscillation.
   - No-network guarantee: all synthesis algorithms, tables, and samples are bundled offline; zero remote CDN or telemetry calls.
4. **Independent Evidence & Verification**:
   - Real browser matrix across Chromium, Firefox, and WebKit (workers = 1, retries = 0).
   - Human listening evaluation protocol across 6 blinded comparison rows with 12 recorded environmental fields (agent fabrication strictly prohibited).
