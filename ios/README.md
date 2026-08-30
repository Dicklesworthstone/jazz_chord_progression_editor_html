# FrankenJazz

FrankenJazz is the native Apple sibling of the Changes jazz progression studio.
One SwiftUI target adapts deliberately across iPhone, iPad, and Mac Catalyst.
It runs offline and stores recovery data only in the app's private Application
Support directory.

## Included in the native app

- bounded bar-delimited lead-sheet entry with automatic validated publication;
- a substantial bundled library of public-domain progressions, shared harmonic
  devices, and original studies with provenance and musical notes;
- selectable native measure cards, chord-tone piano, Roman/context reading,
  guide-tone evidence, and five realized voicing families;
- transposition, key, tempo, groove, and generated instrument controls;
- a persistent transport with background preparation, play/pause, Stop, loop,
  playhead highlighting, and interactive waveform-style seeking;
- atomic local recovery with a previous valid fallback;
- file import plus actual `.frankenjazz`, `.txt`, and `.mid` exports;
- iPhone sheets, iPad split workspaces, keyboard shortcuts, and a freely
  resizable three-column Mac Catalyst studio.

## Generate and build

Requirements: Xcode 26 or newer and XcodeGen 2.46 or newer.

```bash
cd ios
xcodegen generate

# iPhone/iPad simulator
xcodebuild -project FrankenJazz.xcodeproj \
  -scheme FrankenJazz \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO build

# Mac Catalyst
xcodebuild -project FrankenJazz.xcodeproj \
  -scheme FrankenJazz \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  CODE_SIGNING_ALLOWED=NO build

# Focused unit and real UI paths
xcodebuild -project FrankenJazz.xcodeproj \
  -scheme FrankenJazz \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO test
```

The project file is generated from `project.yml`; edit that specification, not
the generated `project.pbxproj`. App data is never uploaded. The only way a
chart leaves the device is an explicit system share/export action.
