# PHS4 Plucked String Family v2 Contract

Status: proposed normative specification for `jcpe-mnsc.6.1`; it does not claim production implementation or listening acceptance.

## Model and String Dynamics

The PHS4 physical modeling suite simulates the acoustic and electro-acoustic plucked-string family using bidirectional stiff strings with dual-polarization displacement and frequency-dependent losses coupled to a passive multiport bridge and resonant body plate.

1. **String Dynamics**: Each string simulates orthogonal horizontal and vertical transverse polarizations with stiff-string dispersion filters, internal viscoelastic damping, air resistance, and finger-fret contact constraints.
2. **Multiport Bridge**: A per-sample passive shared multiport junction couples all active and sympathetic strings to the body resonator. Work conservation is enforced: incident string energy equals reflected energy plus body mode energy change plus radiated sound and dissipation.
3. **Modal Body Resonator**: Discrete Kirchhoff-Love (DKT) plate mesh geometry yields mass-normalized coherent modal frequencies carrying signed bridge coupling residues $b_k = \phi^T f_{\text{bridge}}$ and radiation residues $r_k$.

## Recipe Targets and Packs

The contract covers five distinct instrument recipe targets differentiated solely by reviewed scale length, string tension, body mode tables, pickups, and amplifiers:

1. **Clean Archtop (`guitar`)**: Hollow-body archtop with floating bridge, steel strings, single neck pickup, and clean tube amplifier stage.
2. **Marshall-Class Electric (`blues-guitar`)**: Solid-body electric guitar with reverse-wound/reverse-polarity hum-cancelling bridge-middle pickups feeding an asymmetric triode overdrive amplifier and closed-back $4\times12$ speaker cabinet.
3. **Steel Dreadnought (`dreadnought-guitar`)**: Acoustic dreadnought with braced top plate, acoustic soundhole Helmholtz resonance ($\approx 100\text{ Hz}$), and bridge radiation.
4. **Nylon Ukulele (`ukulele`)**: Compact four-string re-entrant soprano/concert ukulele ($g_4, C_4, E_4, A_4$) with small body volume ($0.0032\text{ m}^3$) and high Helmholtz cavity mode ($\approx 189\text{ Hz}$).
5. **Physical Upright Bass (`physical-upright-bass`)**: Long scale ($1.05\text{ m}$), heavy hybrid pizzicato strings, low-frequency cavity resonance ($75\text{ Hz}$), and explicitly deferred arco bowing.

## Controls and Deterministic Limits

- **Closed Gesture Controls**: pluck force ($0 \dots 12\text{ N}$), pluck angle, pick position ($0 \dots 1$), fret finger pressure, slide velocity ($-4 \dots 4\text{ m/s}$), sympathetic coupling amount ($0 \dots 1$), and palm damping.
- **Deterministic Resource Limits**:
  - Maximum stem events: 128
  - Maximum strings: 12 (plus up to 12 sympathetic strings)
  - Maximum frets: 36
  - Maximum string delay: 65,536 samples
  - Maximum body modes: 64
  - Maximum contact iterations: 8
  - Maximum slide transient frames: 24,000
  - Maximum amplifier oversample factor: 4 (with 4-stage halfband filtering)
  - Maximum state allocation: 262,144 bytes
  - Maximum stem duration: 30 seconds at up to 96 kHz
