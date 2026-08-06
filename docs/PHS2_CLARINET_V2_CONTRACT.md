# PHS2 Clarinet v2 Contract

Status: proposed normative specification for `jcpe-mnsc.4.1`; it does not
claim production implementation or listening acceptance.

## Model and signs

Clarinet v2 is a monophonic, stateful phrase renderer coupling an
inward-striking single reed to a passive segmented cylindrical bore. Acoustic
pressure is positive compression. Volume flow is positive from mouth into
mouthpiece. `deltaPressurePa = mouthPressurePa - mouthpiecePressurePa`.
Positive reed displacement opens the channel; positive pressure difference
pushes the reed toward the lay and reduces displacement.

The reed obeys `m*x'' + r*x' + k*(x-h0) + F_collision(x) =
-area*deltaPressure`, in SI units. Flow for an open reed is
`width*x*sqrt(2*max(deltaPressure,0)/airDensity)`; reverse flow is explicitly
signed and bounded, never hidden by an absolute value. The lay is `x=0`.
Collision uses a passive Hunt-Crossley-style penalty with nonnegative damping;
penetration, injected collision energy, or a nonlinear residual outside the
certified tolerance refuses. The pressure/flow junction uses a bracketed,
iteration-bounded solve and reports iterations, bisections, residual, reed
opening, flow, and energy terms.

Tonguing is physical contact, not an amplitude envelope: tongue engagement
raises a bounded contact constraint against the reed, tongue release removes it
over a finite ramp, and the reed state continues. Breath and lip-pressure
changes do not reset reed or bore state. Detached attacks may clear only the
declared phrase state; legato events retain reed displacement/velocity, bore
traveling waves, loss filters, and radiation state.

## Bore and fingering

The resonator is a mouthpiece/barrel plus cylindrical joints, tone-hole lattice,
register vent, and bell. Each section and junction is passive in its reviewed
applicability range. Propagation includes frequency-dependent viscothermal loss
and fractional delay. Each tone hole has chimney length/radius, series inertance,
shunt radiation, and state `closed`, `open`, or a bounded continuous vent
fraction. The register vent is a separately identified small shunt. Bell and
open-hole radiation are frequency dependent. A fingering table maps a stable
fingering ID to explicit hole states and a concert-pitch applicability range;
pitch is an acceptance target, never used to silently retune the bore.

The first packet covers representative chalumeau, throat, clarion, and altissimo
fingerings. Vocal-tract impedance is deferred: v2 uses prescribed mouth
pressure and lip/reed controls and must label that omission in receipts.

## Controls and limits

Closed controls are mouth pressure (0..8000 Pa), lip force (0..5 N), reed
stiffness scale (0.5..2), equilibrium-opening scale (0.5..1.5), tongue contact
(0..1), tongue release (0..1), breath turbulence (0..0.08 relative RMS),
vibrato rate (0..8 Hz), vibrato pressure depth (0..0.08), and articulation
mode (`detached`, `legato`, `slur`). Values are explicit gesture curves; none is
derived from wall time.

One phrase has at most 128 events, 64 control points per curve, 256 total control
points per gesture, 24 bore sections, 24 tone holes, 8 nonlinear iterations and
16 fallback bisections per sample, 262144 bytes of state, and 30 seconds at up
to 96 kHz. Validation is fail-closed before rendering. Non-finite values,
unknown fingerings, invalid geometry, active non-passive junctions, state/sample
rate mismatch, or nonlinear nonconvergence produce named diagnostics.

## Independent acceptance

Independent fixtures do not import or sample production synthesis. They cover:
static reed equilibrium and lay contact; Bernoulli flow including zero and
reverse-pressure near misses; quarter-wave impedance peaks and odd resonance
spacing; representative fingering pitch; attack time; odd/even balance; HNR;
centroid; bandwise decay; chalumeau-to-clarion register transition; octave and
twelfth relations; exact state continuity across legato partitions; and
mutations of signs, units, bounds, tone-hole state, collision passivity, solver
budget, and state reset.

Pitch targets use cents, impedance peaks use Hz and Q, envelope time uses
seconds, spectral ratios use dB, and energy residuals use input-normalized
joules. Automated metrics cannot substitute for the owner listening matrix.
