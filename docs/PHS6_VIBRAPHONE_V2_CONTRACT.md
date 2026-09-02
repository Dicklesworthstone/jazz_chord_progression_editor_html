# PHS6 Vibraphone v2 Contract

Status: proposed normative specification for `jcpe-mnsc.8.1`; it does not claim production implementation or listening acceptance.

## Model and Idiophone Acoustics

Vibraphone v2 simulates a 3-octave concert vibraphone ($F_3 \dots F_6$) consisting of tuned aluminum alloy bars suspended over tuned cylindrical resonator tubes with motor-driven rotating fan baffles.

1. **Undercut Free-Free Bar Dynamics**: Each bar is modeled as an undercut variable-thickness Euler-Bernoulli beam with free-free boundary conditions. The parabolic arch geometry tunes modal frequencies to exact harmonic ratios ($1 : 4 : 10$, fundamental, double octave, and tenth) with reviewed inharmonic higher modes.
2. **Mallet Impact Dynamics**: Compliant mallet contact modeled with Hertzian contact stiffness and non-linear power-law compression ($F_c = k \cdot \delta^{1.5}$). Contact loss occurs naturally without artificial energy injection.
3. **Resonator & Fan Tremolo**:
   - Quarter-wave closed-open cylindrical resonator tubes underneath each bar provide acoustic impedance amplification at the bar's fundamental frequency.
   - Rotating fan disks at resonator mouths modulate sound pressure radiation and radiation impedance amplitude continuously; fan rotation modulates amplitude and spectrum, never fundamental pitch.

## Controls and Deterministic Limits

- **Closed Gesture Controls**: mallet strike velocity ($0 \dots 5\text{ m/s}$), strike position along bar length ($0 = \text{node}, 1 = \text{center}$), mallet hardness / core density ($0 \dots 1$), damper pedal position ($0 = \text{fully damped}, 1 = \text{free}$), and fan motor speed ($0 \dots 12\text{ Hz}$).
- **Deterministic Resource Limits**:
  - Maximum events: 128
  - Maximum physical bars: 61 (up to 48 simultaneously active vibrating bars)
  - Maximum modal frequencies per bar: 12
  - Maximum frame modes: 16
  - Maximum contact iterations: 8
  - Maximum fan rotation frequency: 12 Hz
  - Maximum state allocation: 1,048,576 bytes
  - Maximum phrase duration: 30 seconds at up to 96 kHz
