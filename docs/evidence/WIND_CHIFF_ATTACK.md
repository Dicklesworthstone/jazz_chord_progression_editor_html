# Expressive Wind Chiff Attack Evidence

Date: 2026-08-06. Bead: `jcpe-dsp-wind-chiff-durp`.

The live gesture-aware flute and clarinet path now distinguishes connected
legato air from a tongued attack. New additive WASM exports carry the existing
eight-slot deterministic variation plus a closed articulation code. The older
legacy and seeded exports do not enter the new attack branch and retain their
previous behavior.

The tongued branch has three bounded pieces:

- a velocity-shaped 10--30 ms turbulence envelope;
- a flute 1--3 kHz or clarinet 650 Hz--2 kHz two-pole band-pass field, with
  direct injection never above 0.01;
- a short pressure overshoot clamped to 0.925 for flute and 0.915 for clarinet,
  after a 5--8 ms velocity-dependent tongue hold.

At MIDI 72, velocity 110, 48 kHz, slot 0, an independent 1,024-frame
(21.33 ms) FFT measurement found:

| Model | tongued/legato attack-band ratio | first-window correlation | sustain RMS ratio |
|---|---:|---:|---:|
| flute | 1.432 | 0.99157 | 1.00705 |
| clarinet | 1.097 | 0.89222 | 0.99950 |

The excess tongued band-energy peak, measured with independent 256-frame
windows at 128-frame hops, landed at 8.00 ms for flute and 5.33 ms for
clarinet. Both are inside the first 30 ms. At the soft and loud authored
endpoints, the 1,024-frame tongued-minus-legato band energy increased from
`6.099e-6` to `6.603e-6` for flute and from `-5.412e-4` to `1.371e-6` for
clarinet. The clarinet's negative soft endpoint is reported rather than hidden:
at velocity 30 its nonlinear bore onset contributes more energy in that band
on the legato path. The required velocity-110 endpoint is nevertheless ordered
above velocity 30, and the model's injected turbulence coefficient itself is
strictly velocity-monotone.

At 0.5 seconds, the tongued/legato sustain HNR pairs were 14.056/14.054 dB for
flute and 21.915/21.916 dB for clarinet; tuning was +1.206/+1.221 cents and
+0.705/+0.705 cents respectively. The existing independent register sweep also
remains the tuning authority; attack FFT pitch estimates are not treated as
sustain tuning evidence.

Verification receipts:

- Rust unit suite: 21 passed, 0 failed, including deterministic replay and
  unknown-articulation refusal at both expressive exports.
- Focused Bun physical suite: 42 passed, 0 failed, 341 assertions across chiff,
  vibrato, cache integration, ABI alignment, waveguide laws, and independent
  register tuning.
- Full non-browser Bun suite: 3,472 passed, 0 failed, 566,635 assertions across
  312 files in 896.70 seconds.
- `bun run typecheck` and `bun run lint` passed; lint inspected 190 files with
  zero findings.
- `bun scripts/build-dsp.ts --check` passed at 43,474 bytes, SHA-256
  `235aa69f73db62e5aaaed06c6a72c77923fcb56ac2056a3e09bc49deb1d44f26`.
- The guarded standalone build passed at 7,683,989 bytes, SHA-256
  `76ba64828b0ca7e2dd1f3b20d0600543ff56b6e331785276634d6a46600a0485`;
  the root artifact and `dist/index.html` are byte-identical.
- The cache integration proof renders exactly two buffers for otherwise equal
  tongued and legato gestures, then hits the tongued entry on repetition.
- The previous eight-slot variation bound remains eight within either
  articulation; articulation doubles the wind attack family to a maximum of
  sixteen variants per pitch/velocity/duration identity, never event count.

No listening panel or human realism judgment is claimed by these analytic
receipts.

Whole-crate `cargo fmt --check` remains red on unrelated pre-existing guitar,
physical ABI, SMF, analyzer, and concurrent tuning-format drift. The lines
introduced by this feature were manually reconciled to rustfmt's output; the
repository-wide formatting debt is not presented as a passing gate.
