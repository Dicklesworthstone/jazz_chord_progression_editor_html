# Staged Rust DSP Drafts (Dark Models — Not Compiled, Not Shipping)

Nothing in this directory is referenced by any build: `dsp/concert-grand`'s `lib.rs` declares no module here, `scripts/build-dsp.ts` reads only the crate, and no TypeScript, test, or gate imports these files. They are newer candidate physical synthesis DSP rewrites parked for their owning PHS build beads, staged under `dsp/staging` so unreferenced production DSP can never be mistaken for live crate source.

## Staged Files and Owning Beads

| File | Staged | Owning Bead | Live Counterpart | Description |
|---|---|---|---|---|
| `flute_v3_physical_renderer.rs` | 9fcf09f, 2026-08-12 | `jcpe-mnsc.5.2` (PHS3 build) | `dsp/concert-grand/src/flute_v3.rs` (dark, last touched 2026-08-09) | Pearl PF-661 measured-geometry flute physical renderer draft (2,364 lines). |
| `plucked_string_improved.rs` | c12669b, 2026-08-12 | `jcpe-mnsc.6.2` (PHS4 build) | `dsp/concert-grand/src/plucked_v2.rs` (SHIPPING, last touched 2026-08-10) | Extended dual-polarization Karplus-Strong string model with body modes and non-linear pickup response (4,742 lines). |
| `trumpet_model_improved.rs` | 19c8849, 2026-08-12 | `jcpe-mnsc.7.2` (PHS5 build) | `dsp/concert-grand/src/trumpet.rs` (dark, last touched 2026-08-10) | Measured-bore acoustic brass model with non-linear lip reed dynamics (3,592 lines, 582 lines larger than dark crate counterpart). |

## Integration Rules

Per the working agreement and `docs/DEPLOY_GATE.md`:

- Moving any of these into the crate is a build-bead task: wire it behind the `dark-models` feature, prove the shipping WASM payload hash is unchanged, and route nothing until the model has an accepting model-acceptance-ledger row.
- The plucked draft would replace a **shipping** module (`plucked_v2.rs`); that lands only through the full PHS4 build/verify legs with replayed release-gate evidence.
- Deleting a superseded draft is fine — git history preserves it; record the verdict in the owning bead.
