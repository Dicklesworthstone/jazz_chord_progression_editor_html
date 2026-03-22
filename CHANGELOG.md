# Changelog

All notable changes to the Jazz Chord Progression Editor are documented in this file.

This project has no formal releases or tags. Changes are tracked by commit on the `main` branch.
Repository: <https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html>

---

## [Unreleased]

### Repository & Licensing

- **License updated to MIT with OpenAI/Anthropic Rider** restricting use by OpenAI, Anthropic, and their affiliates without express written permission from Jeffrey Emanuel ([`addeb65`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/addeb65af993ecda705472e97bed0a2bd72861c5)) — 2026-02-21
- **GitHub social preview image** (1280x640 `gh_og_share_image.png`) added for consistent link previews ([`a01a83c`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/a01a83c283c0ff8fd05e2fe91fe8146348bf4b86)) — 2026-02-21
- **MIT License file** initially added ([`924fa52`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/924fa52a552391ff70d5aa01cb2b6f5109b11f67)) — 2026-01-21

---

## 2025-03-17 — Mobile Responsiveness & UI Polish

A concentrated burst of 13 commits on a single day transformed the desktop-only editor into a mobile-friendly application with refined audio defaults and improved UI controls.

### Mobile & Touch Support

- Added responsive viewport meta tags (`width=device-width`, `user-scalable=no`) and iOS web-app-capable meta tags ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
- Implemented CSS media queries (`max-width: 767px`, `768px`) for mobile-specific layouts: single-column chord grids, edge-to-edge design, removed border-radius ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97), [`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))
- Enlarged touch targets for buttons and piano keys; added `touch-manipulation` CSS class to prevent double-tap zoom ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))
- Enabled momentum-based scrolling (`-webkit-overflow-scrolling: touch`) and horizontal swipe hints with CSS animation ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))
- Created floating chord-palette toggle button visible only on mobile ([`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4))

### Mobile Settings Modal

Iterated through multiple approaches for mobile playback controls:

1. Inline dropdown menus within the player bar ([`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97))
2. Centered fixed-position dropdown with backdrop overlay ([`c979ce2`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/c979ce296bf6d07b6053bf4da513f9b3957c424e))
3. Refactored dropdown structure with improved z-index layering ([`9bdc9df`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/9bdc9df86070d5562b94e72b9d5e4579c60f6b6f), [`492b705`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/492b7058fb57216aa9c924536d2cabfe7d2e98e0))
4. Final dedicated modal dialog (`showMobileSettingsModal`) with full-width instrument, volume slider, and tempo selectors ([`9a29835`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/9a29835985920c0036833c1fe722d96e6e6fcf61))

### UI Refinements (mobile iteration commits)

- [`fc826ad`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/fc826ad851dd779bc687a25ac1fd7a6cbb9368fd) — More mobile improvements (empty diff — squashed into adjacent commit)
- [`2271a04`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/2271a049f0dd1c27784195f64a0bc6f432746229) — Minor mobile layout tweak (4 insertions)
- [`cbfd41f`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/cbfd41f3e24295ffaf5e14543f299bc867e04f04) — Additional mobile tweaks (20 insertions)
- [`05ce66a`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/05ce66a02ec7ada9d4935e971ff378ba4dfae8cb) — Refactored mobile controls, net reduction of 35 lines
- [`af672d3`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/af672d3b578c74c3007a6b3a253add9eeede6185) — Mobile tweak (10 insertions)
- [`1052712`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/1052712c7616be7da81853ccfd1562f694500df8) — Mobile tweak (20 insertions)
- [`bd110be`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/bd110be111c1ea5c8c23ee452aa2691025c08836) — Minor parameter adjustment (4 insertions, 3 deletions)

### Documentation

- Created comprehensive README.md with table of contents, feature overview, usage guide, music theory explanations, technical architecture, and function-level documentation ([`ca18b8d`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/ca18b8d8a0608156d4cbbc457fc9979d34a6e9e2))
- Added illustration image (`illustration.webp`) and screenshot (`screenshot.png`) ([`e2a1fe3`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/e2a1fe3771f22ed62cf7765b03c70ce7d5c8c0c0), [`329c655`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/329c6553551e36ba78f5f29d52f286f3f5490453), [`69dd439`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/69dd4394e3ce3115723a090db7e55cb8a50ba549))
- README text refinements across five edits ([`941c475`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/941c475221c952652be506ccc1fb06cdeafcc1c0), [`4d275b2`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/4d275b23797e719e87980d44bd01b3cfd96ad096), [`83a4910`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/83a49103c99a27c527dc04b0f0dce8430ab28ca5), [`5199bdc`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/5199bdc239ce41794714cca664ff826061e921cd), [`1bfcc69`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/1bfcc6925e18dec3bc0f950b482d4aaa5f34a336))

---

## 2025-03-17 — Audio Engine & Voicing Overhaul

Major rewrite adding 2,645 lines and removing 595 in a single commit, introducing the advanced voicing system and audio improvements.

### Advanced Voicing System

- Added `useAdvancedVoicing` toggle (inline in navigation bar) to switch between simple and advanced chord voicing algorithms ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Replaced `applyVoicingStyle()` with new `applyJazzVoicingStyle()` function implementing jazz-specific voicing logic ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Added **Drop 3 voicing** style (moves third-highest note down an octave) alongside existing Drop 2 ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Improved all voicing algorithms: close, open, spread, quartal, and cluster voicings now use proper octave arithmetic with note-object manipulation ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))

### Audio Engine Improvements

- **Emergency Reset Audio** button added to navigation bar for recovering from stuck notes ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Changed default instrument from `piano` to `synth` (Moog Synth) ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Changed default reverb from `0.5` to `0.7` for warmer ambient sound ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Limiter threshold tightened from `-3 dB` to `-2 dB` for better clipping prevention ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Reverb decay shortened from `1.5s` to `1.2s`; default wet level raised to `0.6` ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Master EQ retuned: neutral lows (was -3), slight mid scoop at -1 (was 0), highs +1 (was +3); frequency crossovers adjusted to 250/2500 Hz ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))
- Added instrument-specific audio chains: Moog synth gets dedicated filter and chorus effects, other instruments route through standard EQ/reverb/limiter chain ([`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67))

---

## 2025-03-16 — Initial Release

Single-file HTML application (5,503 lines) uploaded as the first commit.

### Core Editor

- Visual chord progression editor built with Alpine.js reactive data binding ([`af0e303`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/af0e303b45dbdca620f6ece7489a4b43650d8322))
- Section management: create, rename, duplicate, delete, reorder, collapse/expand sections
- Per-section and per-chord annotation support
- Drag-and-drop chord reordering via SortableJS
- Chord palette for browsing and adding chords

### Chord Construction & Voicing

- Comprehensive chord type support: major, minor, diminished, augmented, suspended, all seventh types, extended chords (9ths, 11ths, 13ths), altered dominants
- Voicing styles: close position, open position, Drop 2, spread, quartal (4ths), cluster
- Three-tab chord editor: Basic (root, type, extensions), Advanced (voicing style, octave range, density), Notes (virtual piano keyboard for manual note editing)
- Custom bass note support for slash chords

### Voice Leading

- Algorithmic voice leading that minimizes note movement between consecutive chords
- Essential chord tone identification (root, 3rd, 7th) with priority mapping
- Register-aware note placement ensuring musically appropriate octave distribution
- `optimizeJazzVoicing()` — core algorithm for transforming chord symbols into properly voiced jazz chords
- `applyVoiceLeadingToNextChord()` — smooth transitions preserving voice independence

### Audio Playback

- Real-time playback via Tone.js Web Audio framework
- Seven instrument timbres: Piano, Electric Piano (Rhodes), Moog Synth, Warm Pad, Analog Saw, Marimba, Vibraphone (plus Synthwave variant)
- Audio processing chain: synth generation, EQ (Tone.EQ3), reverb (Tone.Reverb), limiter (Tone.Limiter)
- Adjustable tempo (40-160 BPM), volume, and reverb wet level
- Per-section playback and full-progression playback
- Audio enable overlay (required for browser autoplay policy compliance)

### Preset Progressions

- Three built-in AI-generated jazz progressions:
  - **Gemma 3** preset
  - **ChatGPT 4.5** preset
  - **Claude 3.7 Sonnet** preset
- Preview and load functionality with progression descriptions

### Import/Export

- Export progressions as JSON files via FileSaver.js
- Import previously saved JSON progressions

### Technology Stack

- **Alpine.js 3.13.3** — reactive data binding and component management
- **TailwindCSS + DaisyUI 4.4.19** — utility-first styling with component library
- **Tone.js 14.8.49** — Web Audio synthesis and effects
- **Tonal.js** — music theory utilities for chord/note calculation
- **SortableJS 1.15.0** — drag-and-drop reordering
- **FileSaver.js 2.0.5** — client-side file saving
- **FontAwesome** — icon set
- **Animate.css 4.1.1** — UI transition animations
- **Tippy.js 6** — enhanced tooltips

---

## Commit Index

| Hash | Date | Summary |
|------|------|---------|
| [`af0e303`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/af0e303b45dbdca620f6ece7489a4b43650d8322) | 2025-03-16 | Initial upload of single-file HTML application (5,503 lines) |
| [`9868738`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/98687380aa572eb0107efea19940da7541775d67) | 2025-03-17 | Audio engine & voicing overhaul (+2,645 / -595 lines) |
| [`e2a1fe3`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/e2a1fe3771f22ed62cf7765b03c70ce7d5c8c0c0) | 2025-03-17 | Add illustration.webp |
| [`ca18b8d`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/ca18b8d8a0608156d4cbbc457fc9979d34a6e9e2) | 2025-03-17 | Create README.md (1,384 lines) |
| [`329c655`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/329c6553551e36ba78f5f29d52f286f3f5490453) | 2025-03-17 | Replace illustration.webp with full-resolution version |
| [`941c475`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/941c475221c952652be506ccc1fb06cdeafcc1c0) | 2025-03-17 | README text edit |
| [`4d275b2`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/4d275b23797e719e87980d44bd01b3cfd96ad096) | 2025-03-17 | README text edit |
| [`69dd439`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/69dd4394e3ce3115723a090db7e55cb8a50ba549) | 2025-03-17 | Add screenshot.png |
| [`83a4910`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/83a49103c99a27c527dc04b0f0dce8430ab28ca5) | 2025-03-17 | README text edit |
| [`5199bdc`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/5199bdc239ce41794714cca664ff826061e921cd) | 2025-03-17 | README text edit |
| [`1bfcc69`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/1bfcc6925e18dec3bc0f950b482d4aaa5f34a336) | 2025-03-17 | README text edit |
| [`0759c42`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/0759c425f18ec102d95b7bcdf4970bec3ffd3b97) | 2025-03-17 | Mobile-friendly tweaks (+273 / -70 lines) |
| [`6aa6b27`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/6aa6b27c67d5a7f4e1612fd0120e406a0a8d27c4) | 2025-03-17 | Major mobile improvements (+499 / -140 lines) |
| [`fc826ad`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/fc826ad851dd779bc687a25ac1fd7a6cbb9368fd) | 2025-03-17 | More mobile improvements |
| [`2271a04`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/2271a049f0dd1c27784195f64a0bc6f432746229) | 2025-03-17 | Mobile tweak |
| [`cbfd41f`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/cbfd41f3e24295ffaf5e14543f299bc867e04f04) | 2025-03-17 | More tweaks |
| [`05ce66a`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/05ce66a02ec7ada9d4935e971ff378ba4dfae8cb) | 2025-03-17 | Refactor mobile controls (-35 net lines) |
| [`af672d3`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/af672d3b578c74c3007a6b3a253add9eeede6185) | 2025-03-17 | Mobile tweak |
| [`1052712`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/1052712c7616be7da81853ccfd1562f694500df8) | 2025-03-17 | Mobile tweak |
| [`c979ce2`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/c979ce296bf6d07b6053bf4da513f9b3957c424e) | 2025-03-17 | Centered mobile dropdown with backdrop overlay |
| [`bd110be`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/bd110be111c1ea5c8c23ee452aa2691025c08836) | 2025-03-17 | Minor parameter adjustment |
| [`9bdc9df`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/9bdc9df86070d5562b94e72b9d5e4579c60f6b6f) | 2025-03-17 | Refactor mobile dropdown structure |
| [`492b705`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/492b7058fb57216aa9c924536d2cabfe7d2e98e0) | 2025-03-17 | Improved mobile dropdown with proper z-indexing |
| [`9a29835`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/9a29835985920c0036833c1fe722d96e6e6fcf61) | 2025-03-17 | Replace dropdown with dedicated mobile settings modal |
| [`924fa52`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/924fa52a552391ff70d5aa01cb2b6f5109b11f67) | 2026-01-21 | Add MIT License |
| [`a01a83c`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/a01a83c283c0ff8fd05e2fe91fe8146348bf4b86) | 2026-02-21 | Add GitHub social preview image |
| [`addeb65`](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/commit/addeb65af993ecda705472e97bed0a2bd72861c5) | 2026-02-21 | Update license to MIT with OpenAI/Anthropic Rider |
