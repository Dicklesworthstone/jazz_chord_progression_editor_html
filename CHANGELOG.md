# Changelog

All notable changes to the Jazz Chord Progression Editor are documented here. This project has no formal releases or tags; changes are organized chronologically by capability area.

Repository: [jazz_chord_progression_editor_html](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html)

---

## 2026-09-02 -- Native iOS App, Multi-Instrument Audio Verification, and Architecture Polish

### Native iOS Companion (FrankenJazz)

- Shipped native SwiftUI companion app for iOS and macOS Catalyst with offline document playback, dynamic type scaling, accessibility Reduce Motion gating, and share-sheet interchange.
- Implemented offline SMF MIDI file importing with running-status handling, pitch-class quantizing, and chord recognition.

### Web Audio & Multi-Instrument Real-Browser Verification

- Validated real-browser playback across all 15 selectable synthesizer, physical waveguide, and acoustic presets in automated headless loopback test harnesses.
- Relocated and cataloged experimental physical synthesis Rust drafts (`flute_v3`, `plucked_string_improved`, `trumpet_model_improved`) into `dsp/staging/` bound to their owning milestone beads.

---

## 2026-08-20 -- Physical Synthesis DSP Engine & Acoustic Space

### Physical Synthesis & WASM Engine

- Integrated WebAssembly + SIMD physical synthesis engine (`dsp/concert-grand`) featuring Pearl PF-661 flute waveguides, acoustic clarinet bore/reed models, concert grand piano physical models, and plucked string instruments.
- Built multi-rate autocorrelation tuning verification suites (44.1 kHz, 48 kHz, 96 kHz) and pitch-lock validation.
- Implemented stage spatialization, decorrelated stereophonic image width, and single-instance master early-reflection modeling.

---

## 2026-08-10 -- V2 Ink-on-Paper Studio Redesign

### User Experience & Real Book Aesthetics

- Shipped complete "Ink-on-Paper" Real Book visual overhaul with high-contrast typography, hairline measure borders, and responsive desktop/tablet/mobile layouts.
- Added quick-entry lead sheet text parser with plain-English grammar diagnostics (`DIAGNOSTIC_PROSE`) and touch-friendly measure slot manipulation (`+`/`−`).
- Implemented live spectral audio analyzer and harmonic alignment display.

---

## 2026-07-28 -- MIDI Interchange, Workflow, and URL Sharing

### Interchange & Formats

- Built Standard MIDI File (SMF Type 0/1) export engine (E1) with structured loss disclosure, track channel allocation, and lyric/chord marker emission.
- Added client-side lossless URL fragment sharing (`#data=...`) using compact base64url payload encoding with zero server storage.
- Shipped local MIDI file intake workflow with track selection, chord recognition, and interactive preview diffs.

---

## 2026-07-11 -- Ground-Up Deterministic Rebuild Architecture

### Core Architecture & Foundation

- Executed ground-up zero-network offline rewrite with Preact as the sole production dependency.
- Enforced strict unidirectional layered architecture: `domain` (exact rational musical time `RationalDuration`) $\to$ `theory` (pure voice leading, guide-tone subsetting) $\to$ `playback` $\to$ `audio` / `export` / `persistence` $\to$ `application` $\to$ `ui`.
- Built single persistent Web Audio graph architecture (X0/X1) with zero runtime GC spikes and lookahead event scheduling.

---

## 2026-02-21 -- License and Social Preview

### License

- Updated license from plain MIT to MIT with OpenAI/Anthropic Rider, restricting use by OpenAI, Anthropic, and their affiliates without express written permission from Jeffrey Emanuel ([`addeb65`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/addeb65af993ecda705472e97bed0a2bd72861c5))

### Repository Metadata

- Added GitHub social preview image (1280x640 PNG) for consistent link previews when sharing the repository URL ([`a01a83c`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/a01a83c283c0ff8fd05e2fe91fe8146348bf4b86))

---

## 2026-01-21 -- Initial License

- Added MIT License (Copyright 2026 Jeffrey Emanuel) ([`924fa52`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/924fa52a552391ff70d5aa01cb2b6f5109b11f67))

---

## 2025-03-17 -- Audio Engine Overhaul, Advanced Voicing, and Mobile Support

This date saw intensive development across audio, UI, and mobile responsiveness. The application grew from 5,503 to 8,201 lines. Changes are grouped by capability rather than chronological commit order.

### Audio Engine and Synthesis

- Introduced instrument-specific audio pipelines: Moog-style synth with sawtooth oscillator, lowpass filter (2500 Hz, -12 dB/oct rolloff), and subtle chorus effect; separate triangle-wave path for other instruments ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Retuned master EQ from aggressive settings (low -3, high +3, crossovers at 200/2000 Hz) to neutral balance (low 0, mid -1, high +1, crossovers at 250/2500 Hz) ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Tightened reverb decay from 1.5s to 1.2s and raised default wet level from 0.3 to 0.6 for a cleaner, more present sound ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Raised limiter threshold from -3 dB to -2 dB for increased headroom ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Reduced max polyphony from 256 to 24-32 voices (instrument-dependent) for more reliable playback on constrained devices ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Changed default instrument from "piano" to "synth" and default reverb from 0.5 to 0.7 ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Reworked `playChord()` to release all currently sounding notes before triggering new ones, preventing note overlap artifacts ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Removed the standalone `optimizeChordNotes()` function, replacing it with inline voicing logic integrated into the playback path ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))

### Advanced Voicing System

- Added "Advanced Voicing" toggle in the navigation bar with inline status text showing whether advanced or simple chord-voicing logic is active ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Introduced `useAdvancedVoicing` state variable to control voicing algorithm selection at runtime ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))

### Emergency Audio Reset

- Added "Reset Audio" button (lightning bolt icon) in the top navigation bar for recovering from stuck audio states without reloading the page ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))

### Mobile Responsiveness -- Layout and Navigation

- Added mobile-optimized viewport meta tags: disabled user scaling, set `apple-mobile-web-app-capable`, and configured `theme-color` for iOS status bar integration ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Implemented responsive button sizing across the top navigation: `btn-xs` on mobile, `btn-sm` on desktop, with text labels hidden on small screens (icon-only mode) ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Moved the Advanced Voicing toggle into the overflow menu on screens narrower than `md` breakpoint ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Shortened header title to "Jazz Progressions" on small screens to prevent truncation ([`fc826ad`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/fc826ad851dd779bc687a25ac1fd7a6cbb9368fd))
- Applied edge-to-edge layout on mobile: removed border-radius on containers, eliminated horizontal padding, and set `overflow-x: hidden` on body ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))

### Mobile Responsiveness -- Touch Interactions

- Enlarged touch targets: minimum button height of 2.5rem, wider dropdowns (12rem min), and 2rem range slider height ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Enabled momentum-based scrolling (`-webkit-overflow-scrolling: touch`) on scrollable containers ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Forced 16px font size on all form elements to prevent iOS auto-zoom on input focus ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Disabled tap highlight color for a native-app feel ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Added `touch-action: pan-y` on chord cards to allow vertical scrolling while capturing horizontal swipe gestures ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))
- Added animated swipe hint (arrow SVG) on chord cards that appears on touch-hold ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))
- Added press-scale animation (scaleX 0.98) on chord card touch for tactile feedback ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))
- Enlarged piano keys on touch devices: white keys 40px wide, black keys 24px wide / 50px tall, overall key height 80px ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))

### Mobile Responsiveness -- Chord Palette and Sections

- Added slide-up chord palette panel on mobile (80vh fixed bottom sheet with rounded top corners, CSS transform animation, and iOS safe-area padding) ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Forced single-column chord card grid on screens under 768px via `grid-template-columns: 1fr` ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))
- Added truncation on section headings (max-width 60-85%, ellipsis overflow) on mobile to prevent layout overflow ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4), [`fc826ad`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/fc826ad851dd779bc687a25ac1fd7a6cbb9368fd))
- Added `progression-container` class with `touch-action: pan-y` and `overflow-x: hidden` to prevent accidental horizontal scrolling on the main editor area ([`fc826ad`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/fc826ad851dd779bc687a25ac1fd7a6cbb9368fd))

### Mobile Responsiveness -- Drag-and-Drop

- Added visual feedback CSS for SortableJS drag interactions: `.sortable-chosen` (purple highlight), `.sortable-drag` (slight scale-up with shadow), `.sortable-ghost` (dashed border placeholder) ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))

### Mobile Responsiveness -- Player Controls

- Styled player controls with increased z-index, minimum touch-target sizes, and proper spacing to prevent button overlap on small screens ([`1052712`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/1052712c7616be7da81853ccfd1562f694500df8))
- Converted mobile settings dropdown from `dropdown-top` to a center-screen modal-like overlay with a backdrop for better usability on small viewports ([`c979ce2`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/c979ce296bf6d07b6053bf4da513f9b3957c424e))
- Improved mobile settings dropdown z-index and tabindex handling for reliable opening/closing ([`bd110be`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/bd110be111c1ea5c8c23ee452aa2691025c08836))
- Restructured mobile settings dropdown from `<div>` to proper DaisyUI `<ul>/<li>` menu pattern for better accessibility and consistent behavior ([`9bdc9df`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/9bdc9df86070d5562b94e72b9d5e4579c60f6b6f))
- Moved mobile settings controls (instrument, volume, tempo) from the player bar into the top navigation as a dedicated dropdown, improving reachability ([`492b705`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/492b7058fb57216aa9c924536d2cabfe7d2e98e0))
- Replaced the mobile settings dropdown with a proper full-screen modal (`showMobileSettingsModal`) containing instrument selector, volume slider (with 0%/50%/100% labels), and tempo selector for a more reliable and spacious touch experience ([`9a29835`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/9a29835985920c0036833c1fe722d96e6e6fcf61))

### Mobile Responsiveness -- Consolidated CSS Refactoring

- Merged scattered `@media (max-width: 767px)` and `@media (max-width: 768px)` blocks into a single unified 768px mobile breakpoint with reorganized rules ([`05ce66a`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/05ce66a02ec7ada9d4935e971ff378ba4dfae8cb), [`fc826ad`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/fc826ad851dd779bc687a25ac1fd7a6cbb9368fd))
- Added iOS safe-area inset support for player controls and chord palette via `env(safe-area-inset-bottom)` ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))

### Documentation and Assets

- Created comprehensive README.md covering features, music theory concepts, voice leading algorithms, technical architecture, and usage instructions ([`ca18b8d`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/ca18b8d8a0608156d4cbbc457fc9979d34a6e9e2))
- Iterative README refinements: image embedding fixes, wording tweaks, jazzchords.org URL correction ([`941c475`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/941c475221c952652be506ccc1fb06cdeafcc1c0), [`4d275b2`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/4d275b23797e719e87980d44bd01b3cfd96ad096), [`83a4910`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/83a49103c99a27c527dc04b0f0dce8430ab28ca5), [`5199bdc`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/5199bdc239ce41794714cca664ff826061e921cd), [`1bfcc69`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/1bfcc6925e18dec3bc0f950b482d4aaa5f34a336))
- Added illustration image (`illustration.webp`) and screenshot (`screenshot.png`) ([`e2a1fe3`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/e2a1fe3771f22ed62cf7765b03c70ce7d5c8c0c0), [`329c655`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/329c6553551e36ba78f5f29d52f286f3f5490453), [`69dd439`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/69dd4394e3ce3115723a090db7e55cb8a50ba549))

---

## 2025-03-16 -- Initial Release

The Jazz Chord Progression Editor was published as a single self-contained HTML file (5,503 lines) with the full feature set described below.

### Chord Editing and Composition

- Visual chord editor with chord palette organized by category (basic, seventh, extended, altered, special)
- Section-based progression management (verse, chorus, bridge, etc.) with collapsible sections
- Chord creation with root, type, extensions, alterations, bass note, and voicing style selection
- Drag-and-drop chord reordering via SortableJS
- Chord duplication, deletion, and inline annotation support
- Section-level annotations for educational or compositional notes
- "Copy as Text" for quick plain-text export of progressions

### Playback and Audio

- Real-time playback via Tone.js with PolySynth (triangle wave oscillator)
- Adjustable tempo (40-160 BPM) and chord duration
- Per-chord and full-progression playback modes
- Audio effects chain: master EQ, reverb (configurable wet/decay), and limiter to prevent clipping
- Multiple instrument timbres: piano, electric piano (Rhodes), Moog synth, warm pad, analog saw, marimba, vibraphone
- Volume control with master gain adjustment
- Audio initialization overlay (required for browser autoplay policies)
- Progress bar showing elapsed/total playback time

### Music Theory and Voice Leading

- Comprehensive chord type library: major, minor, diminished, augmented, suspended, seventh chords (maj7, dom7, min7, m7b5, dim7), extended chords (9th, 11th, 13th), altered dominants (b9, #9, #11, b13), quartal harmonies, upper structure triads, polychords
- Voice leading algorithm minimizing note movement between consecutive chords, prioritizing guide tones (3rd and 7th)
- Chord function analysis (`determineChordFunction`) identifying tonic/dominant/subdominant roles, altered status, and modal characteristics
- Jazz voicing optimization (`optimizeJazzVoicing`) ensuring proper register placement of root, guide tones, and extensions
- Multiple voicing styles: close position, open position, drop 2, spread, quartal, cluster
- Note pool generation with octave spanning and density control
- Virtual piano keyboard for manual note-level editing

### Preset Progressions

- Built-in preset progressions from multiple AI models (Gemma 3, ChatGPT 4.5, Claude 3.7)

### Import and Export

- JSON export/import of complete progressions (sections, chords, voicing parameters, annotations)
- FileSaver.js integration for client-side file download

### UI Framework

- Built on Alpine.js for reactive state management
- Styled with TailwindCSS and DaisyUI component library
- FontAwesome icons, Animate.css transitions, and Tippy.js tooltips
- Dark theme (gray-800/gray-900 palette) with violet accent color
- Responsive flex layout with sidebar chord palette and main editor area

([`af0e303`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/af0e303b45dbdca620f6ece7489a4b43650d8322))
