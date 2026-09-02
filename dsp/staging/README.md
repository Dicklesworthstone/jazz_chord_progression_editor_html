# Staged Rust DSP Drafts

This directory contains standalone exploratory physical synthesis DSP drafts that are staged for future evaluation and not currently compiled into the shipping WebAssembly artifact (`dsp/concert-grand`).

## Staged Files and Owning Beads

1. **`flute_v3_physical_renderer.rs`**
   - **Owning Bead**: `jcpe-mnsc.5.2` (PHS3 Flute V3 measured-geometry physical model)
   - **Description**: Pearl PF-661 measured-geometry flute physical renderer draft (2,364 lines).
   - **Status**: Staged draft for PHS3 milestone evaluation.

2. **`plucked_string_improved.rs`**
   - **Owning Bead**: `jcpe-mnsc.6.2` (PHS4 Plucked string improved synthesis)
   - **Description**: Extended dual-polarization Karplus-Strong string model with body modes and non-linear pickup response (4,742 lines).
   - **Status**: Staged draft for PHS4 milestone evaluation.

3. **`trumpet_model_improved.rs`**
   - **Owning Bead**: `jcpe-mnsc.7.2` (PHS5 Trumpet physical synthesis model)
   - **Description**: Measured-bore acoustic brass model with non-linear lip reed dynamics (3,592 lines).
   - **Status**: Staged draft for PHS5 milestone evaluation.
