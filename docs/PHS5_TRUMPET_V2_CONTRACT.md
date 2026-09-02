# PHS5 Trumpet v2 Contract

Status: proposed normative specification for `jcpe-mnsc.7.1`; it does not claim production implementation or listening acceptance.

## Model and Brass Acoustics

Trumpet v2 is a stateful monophonic physical brass instrument renderer modeling a player's lips coupled to a measured-bore acoustic waveguide with valve junctions, leadpipe, tuning slide, and expanding bell horn.

1. **Nonlinear Lip Exciter**: The player's lips are modeled as an outward-swinging two-mass / distributed lip reed obeying dynamic equations with mechanical mass, damping, stiffness, mouth overpressure, and local streamwise Bernoulli retraction forces:
   $$\Delta P = P_{\text{mouth}} - P_{\text{mouthpiece}}$$
   Positive pressure increases swinging opening displacement; flow through the lip aperture satisfies boundary conditions solved iteratively via bracketed Newton-Raphson line searches without divergence.
2. **Measured Bore & Valves**:
   - Mouthpiece cup, throat constriction, and backbore expansion.
   - Cylindrical valve casing with 3 discrete piston valves adding proportional acoustic loop tubing lengths ($V_1: 2\text{ semitones}$, $V_2: 1\text{ semitone}$, $V_3: 3\text{ semitones}$).
   - Bell flare modeled via Webster horn equation with spherical wave radiation and frequency-dependent reflection characteristics.

## Controls and Deterministic Limits

- **Closed Gesture Controls**: mouth blowing pressure ($0 \dots 12,000\text{ Pa}$), lip tension/mass parameter scaling ($0.5 \dots 2.0$), valve depression combinations ($0 \dots 7$), tongue articulation mode (`detached`, `legato`, `slur`), and mute insertion (open, straight, cup, harmon).
- **Deterministic Resource Limits**:
  - Maximum events per phrase: 128
  - Maximum points per curve: 64
  - Maximum bore sections: 48
  - Maximum valve junctions: 3
  - Maximum lip iterations per sample: 8 (up to 4 line search evaluations, 65 residual evaluations, 0 fallback bisections)
  - Maximum oversampling factor: 4
  - Maximum state allocation: 524,288 bytes
  - Maximum phrase duration: 30 seconds at up to 96 kHz
