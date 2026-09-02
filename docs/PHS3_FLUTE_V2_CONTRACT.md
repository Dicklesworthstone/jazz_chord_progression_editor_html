# PHS3 Flute v2 Contract

Status: proposed normative specification for `jcpe-mnsc.5.1`; it does not claim production implementation or listening acceptance.

## Model and Physics

Flute v2 is a monophonic, stateful physical wind instrument renderer modeling a transverse flute (Pearl PF-661 measured geometry) with an air jet exciter coupled to a passive cylindrical/tapered acoustic bore and tone-hole lattice.

The jet exciter models:
1. **Jet convection delay**: distance from player's lips to the embouchure edge divided by jet convection velocity ($v_{jet} \approx 0.3 \cdot v_0$ to $0.5 \cdot v_0$), obeying frequency-dependent non-linear amplification across the lip opening.
2. **Non-linear jet-lip interaction**: non-linear sigmoid drive saturating at high blowing pressures, driving acoustic volume flow into the headjoint.
3. **Embouchure end correction**: variable acoustic impedance and inertance determined by the lip coverage fraction across the embouchure hole.

Detached attacks clear phrase transient state; legato events preserve headjoint traveling waves, jet delay lines, tone-hole shunt states, and acoustic radiation filters.

## Geometry and Fingering Lattice

The acoustic resonator models:
- Tapered parabolic headjoint section with cork stopper cavity termination.
- Cylindrical body and footjoint sections with measured wall viscothermal losses and fractional delay interpolation.
- Tone-hole lattice with up to 20 tone holes characterized by chimney height, inner radius, series inertance, and continuous key vent fraction ($0 = \text{closed}$, $1 = \text{open}$).
- Frequency-dependent open-end and tone-hole acoustic radiation filters.

A verified fingering table maps stable note IDs to acoustic hole configurations across low, middle, and altissimo registers. Pitch targets are acceptance criteria, never achieved via unphysical ad-hoc bore scaling.

## Controls and Deterministic Limits

- **Closed Gesture Controls**: blowing pressure (Pa), jet length (m), lip coverage fraction ($0 \dots 1$), breath noise RMS ($0 \dots 0.08$), vibrato frequency/depth, and articulation mode (`detached`, `legato`, `slur`).
- **Deterministic Resource Limits**:
  - Maximum events per phrase: 128
  - Maximum control points per curve: 64
  - Maximum control points per gesture: 256
  - Maximum bore sections: 32
  - Maximum tone holes: 20
  - Maximum jet delay: 8,192 samples
  - Maximum non-linear iterations: 8 (with up to 16 fallback bisections)
  - Maximum state allocation: 262,144 bytes
  - Maximum phrase duration: 30 seconds at up to 96 kHz
