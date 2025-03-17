# Jazz Chord Progression Editor

![Jazz Chord Progression Editor](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/blob/main/illustration.webp)

## Table of Contents

- [Overview](#overview)
- [Motivation](#motivation)
- [Features](#features)
- [Technologies and Libraries](#technologies-and-libraries)
- [Music Theory Concepts](#music-theory-concepts)
- [Voice Leading and Harmony](#voice-leading-and-harmony)
- [Technical Architecture](#technical-architecture)
- [Installation and Usage](#installation-and-usage)
- [Future Development](#future-development)
- [Credits](#credits)
- [Music Theory Function Breakdown](#music-theory-function-breakdown)

## Overview

The **Jazz Chord Progression Editor** is a sophisticated web application designed for creating, editing, playing, and analyzing jazz chord progressions. It features an intuitive interface coupled with advanced music theory algorithms that provide proper jazz chord voicings and voice leading. 

This tool bridges the gap between music theory, computational harmony, and practical application, allowing musicians, composers, and educators to experiment with complex jazz harmonies and instantly hear the results.

## Motivation

This project originated from an exploration of frontier Language Learning Models' (LLMs like Claude, GPT-4) abilities to generate interesting and musically sophisticated jazz chord progressions. What started as a simple tool to audition these AI-generated progressions evolved into a comprehensive application as I discovered:

1. The enormous amount of nuance and complexity in jazz harmony
2. The sophisticated music theory required to properly voice chords so they sound good in sequence
3. The need for proper voice leading algorithms to create smooth, natural-sounding transitions between chords
4. The lack of accessible tools that combine theoretical knowledge with practical application in jazz contexts

The goal shifted from simply "hearing what the AI created" to building a tool that could demonstrate, teach, and help compose authentic jazz harmonic progressions with appropriate voicings.

## Features

### Core Functionality

- **Visual Chord Editor**: Create, edit, and arrange chord progressions with a user-friendly interface
- **Real-time Playback**: Hear your progressions instantly with adjustable tempo and instrument sounds
- **Section Management**: Organize progressions into multiple sections (verse, chorus, etc.)
- **Advanced Voice Leading**: Algorithms that create smooth transitions between chords
- **Custom Chord Creation**: Build any chord from basic to extended and altered jazz harmonies
- **Chord Voicing Options**: Multiple voicing styles including close, open, drop 2, spread, quartal, and cluster

### Advanced Features

- **Preset Progressions**: Load professionally crafted jazz progressions from different AI models (Gemma 3, ChatGPT 4.5, Claude 3.7)
- **Export/Import**: Save and share your progressions as JSON files
- **Annotation Support**: Add notes to both chords and sections for educational or compositional purposes
- **Virtual Piano Interface**: Visualize and edit individual notes in chords
- **Multiple Instrument Timbres**: Choose between piano, electric piano, various synths, and more
- **Audio Control**: Fine-tune reverb, volume, and other playback parameters

| ![Screenshot of it in Action](https://github.com/Dicklesworthstone/jazz_chord_progression_editor_html/blob/main/screenshot.png) | 
|:--:| 
| *Screenshot of it in Action* |

### How to Use the Jazz Chord Progression Editor

#### Getting Started

Getting started with the Jazz Chord Progression Editor is simple and requires no installation of software beyond a modern web browser.

##### Step 1: Download the HTML File

1. Download the `jazz_chord_progression_editor.html` file to your computer.
2. Save it to a location you can easily find (like your Desktop or Documents folder).

##### Step 2: Open the File in Chrome

1. Open Google Chrome (the editor works best in Chrome).
2. Drag the HTML file into a Chrome window, or use File > Open to navigate to the file.
3. The editor should load immediately in your browser.

##### Step 3: Enable Audio

1. When you first open the editor, you'll see an "Enable Audio" overlay.
2. Click the "Click to Enable Audio" button.
3. This is required because browsers need user interaction before allowing audio playback.

#### Basic Usage

##### Playing Existing Progressions

1. **Load a Preset**: Click the "Presets" button in the top navigation bar to load one of the professionally crafted jazz progressions.
2. **Play**: Use the playback controls at the bottom of the screen to play, pause, or stop the progression.
3. **Adjust Speed**: Change the tempo using the BPM selector in the player controls.
4. **Change Sound**: Select different instruments from the dropdown in the player controls.

##### Creating Your Own Progressions

1. **Add Chords**: Use the Chord Palette on the left side to browse and add chords to your progression.
2. **Add Sections**: Click "Add Section" to create new parts in your progression (verse, chorus, etc.).
3. **Edit Chords**: Click the three dots (⋮) menu on any chord to edit, delete, or duplicate it.
4. **Play Sections**: Use the play button on each section to hear just that part of your progression.

##### Customizing Chords

1. **Basic Editing**: When editing a chord, use the "Basic" tab to change the root, type, and basic extensions.
2. **Advanced Voicing**: Use the "Advanced" tab to adjust voicing style, octave range, and chord density.
3. **Manual Note Editing**: Use the "Notes" tab and piano keyboard to manually add or remove individual notes.

##### Saving Your Work

1. **Export**: Click the "Export" button to save your progression as a JSON file.
2. **Import**: Use the "Import" button to load a previously saved progression.

#### Tips for Best Results

- **Start with Presets**: Explore the included presets to understand how well-voiced jazz progressions are structured.
- **Listen to Voice Leading**: Pay attention to how notes connect smoothly between chords when played in sequence.
- **Experiment with Instruments**: Different instruments can highlight different aspects of your voicings.
- **Use Annotations**: Add notes to chords or sections to remember your ideas or explain harmonic concepts.
- **Check Your Registers**: Avoid placing too many notes in very low registers, which can sound muddy.

#### Troubleshooting

- **No Sound?** If you don't hear anything, click the "Reset Audio" button in the top bar.
- **Browser Crashed?** Complex progressions might be demanding - try reducing the number of simultaneous notes in your chords.
- **Stuck Notes?** If notes seem to keep playing when they shouldn't, use the "Reset Audio" button.

The Jazz Chord Progression Editor is designed to be intuitive, so feel free to experiment! The best way to learn is by trying different chord types, voicings, and progressions to see how they sound.

## Technologies and Libraries

The Jazz Chord Progression Editor leverages several modern web technologies and libraries:

### Core Technologies

- **HTML5/CSS3**: Modern markup and styling
- **JavaScript**: Core application logic
- **Alpine.js**: Reactive data binding and component management
- **TailwindCSS/DaisyUI**: Utility-first CSS framework for styling

### Audio and Music Libraries

- **Tone.js**: Web audio framework for sound generation and audio processing
- **Tonal.js**: Music theory utilities for chord calculation and analysis

### UI Enhancement Libraries

- **FontAwesome**: Icons and visual elements
- **Animate.css**: CSS animations for UI feedback
- **Tippy.js**: Enhanced tooltips
- **SortableJS**: Drag-and-drop functionality

### Data Management

- **FileSaver.js**: Client-side file saving for exporting progressions

## Music Theory Concepts

The application implements several advanced music theory concepts that are central to jazz harmony:

### Chord Construction

The editor supports a comprehensive range of chord types essential to jazz:

- **Basic Chords**: Major, minor, diminished, augmented, suspended
- **Seventh Chords**: Major 7th, dominant 7th, minor 7th, half-diminished, diminished 7th
- **Extended Chords**: 9ths, 11ths, 13ths with various alterations
- **Altered Dominants**: 7(b9), 7(#9), 7(#11), 7(b13), etc.
- **Special Jazz Voicings**: Quartal harmonies, upper structure triads, polychords

Each chord type is defined by specific interval structures, which the application uses to generate the appropriate notes.

### Jazz Harmony Principles

The application incorporates key jazz harmony principles:

1. **Tension and Resolution**: Managing dissonance and consonance between chords
2. **Modal Interchange**: Borrowing chords from parallel modes
3. **Tritone Substitution**: Substituting dominant chords a tritone away
4. **Upper Structure Triads**: Using triads over different bass notes to create complex harmonies
5. **Altered Dominants**: Using altered scale tones to create tension in dominant chords

### Jazz Chord Voicing

Different voicing techniques for jazz chords are implemented:

- **Close Position**: Notes arranged compactly
- **Open Position**: Notes spread across wider intervals
- **Drop 2 Voicing**: Second note from the top dropped an octave (common in jazz guitar and piano)
- **Spread Voicing**: Notes distributed across octaves for a fuller sound
- **Quartal Harmony**: Chords built on 4ths instead of 3rds (McCoy Tyner, Bill Evans style)
- **Cluster Voicing**: Tight groups of notes for modern jazz textures

## Voice Leading and Harmony

Voice leading is one of the most sophisticated aspects of the application, ensuring smooth transitions between chords by minimizing the movement of individual notes.

### Voice Leading Algorithm

The application's voice leading system:

1. **Analyzes the Current Chord**: Identifies essential chord tones (root, 3rd, 7th, etc.)
2. **Maps Previous Voicing**: Tracks the notes from the previous chord
3. **Minimizes Movement**: Finds the closest available notes in the new chord
4. **Preserves Voice Independence**: Maintains separate voice paths through the progression
5. **Adjusts for Register**: Ensures notes stay in musically appropriate registers
6. **Optimizes Transitions**: Special handling for altered dominants and complex jazz harmonies
7. **Priorities Chord Function**: Emphasizes the most important chord tones for each chord type

The console output shows the voice leading algorithm in action:

```plaintext
🎵 Processing voice leading for chord: D7(b9)
⚙️ Generating note pool from chord properties
📝 Available note pool: ['D2', 'D3', 'D4', 'D5', 'D6', 'F#2', 'F#3'...
📝 Previous voicing: ['C3', 'E3', 'G3', 'B3', 'F#4']
📝 Essential chord tones: ['D2', 'F#3', 'C3', 'A3', 'Eb4']
👉 Essential tone D2 paired with previous C3 (distance: 10 semitones)
👉 Essential tone F#3 paired with previous G3 (distance: 1 semitones)
```

### Advanced Voicing Optimization

Beyond basic voice leading, the application implements jazz-specific voicing optimizations:

```plaintext
🔄 Running optimized jazz voicing algorithm...
🎵 Optimizing voicing for chord: Gmaj9
📝 Input notes: ['G2', 'Bb3', 'D3', 'F#2', 'A4']
📝 Added missing seventh: F3
📝 Applying proper voicing type for chord quality
✨ Final optimized jazz voicing: ['F#2', 'D3', 'F3', 'G3', 'A4', 'Bb4']
```

This optimization considers:

1. **Chord Function**: Different treatment for tonic, subdominant, and dominant functions
2. **Style-Appropriate Voicings**: Adjusting based on jazz subgenre contexts
3. **Registral Balance**: Distributing notes for optimal sonority
4. **Extension Placement**: Properly positioning 9ths, 11ths, and 13ths for maximum effect
5. **Avoiding Problematic Intervals**: Eliminating harsh dissonances unless intentional

## Technical Architecture

The application architecture combines several patterns and approaches:

### Frontend Architecture

- **Alpine.js Data Model**: Reactive state management for the entire application
- **Component-Based Structure**: Modular organization of UI elements
- **Event-Driven Interactions**: User input triggers appropriate state changes and audio output

### Audio Processing Pipeline

The application constructs a sophisticated audio processing chain:

```javascript
// Create a master EQ for better frequency balance
this.masterEQ = new Tone.EQ3({
    low: 0,      // Neutral lows
    mid: -1,     // Slight mid scoop for clarity
    high: 1,     // Slight boost to highs for clarity
    lowFrequency: 250,
    highFrequency: 2500
}).connect(this.reverb_effect);
```

This chain includes:

1. **Synth Generation**: Creating the basic sound source
2. **Effects Processing**: Adding reverb, EQ, and other effects
3. **Dynamic Control**: Managing volume and dynamics
4. **Output Limiting**: Preventing audio clipping and distortion

### Data Structures

The chord progression data is structured hierarchically:

```javascript
currentProgression: {
    name: "My Jazz Progression",
    description: "",
    sections: [
        {
            name: "Section A",
            chords: [
                {
                    name: "Cmaj7(#11)",
                    root: "C",
                    type: "maj7",
                    bass: "",
                    notes: ['C3', 'E3', 'G3', 'B3', 'F#4'],
                    s11: true,
                    annotation: "",
                    voicingStyle: "close",
                    baseOctave: 3,
                    octaveSpan: 2,
                    density: 5,
                    tensions: ["#11"]
                },
                // More chords...
            ],
            collapsed: false,
            annotation: "Ethereal opening section with advanced harmonic techniques"
        }
        // More sections...
    ]
}
```

This structure allows for:

- Complete representation of complex chord characteristics
- Efficient traversal for playback and editing
- Clear separation of musical concepts (progressions, sections, chords, notes)

## Installation and Usage

### Simple Setup

1. Clone the repository or download the HTML file
2. Open the HTML file in a modern web browser
3. Start creating your jazz chord progressions!

The application runs entirely in the browser with no server dependencies.

### Basic Usage

1. **Create a Progression**: Start with a new progression or load a preset
2. **Add Chords**: Use the Chord Palette to add chords to sections
3. **Edit Chords**: Customize chord types, alterations, and voicings
4. **Arrange Sections**: Organize your progression into logical sections
5. **Play and Listen**: Use the playback controls to hear your progression
6. **Save Your Work**: Export your progression for later use

## Future Development

Planned enhancements include:

- **MIDI Export**: Save progressions as MIDI files for use in DAWs
- **Extended Instrument Library**: More realistic instrument sounds
- **Harmonic Analysis**: Automatic Roman numeral analysis of progressions
- **Progression Suggestions**: AI-assisted chord suggestion based on current progression
- **Collaborative Editing**: Share and edit progressions in real-time with others
- **Mobile Optimization**: Enhanced experience on touchscreen devices

## Credits

This project draws inspiration from jazz harmony traditions, music theory education, and modern web development practices. Special thanks to:

- The open-source communities behind Tone.js, Alpine.js, and other libraries used
- Jazz theory pioneers whose concepts are embodied in the harmonic algorithms
- AI language models that help generate interesting harmonic progressions
- Musicians and educators who provided feedback during development

---

## Music Theory Function Breakdown

This section provides a detailed analysis of the key music theory algorithms implemented in the Jazz Chord Progression Editor, explaining their purpose, theoretical underpinnings, and how they contribute to creating authentic jazz harmony.

Jazz harmony is immensely complex, combining centuries of Western music theory with innovations from blues, modal concepts, and extended techniques developed through the bebop, cool, modal, and post-bop eras. The system implemented here represents a computational approach to this rich tradition, with algorithms that mirror the decision-making processes of trained jazz pianists and arrangers.

### Master Functions

### `optimizeJazzVoicing(chord, notes)`

**Purpose**: This is the core algorithmic heart of the application, transforming raw chord symbols into properly voiced jazz chords.

**Music Theory Context**: Jazz chord voicing is an art form with established practices developed by pianists like Bill Evans, McCoy Tyner, and Herbie Hancock. This function encapsulates these practices into a computational algorithm.

**How It Works**:
1. Analyzes the input chord to ensure it contains the essential chord tones
2. Adds missing chord tones with appropriate octave placement (root in bass, 3rd and 7th in middle register)
3. Identifies the chord type (major, minor, dominant, altered) to determine appropriate treatment
4. Applies style-specific adjustments based on chord function
5. Ensures proper register spacing favoring mid-range sonority
6. Removes duplicate notes and sorts for logical voicing order

**Why It Improves Sound**:
- Creates balanced voicings that sound full without mud or excessive spacing
- Ensures essential chord identity tones (3rd, 7th) are present and prominent
- Places extensions (9ths, 11ths, 13ths) in upper registers where they add color without clashing
- Mimics how professional jazz pianists would voice these chords

From the console log:
```
🎵 Optimizing voicing for chord: Cmaj7(#11)
📝 Input notes: ['C3', 'E3', 'G3', 'B3', 'F#4']
📝 After register adjustments: ['C2', 'E3', 'G3', 'B3', 'F#4']
✨ Final optimized jazz voicing: ['C2', 'E3', 'G3', 'B3', 'F#4']
```

### `applyVoiceLeadingToNextChord(chord)`

**Purpose**: Creates smooth transitions between chords by minimizing the movement between individual notes - one of the most sophisticated aspects of the application.

**Music Theory Context**: Voice leading is fundamental to Western harmony, but jazz voice leading requires special considerations for extended harmonies, altered notes, and modal interchange.

**How It Works**:
1. Analyzes the current chord against the previous chord
2. Identifies the essential chord tones that define the harmonic function
3. Maps each voice from the previous chord to its closest counterpart in the new chord
4. Prioritizes smooth movement of the 3rd and 7th (the guide tones in jazz theory)
5. Adjusts octaves to minimize jumps while maintaining proper register
6. Applies specialized voice leading for complex chord types (altered dominants, polychords)

**Why It Improves Sound**:
- Creates continuity between chords, making progressions sound cohesive
- Avoids jarring jumps or voice crossings
- Maintains distinct voice identities, similar to how a choir or string quartet would
- Preserves the natural resolution tendencies of tension tones
- Emulates the finger economy a skilled jazz pianist would use when transitioning between chords

From the console log:
```
🎵 Processing voice leading for chord: D7(b9)
📝 Previous voicing: ['C3', 'E3', 'G3', 'B3', 'F#4']
👉 Essential tone F#3 paired with previous G3 (distance: 1 semitones)
👉 Essential tone C3 paired with previous E3 (distance: 4 semitones)
```

### `determineChordFunction(chord)`

**Purpose**: Analyzes the harmonic function and character of a chord to inform voicing decisions.

**Music Theory Context**: In functional harmony, chords serve different roles (tonic, subdominant, dominant) and require different treatment. Jazz extends this with modal functions and substitute relationships.

**How It Works**:
1. Examines chord structure (root, type, extensions, alterations)
2. Identifies its basic function (major, minor, dominant, etc.)
3. Determines special characteristics (altered, suspended, modal)
4. Recognizes harmonic function (tonic, dominant, passing)
5. Outputs a comprehensive analysis object that other algorithms use

**Why It Improves Sound**:
- Allows the application to handle different chord types appropriately
- Ensures dominant chords receive proper tension and altered notes
- Treats modal chords with appropriate voicing (quartal for sus chords)
- Distinguishes between tonic major (stable sound) and dominant major (tension-creating)

From the console log:
```
🔍 Determined chord function: {isMajor: true, isDominant: false, isAltered: false, isTonic: true, preferQuartal: false...}
```

### `generateJazzVoicing(chord, chordFunction, originalNotes)`

**Purpose**: Fully algorithmic generation of jazz voicings based on chord properties and harmonic function.

**Music Theory Context**: Different chord types and functions in jazz require specialized voicing approaches - a tonic Cmaj7 is voiced differently than a Cmaj7 used as a dominant substitute.

**How It Works**:
1. Selects an appropriate voicing style based on chord function
2. Establishes the chord's fundamental intervals
3. Adds appropriate extensions and alterations
4. Applies specific voicing techniques (drop 2, cluster, quartal)
5. Converts the abstract intervals to actual note strings
6. Handles special cases like slash chords
7. Fine-tunes register placement

**Why It Improves Sound**:
- Creates sophisticated voicings beyond basic triads and seventh chords
- Applies appropriate techniques for each chord type (altered dominants get tension, tonic chords get stability)
- Ensures voicings sound authentic to jazz piano traditions
- Maintains proper spacing and register distribution

## Voice Leading System

The voice leading system is the most sophisticated and musically important aspect of the application. It doesn't merely place notes that belong to a chord, but creates smooth, logical progressions between chords that sound musical and authentic to jazz performance practice.

### `applyInitialVoiceLeading(chord)`

**Purpose**: Initializes the voice leading system with a well-balanced first chord when no previous voicing exists.

**Music Theory Context**: The first chord of a progression establishes voicing norms that subsequent voice leading will follow. Jazz pianists pay special attention to this initial statement.

**How It Works**:
1. Generates a comprehensive note pool for the chord
2. Selects notes that properly represent the chord's identity
3. Emphasizes essential chord tones (root, 3rd, 7th)
4. Ensures appropriate register distribution 
5. Initializes the voice-leading state for subsequent chords

**Why It Improves Sound**:
- Establishes a baseline "ideal" voicing as a starting point
- Creates a reference point for subsequent voice leading
- Ensures the progression starts with a properly balanced sound
- Models how a jazz pianist would approach the first chord of a tune

From the console:
```
Creating balanced initial voicing for Cmaj7(#11)
Placing root, third, seventh in ideal registers
```

### `scheduleRemainingChordsWithVoiceLeading(chords)`

**Purpose**: Creates a sequence of voice-led chords that will play in order with smooth transitions between them.

**Music Theory Context**: In jazz performance, the horizontal connections between chords are as important as the vertical structures of the chords themselves. This function ensures the progression flows naturally.

**How It Works**:
1. Takes an array of upcoming chords in the progression
2. Applies voice leading between each consecutive pair
3. Schedules them for sequential playback
4. Updates UI and progress information
5. Handles timing between chords

**Why It Improves Sound**:
- Creates cohesive progressions rather than isolated chords
- Ensures the entire harmonic narrative unfolds smoothly
- Maintains continuity of voices throughout longer sequences
- Simulates how a pianist would plan ahead when playing through changes

### `optimizeJazzVoicing(chord, notes)`

**Purpose**: This is the core algorithmic heart of the application, transforming raw chord symbols into properly voiced jazz chords.

**Music Theory Context**: Jazz chord voicing is an art form with established practices developed by pianists like Bill Evans, McCoy Tyner, and Herbie Hancock. This function encapsulates these practices into a computational algorithm.

**How It Works**:
1. Analyzes the input chord to ensure it contains the essential chord tones
2. Adds missing chord tones with appropriate octave placement (root in bass, 3rd and 7th in middle register)
3. Identifies the chord type (major, minor, dominant, altered) to determine appropriate treatment
4. Applies style-specific adjustments based on chord function
5. Ensures proper register spacing favoring mid-range sonority
6. Removes duplicate notes and sorts for logical voicing order

**Why It Improves Sound**:
- Creates balanced voicings that sound full without mud or excessive spacing
- Ensures essential chord identity tones (3rd, 7th) are present and prominent
- Places extensions (9ths, 11ths, 13ths) in upper registers where they add color without clashing
- Mimics how professional jazz pianists would voice these chords

From the console log:
```
🎵 Optimizing voicing for chord: Cmaj7(#11)
📝 Input notes: ['C3', 'E3', 'G3', 'B3', 'F#4']
📝 After register adjustments: ['C2', 'E3', 'G3', 'B3', 'F#4']
✨ Final optimized jazz voicing: ['C2', 'E3', 'G3', 'B3', 'F#4']
```

### `applyVoiceLeadingToNextChord(chord)`

**Purpose**: Creates smooth transitions between chords by minimizing the movement between individual notes - one of the most sophisticated aspects of the application.

**Music Theory Context**: Voice leading is fundamental to Western harmony, but jazz voice leading requires special considerations for extended harmonies, altered notes, and modal interchange.

**How It Works**:
1. Analyzes the current chord against the previous chord
2. Identifies the essential chord tones that define the harmonic function
3. Maps each voice from the previous chord to its closest counterpart in the new chord
4. Prioritizes smooth movement of the 3rd and 7th (the guide tones in jazz theory)
5. Adjusts octaves to minimize jumps while maintaining proper register
6. Applies specialized voice leading for complex chord types (altered dominants, polychords)

**Why It Improves Sound**:
- Creates continuity between chords, making progressions sound cohesive
- Avoids jarring jumps or voice crossings
- Maintains distinct voice identities, similar to how a choir or string quartet would
- Preserves the natural resolution tendencies of tension tones
- Emulates the finger economy a skilled jazz pianist would use when transitioning between chords

From the console log:
```
🎵 Processing voice leading for chord: D7(b9)
📝 Previous voicing: ['C3', 'E3', 'G3', 'B3', 'F#4']
👉 Essential tone F#3 paired with previous G3 (distance: 1 semitones)
👉 Essential tone C3 paired with previous E3 (distance: 4 semitones)
```

### Chord Analysis Engine

### `determineChordFunction(chord)`

**Purpose**: Analyzes the harmonic function and character of a chord to inform voicing decisions.

**Music Theory Context**: In functional harmony, chords serve different roles (tonic, subdominant, dominant) and require different treatment. Jazz extends this with modal functions and substitute relationships.

**How It Works**:
1. Examines chord structure (root, type, extensions, alterations)
2. Identifies its basic function (major, minor, dominant, etc.)
3. Determines special characteristics (altered, suspended, modal)
4. Recognizes harmonic function (tonic, dominant, passing)
5. Outputs a comprehensive analysis object that other algorithms use

**Why It Improves Sound**:
- Allows the application to handle different chord types appropriately
- Ensures dominant chords receive proper tension and altered notes
- Treats modal chords with appropriate voicing (quartal for sus chords)
- Distinguishes between tonic major (stable sound) and dominant major (tension-creating)

From the console log:
```
🔍 Determined chord function: {isMajor: true, isDominant: false, isAltered: false, isTonic: true, preferQuartal: false...}
```

### `generateJazzVoicing(chord, chordFunction, originalNotes)`

**Purpose**: Fully algorithmic generation of jazz voicings based on chord properties and harmonic function.

**Music Theory Context**: Different chord types and functions in jazz require specialized voicing approaches - a tonic Cmaj7 is voiced differently than a Cmaj7 used as a dominant substitute.

**How It Works**:
1. Selects an appropriate voicing style based on chord function
2. Establishes the chord's fundamental intervals
3. Adds appropriate extensions and alterations
4. Applies specific voicing techniques (drop 2, cluster, quartal)
5. Converts the abstract intervals to actual note strings
6. Handles special cases like slash chords
7. Fine-tunes register placement

**Why It Improves Sound**:
- Creates sophisticated voicings beyond basic triads and seventh chords
- Applies appropriate techniques for each chord type (altered dominants get tension, tonic chords get stability)
- Ensures voicings sound authentic to jazz piano traditions
- Maintains proper spacing and register distribution

### `selectVoicingType(chord, chordFunction)`

**Purpose**: Determines the optimal voicing approach based on the chord's function and character.

**Music Theory Context**: Different chord types in jazz call for different voicing techniques—quartal voicings for suspended and modal sounds, drop 2 for certain dominant functions, clusters for altered tensions, etc.

**How It Works**:
1. Analyzes the chord function object
2. Checks for specific characteristics (altered, modal, suspensions)
3. Applies heuristics from jazz theory about which voicing styles match which chord types
4. Returns the optimal voicing approach (close, open, drop2, quartal, cluster, etc.)

**Why It Improves Sound**:
- Matches voicing technique to harmonic function
- Creates stylistic authenticity across different jazz idioms
- Avoids inappropriate voicings (e.g., close position for altered dominants)
- Ensures each chord type gets its most effective sonic treatment

From the console:
```
🔮 isAltered + isDominant => 'altered' voicing
🧱 preferQuartal or isSus => 'quartal' voicing
```

### `getCoreIntervals(chord, chordFunction)`

**Purpose**: Identifies the fundamental interval structure that defines a chord's basic identity.

**Music Theory Context**: Every chord type has core intervals that define its basic sound before extensions and alterations—the "skeleton" of the chord.

**How It Works**:
1. Identifies the chord's root
2. Determines third type (major, minor, suspended)
3. Adds the appropriate fifth (perfect, diminished, augmented)
4. Incorporates seventh if present (major, minor, diminished)
5. Returns these core intervals with appropriate octave information

**Why It Improves Sound**:
- Ensures the fundamental chord quality is correctly established
- Provides a stable harmonic foundation before adding extensions
- Prioritizes the intervals most crucial to the chord's identity
- Maintains proper chord structure even with sophisticated voicings

### `addExtensionsAndAlterations(intervals, chord, chordFunction)`

**Purpose**: Enhances the core chord structure with extended and altered tones.

**Music Theory Context**: Jazz harmony is distinguished by its use of extensions (9ths, 11ths, 13ths) and alterations (b9, #9, #11, b13) that add color and tension.

**How It Works**:
1. Takes the core chord intervals 
2. Adjusts the fifth if altered (b5 or #5)
3. Adds appropriate extensions based on chord type and alterations
4. Places extensions and alterations at appropriate octave offsets
5. Ensures proper jazz-specific treatment of each added tone

**Why It Improves Sound**:
- Adds the characteristic colors of jazz harmony
- Creates proper tension in dominant chords
- Places extensions at appropriate registers to avoid conflicts
- Builds the complete jazz sound while maintaining harmonic clarity

## Helper Functions

### `getChordNotePool(chord)`

**Purpose**: Generates a pool of possible notes across multiple octaves for a given chord.

**Music Theory Context**: Each chord type defines a set of scale degrees (1, 3, 5, 7, etc.) that form its structure. This function translates those scale degrees into actual notes across the keyboard.

**How It Works**:
1. Takes a chord object with root, type, and extensions
2. Maps the theoretical intervals (root, 3rd, 5th, 7th, etc.) to semitone distances
3. Calculates the actual notes by applying these intervals to the root
4. Generates these notes across multiple octaves for flexibility in voicing

**Why It Improves Sound**:
- Provides a rich palette of notes for voice leading algorithms
- Ensures all available chord tones are considered when creating voicings
- Includes appropriate alterations (#11, b9, etc.) for jazz harmony
- Prevents the use of non-chord tones that would create unintended dissonance

### `getEssentialChordTones(chord)`

**Purpose**: Identifies the most important notes in a chord that define its sound and function.

**Music Theory Context**: In jazz theory, certain chord tones are considered essential to the chord's identity - the 3rd and 7th are particularly crucial as they define the chord quality and create guide tones.

**How It Works**:
1. Identifies the chord's root, third (major or minor), and seventh (major or minor)
2. For dominant chords, includes characteristic alterations (b9, #9, b5, etc.)
3. Places these notes in appropriate octaves (root in bass, extensions higher)
4. Prioritizes the tones that best communicate the chord's function

**Why It Improves Sound**:
- Ensures the chord's fundamental character is preserved even when voice leading
- Guarantees proper harmonic function is maintained
- Provides clarity in complex jazz progressions
- Makes altered dominants sound properly tense and leading

### `createBalancedInitialVoicing(chord)`

**Purpose**: Creates an optimally balanced first voicing when no previous chord exists for voice leading.

**Music Theory Context**: Initial voicings establish the tonal palette and register distribution for a progression, setting expectations for what follows.

**How It Works**:
1. Places the root in the bass register
2. Positions the 3rd and 7th in the middle register (crucial to jazz sound)
3. Distributes extensions in appropriate registers (9ths, 11ths, 13ths higher up)
4. Adjusts based on chord type (altered dominants, lydian chords, etc.)
5. Creates proper spacing between voices

**Why It Improves Sound**:
- Establishes a clear tonal foundation with the root
- Places the character-defining 3rd and 7th where they're clearly audible
- Creates a balanced sound across the frequency spectrum
- Mimics how a skilled jazz pianist would voice a first chord

### `createAlteredDominantVoicing(chord)`

**Purpose**: Specialized function for handling altered dominant chords, which require very specific treatment in jazz.

**Music Theory Context**: Altered dominants (containing b9, #9, b5, #5, etc.) are crucial in jazz for creating tension before resolution. Their voicing is particularly important to sound authentic.

**How It Works**:
1. Places root in bass register
2. Ensures 3rd and 7th (especially b7) are present in middle register
3. Strategically places alterations (b9, #9, b5, #5) for maximum tension
4. Creates appropriate dissonance between altered tones
5. Limits overlapping of critical altered tones

**Why It Improves Sound**:
- Creates the characteristic tension of altered dominants
- Ensures the resolution tendency of the dominant is preserved
- Places altered tones where they create maximum color
- Balances between tension and playability

### `applyVoicingTechnique(intervals, voicingType, chord)`

**Purpose**: Applies specific jazz voicing techniques to a collection of intervals.

**Music Theory Context**: Jazz piano has developed numerous voicing techniques (close, open, drop 2, quartal, etc.) that create different textural and harmonic effects.

**How It Works**:
1. Sorts intervals by scale degree
2. Based on the specified technique:
   - Close position: Keeps notes in compact arrangement
   - Open position: Spreads notes with wider intervals
   - Drop 2: Drops the second highest note down an octave (common in jazz guitar)
   - Quartal: Arranges notes in fourths rather than thirds
   - Cluster: Creates tight groupings for modern jazz sounds
   - Altered: Special arrangements for altered dominants
3. Adjusts octave offsets for each note accordingly

**Why It Improves Sound**:
- Creates texturally appropriate voicings for different musical contexts
- Avoids the bland sound of simple stacked thirds
- Provides variety in chord sonorities throughout a progression
- Matches voicing types to appropriate chord functions (quartal for modal, close for bebop, etc.)

### `applyLydianVoicing(chord, notes)`

**Purpose**: Creates specialized voicings for lydian-type chords (containing #11).

**Music Theory Context**: The lydian sound (with its raised 4th/#11) is a staple of modern jazz harmony, associated with composers like Wayne Shorter and Bill Evans.

**How It Works**:
1. Places root in bass register
2. Positions 3rd, 5th, and major 7th in middle register
3. Places the characteristic #11 in upper register
4. Adds 9th if present in chord type
5. Creates specific spacing to highlight the lydian quality

**Why It Improves Sound**:
- Emphasizes the bright, floating quality of lydian harmony
- Places the crucial #11 where it creates maximum color without clashing
- Creates the sophisticated, modern jazz sound associated with modal jazz
- Balances the potentially harsh #11 interval through proper spacing

### `applyMinor11Voicing(chord, notes)`

**Purpose**: Specialized function for voicing minor 11th chords, which have unique requirements.

**Music Theory Context**: Minor 11th chords (with perfect 11th, unlike major chords which prefer #11) are common in modal jazz and require careful voicing to avoid muddiness.

**How It Works**:
1. Places root in bass
2. Positions minor 3rd, 5th, and b7 in middle register
3. Places 9th and 11th in upper register
4. Creates appropriate spacing to avoid clashes between 3rd and 11th

**Why It Improves Sound**:
- Prevents the clash between minor 3rd and 11th through register separation
- Creates the dark, modal quality associated with minor 11th chords
- Allows the 11th to add color without creating muddiness
- Emulates the sound of pianist like McCoy Tyner who pioneered these voicings

### `applyProperJazzRegisters(notes)`

**Purpose**: Ensures notes are distributed across appropriate registers for optimal jazz sound.

**Music Theory Context**: Jazz piano voicing strongly emphasizes register - root and fifths lower, extensions higher, and guide tones (3rd/7th) in the middle for clarity.

**How It Works**:
1. Sorts notes by pitch
2. Identifies lowest note (usually root) and maintains its position
3. Places next few notes (typically 3rd, 7th, 5th) in middle register
4. Positions extensions (9ths, 11ths, 13ths) in upper registers
5. Ensures no excessive gaps or clusters

**Why It Improves Sound**:
- Creates proper tonal balance across the frequency spectrum
- Prevents muddiness in lower registers
- Gives extensions room to "breathe" in upper registers
- Mimics the register distribution used by professional jazz pianists

### `getDegreeValue(degree)`

**Purpose**: Converts interval notation (like "b9", "3", "#11") to semitone values.

**Music Theory Context**: Jazz theory uses a scale degree system (relative to major scale) with alterations to describe chord tones. These must be converted to actual semitone distances.

**How It Works**:
1. Maps interval names to their semitone distances from the root:
   - '1' = 0 semitones
   - '3' = 4 semitones
   - 'b7' = 10 semitones
   - '9' = 2 semitones (+ octave)
   - '#11' = 6 semitones (+ octave)
2. Returns the appropriate semitone value for calculation

**Why It Improves Sound**:
- Ensures accurate calculation of chord tones
- Handles enharmonic equivalents correctly
- Enables proper implementation of altered tones
- Serves as a foundation for all chord building processes

### `intervalsToNotes(root, intervals)`

**Purpose**: Converts abstract interval structures to actual note names with octaves.

**Music Theory Context**: Chords are theoretically defined by interval structures, but must be realized as specific notes (C, E, G, etc.) for playback.

**How It Works**:
1. Takes a root note and array of intervals
2. For each interval, calculates:
   - Semitone distance from root
   - Appropriate octave placement
   - Correct note name (preferring sharps or flats as appropriate)
3. Returns array of note strings (e.g., 'C4', 'E4', 'G4')

**Why It Improves Sound**:
- Translates theoretical chord structures into playable notes
- Ensures proper spelling of notes for jazz context
- Handles enharmonic spelling appropriately
- Manages octave placement for proper voicing

### `ensureCorrectBass(noteList, bassNote)`

**Purpose**: Ensures slash chords have the correct bass note at the bottom of the voicing.

**Music Theory Context**: Slash chords (like C/G or Fmaj7/D) are common in jazz and require a specific non-root note in the bass.

**How It Works**:
1. Removes any occurrences of the specified bass note from the chord
2. Adds the bass note in a low register
3. Places it at the beginning of the note array
4. Maintains the rest of the chord structure above it

**Why It Improves Sound**:
- Creates proper slash chord sonorities
- Ensures bass notes are actually in the bass
- Prevents doubling of the bass note
- Enables advanced harmonic concepts like polychords and upper structure triads

### `applyRegisterAdjustments(noteList)`

**Purpose**: Fine-tunes the octave placement of notes to ensure optimal spacing and range.

**Music Theory Context**: Practical jazz voicing requires awareness of the piano's range and proper spacing between voices for optimal sound. This mimics the physical constraints and aesthetic choices pianists make when voicing chords.

**How It Works**:
1. Converts notes to MIDI numbers for easy analysis
2. Checks for excessively wide spans (e.g., more than 2 octaves)
3. Moves notes that are too high or too low to more appropriate octaves
4. Ensures lowest notes aren't too low for clarity
5. Prevents extreme stretches that would be impractical to play
6. Maintains voice independence while ensuring cohesion

**Why It Improves Sound**:
- Prevents muddy low register voicings
- Avoids excessive spacing that would sound disconnected
- Ensures voicings remain within a musical range
- Creates more balanced, playable voicings that would sound good on actual instruments
- Maintains the acoustic principles of register-specific resonance

From the console:
```
📝 Before register fix: ['Ab2', 'E6', 'G3', 'B3', 'D4']
📊 After register adjustments: ['Ab2', 'E4', 'G3', 'B3', 'D4']
```

### `validateProgressionNotes()`

**Purpose**: Systematically checks all chords in the progression to ensure they have valid, playable notes.

**Music Theory Context**: Theoretical chord constructions sometimes produce unplayable or impractical note combinations that need adjustment to sound good.

**How It Works**:
1. Iterates through all sections and chords in the progression
2. Identifies notes in extreme registers (too high or too low)
3. Detects and fixes chords with too few notes to properly express their harmony
4. Moves notes to more appropriate registers
5. Adds essential chord tones if missing

**Why It Improves Sound**:
- Prevents inaudible notes outside practical range
- Ensures chord harmony is properly represented
- Fixes chord voicings that might sound weak or unclear
- Maintains consistent sound quality throughout progression

From the console:
```
Validating chord notes in progression...
Fixing notes in chord 2 of section 1: D7#9b13
Adding notes to chord 3 of section 2 - too few notes
Validation complete
```

### `emergencyResetAudio()`

**Purpose**: Provides a nuclear option to resolve stuck notes or audio glitches without refreshing the page.

**Music Theory Context**: Digital audio systems can sometimes get in states where notes are stuck or playback becomes glitchy - this provides a clean reset.

**How It Works**:
1. Immediately silences all output
2. Cancels any scheduled playback
3. Disposes of problematic audio resources
4. Rebuilds the audio system from scratch
5. Provides user feedback

**Why It Improves Sound**:
- Resolves audio artifacts that could interfere with listening
- Prevents stuck notes from masking new harmonies
- Ensures clean playback when audio system gets into problematic states
- Provides seamless recovery without losing the user's work

### `tryRecreateBasicSynth()`

**Purpose**: Creates a minimal, stable synth when more complex configurations fail.

**Music Theory Context**: Sometimes simpler is better - this function strips down to essentials to ensure playback continues.

**How It Works**:
1. Disposes of any existing synthesizer
2. Creates a new synthesizer with minimal settings
3. Configures only essential parameters
4. Connects it directly to the audio output

**Why It Improves Sound**:
- Provides graceful fallback when complex configurations fail
- Ensures continuous playback even when optimal settings aren't possible
- Maintains basic harmonic clarity when advanced features aren't available
- Prioritizes hearing the progression over perfect sound quality

### Advanced Audio Processing Functions

### `initSimpleTone(audioCtx, button, errorContainer, overlay)`

**Purpose**: Creates a specialized audio processing chain optimized for jazz chord voicings.

**Music Theory Context**: Jazz piano requires specific timbral qualities to sound authentic - this function sets up an audio processing chain that mimics those qualities.

**How It Works**:
1. Configures a master limiter to prevent clipping
2. Adds a reverb effect with parameters appropriate for jazz
3. Implements a 3-band EQ optimized for clarity in jazz voicings
4. Creates different synthesizer configurations based on the selected instrument
5. Sets appropriate envelope settings (attack, decay, sustain, release)

**Why It Improves Sound**:
- Creates a more realistic, pleasing timbre for jazz piano
- Prevents harsh digital clipping
- Adds appropriate spatial qualities through reverb
- Shapes frequency response to emphasize important chord components
- Manages note articulation to mimic a pianist's touch

From the code:
```javascript
// Create a master EQ for better frequency balance
this.masterEQ = new Tone.EQ3({
    low: 0,      // Neutral lows
    mid: -1,     // Slight mid scoop for clarity
    high: 1,     // Slight boost to highs for clarity
    lowFrequency: 250,
    highFrequency: 2500
});
```

### `getOscillatorTypeForInstrument()` and related instrument configuration functions

**Purpose**: Tailors the sound generation to match different jazz keyboard instruments.

**Music Theory Context**: Different keyboard instruments (piano, Rhodes, synth) have distinctive timbral characteristics that affect how chord voicings sound.

**How It Works**:
1. Selects appropriate oscillator types for each instrument
2. Configures instrument-specific envelope settings
3. Adjusts attack characteristics to match real instruments
4. Balances volume levels for each instrument type
5. Creates specialized synthesis chains for complex tones (like the Moog synth)

**Why It Improves Sound**:
- Creates more authentic instrument-specific sounds
- Adapts envelope settings to complement each instrument's character
- Ensures appropriate attack/release timing for different instruments
- Manages volume levels to maintain consistent output across instruments

From the code:
```javascript
// Check if we're using the Moog synth (instrument === "synth")
if (this.instrument === "synth") {
    // Create a balanced Moog-style synth
    this.synth = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 24,
        oscillator: {
            type: "sawtooth" // Classic Moog sawtooth
        },
        envelope: {
            attack: 0.05,  // Moderate attack
            decay: 0.2,
            sustain: 0.7,
            release: 0.6   // Good balance for chord transitions
        }
    });

    // Add a filter for Moog character
    const filter = new Tone.Filter({
        type: "lowpass",
        frequency: 2500,
        rolloff: -12,
        Q: 2
    });
}
```

### `updateEffects()` and `updateVolume()`

**Purpose**: Provides real-time control over audio processing parameters.

**Music Theory Context**: Musicians adjust timbral qualities and dynamics to suit different styles, sections, and emotional qualities of music.

**How It Works**:
1. Modifies reverb intensity based on user settings
2. Updates synthesizer volume levels
3. Applies changes in real-time without interrupting playback
4. Calibrates values to maintain consistent perceived loudness

**Why It Improves Sound**:
- Allows for musical expression through timbral and dynamic changes
- Enables adjustment to different acoustic contexts
- Permits style-specific sound shaping (more reverb for ballads, less for bebop)
- Ensures optimal signal levels throughout the audio chain

### Specialized Voicing Functions

### `prioritizeChordTones(notes, chord, chordFunction)`

**Purpose**: When there are too many notes, selects the most important ones for the chord's function.

**Music Theory Context**: In jazz harmony, some tones are more essential than others for establishing a chord's identity and function.

**How It Works**:
1. Sorts notes by pitch
2. Identifies the root, third, seventh, and fifth
3. Prioritizes keeping these essential tones
4. For altered dominants, ensures at least one characteristic alteration is included
5. For specific chord types (Lydian, etc.), preserves characteristic extensions
6. Fills remaining slots with other notes, favoring upper extensions

**Why It Improves Sound**:
- Prevents overly dense voicings that would sound cluttered
- Ensures the chord's basic identity is clear
- Retains the most colorful and characteristic extensions
- Creates harmonically clear but still rich-sounding voicings

### `getMIDI(note)`

**Purpose**: Converts note strings (e.g., 'C4') to MIDI note numbers for calculation.

**Music Theory Context**: MIDI numbers provide a universal way to measure pitch relationships regardless of note names and enharmonics.

**How It Works**:
1. Parses the note name and octave
2. Calculates the MIDI number (middle C = 60)
3. Handles special cases and prevents errors

**Why It Improves Sound**:
- Enables accurate distance calculations between notes
- Allows for comparing and sorting pitches
- Provides a foundation for voice leading calculations
- Enables accurate octave adjustments

### `getChordToneByInterval(rootNote, interval)`

**Purpose**: Finds the actual note name produced by applying a specific interval to a root note.

**Music Theory Context**: Jazz chord symbols specify extensions and alterations that need to be calculated relative to the root.

**How It Works**:
1. Takes a root note and interval name (e.g., 'C' and 'b9')
2. Calculates the semitone offset for that interval
3. Determines the resulting note (preferring jazz-standard spellings)
4. Returns the note name (without octave)

**Why It Improves Sound**:
- Ensures accurate calculation of chord tones
- Maintains proper jazz notation (preferring flats for alterations)
- Handles enharmonic spellings correctly
- Provides the foundation for all chord-building operations

### Voice Leading Improvement Functions

### `findClosestNote(prevNote, pool)`

**Purpose**: Finds the note in a pool that is closest in pitch to a previous note.

**Music Theory Context**: Voice leading in all styles of music aims to create smooth connections by minimizing the distance each voice moves.

**How It Works**:
1. Takes a previous note and a pool of possible new notes
2. Converts both to MIDI numbers
3. Calculates the distance (in semitones) between the previous note and each potential new note
4. Returns the note with the smallest distance

**Why It Improves Sound**:
- Creates smooth voice leading between chords
- Minimizes "jumps" in individual voices
- Maintains the continuity of melodic lines within harmonies
- Mimics how good pianists would voice lead between chords

### `adjustOctaveForSmoothness(note, prevNote)`

**Purpose**: Adjusts the octave of a note to minimize movement from a previous note.

**Music Theory Context**: When voice leading requires changing to a distant note, adjusting the octave can often make the transition smoother.

**How It Works**:
1. Analyzes the distance between the current octave placement and the previous note
2. Tries alternative octaves to see which creates the smallest move
3. Selects the octave that minimizes distance
4. Returns the note with the optimal octave

**Why It Improves Sound**:
- Prevents jarring octave jumps
- Creates smoother connections between chords
- Maintains voice identities across chord changes
- Makes chord progressions sound more connected and flowing

### `hasDenseClusterVoicing(notes)` and `hasExtremeIntervalSpread(notes)`

**Purpose**: Detects potentially problematic voicings with excessive clustering or spacing.

**Music Theory Context**: Certain voicing problems - like having too many notes clustered within a semitone, or having notes spread over an extreme range - can sound harsh or disconnected.

**How It Works**:
1. Analyzes the spacing between notes in a voicing
2. Detects closely packed semitone clusters (dense clusters)
3. Measures the total span of the voicing (extreme spread)
4. Flags voicings that exceed comfortable thresholds

**Why It Improves Sound**:
- Prevents harsh-sounding semitone clusters unless intentional
- Avoids voicings spread so wide they sound disconnected
- Creates more balanced, pleasing chord sounds
- Emulates the natural constraints a pianist would observe

## Performance and Analysis Functions

### `playVoicedChord(chord)`

**Purpose**: Performs the actual sound generation for a chord that has undergone voice leading and optimization.

**Music Theory Context**: The final stage of chord realization is translating the theoretical structure into sound, with attention to dynamics and articulation.

**How It Works**:
1. Takes a chord object with optimized voice-led notes
2. Ensures clean release of any previous notes
3. Sets appropriate volume and articulation
4. Triggers the optimized notes with appropriate duration
5. Handles potential problematic voicings with fallbacks

**Why It Improves Sound**:
- Creates clean transitions between chords
- Ensures proper balance in playback
- Articulates notes together for proper chord sound
- Provides appropriate separation between chords

### `formatChordNotes(notes)`

**Purpose**: Creates a human-readable representation of the notes in a chord.

**Music Theory Context**: Musicians need to see the actual note content of chords to understand their structure and voicing.

**How It Works**:
1. Takes an array of note strings (e.g., ['C3', 'E3', 'G3'])
2. Removes octave numbers for clarity
3. Creates a comma-separated list of note names

**Why It Improves Sound**:
- Doesn't directly affect sound, but provides crucial feedback
- Helps users understand the chord structure
- Enables educational insights into voice leading
- Facilitates debugging and refinement of the voicing algorithms

### Chord Preset Management

### `previewPreset(presetId)` and `loadPreset(presetId)`

**Purpose**: Provides professionally crafted jazz chord progressions as starting points or learning tools.

**Music Theory Context**: Jazz has a rich tradition of standard progressions and contemporary approaches. These presets capture different stylistic approaches to jazz harmony.

**How It Works**:
1. Loads predefined progression data representing different AI models' approaches
2. Validates and normalizes the chord data
3. Creates appropriate sections and chords
4. Initializes voice leading and playback
5. Provides descriptive information about the progression's characteristics

**Why It Improves Sound**:
- Offers professionally crafted voicings that demonstrate best practices
- Shows contrasting approaches to jazz harmony (classic, modern, experimental)
- Provides educational examples of sophisticated progressions
- Ensures users have access to authentic-sounding starting points

From the code, AI model presets include:
```javascript
// Preset 1: Gemma 3
'gemma3': {
    name: "Sophisticated Jazz Progression (Gemma 3)",
    description: "A 16-bar progression with polychords, altered dominants, and non-functional harmony",
    sections: [...]
},

// Preset 2: ChatGPT 4.5
'chatgpt45': {
    name: "Intricate Jazz Progression (ChatGPT 4.5)",
    description: "A 16-bar progression with modal interchange, bitonal chords, and altered dominants",
    sections: [...]
},

// Preset 3: Claude 3.7 Sonnet
'claude37': {
    name: "Sophisticated Jazz Progression (Claude 3.7 Sonnet)",
    description: "A multi-section progression with polytonal concepts and upper structure triads",
    sections: [...]
}
```

### `updateFeaturedPresetPreview(presetId)`

**Purpose**: Generates educational preview information about example progressions.

**Music Theory Context**: Understanding the theoretical concepts behind chord progressions is crucial for learning jazz harmony.

**How It Works**:
1. Updates the featured preset information
2. Generates preview data for educational display
3. Creates harmonic descriptions and explanations
4. Provides bar-by-bar analysis of progression features

**Why It Improves Sound**:
- Doesn't directly impact sound, but helps users understand what they're hearing
- Enables informed musical choices
- Connects theoretical concepts to practical examples
- Enhances learning about jazz harmony through concrete examples

From the code:
```javascript
this.featuredPreset.preview = [
    { bar: 1, name: 'Ebmaj7(#11)/G', notes: 'Upper-structure triads over unexpected bass' },
    { bar: 2, name: 'G7(b9,#11)', notes: 'Creates tension with altered extensions' },
    { bar: 3, name: 'Cmaj7(b5)/Bb', notes: 'Unusual bass note creates instability' },
    // ...
]
```

### Comprehensive Voice Leading Implementation

### `previousVoicing` and `voiceLeadingState`

**Purpose**: Maintains a persistent "memory" of previous voicings to inform smooth transitions.

**Music Theory Context**: In real jazz performance, pianists keep track of where their fingers were in the previous chord to minimize movement.

**How It Works**:
1. Stores the complete previous voicing
2. Tracks current voice assignments
3. Maintains state between chord changes
4. Provides context for voice leading decisions

**Why It Improves Sound**:
- Creates persistent voice identities throughout a progression
- Enables truly connected voice leading across multiple chords
- Simulates a pianist's physical and mental approach to voicing
- Builds a sense of continuity and flow across chord changes

### `optimizeChordNotes(notes)`

**Purpose**: Refines chord note selection when there are too many options.

**Music Theory Context**: Even with extended jazz chords, having too many notes can create muddiness - this function creates an optimal selection.

**How It Works**:
1. Removes duplicate notes using Set operations
2. Sorts notes by MIDI value for logical ordering
3. Limits to 12 notes maximum for playability
4. When limiting, keeps lowest 6 and highest 6 for balance
5. Reports optimization decisions to console

**Why It Improves Sound**:
- Prevents excessive density that could create mud
- Maintains the most important low and high register notes
- Creates more balanced, clearer chord sounds
- Mimics how a pianist would selectively voice dense harmonies

From the console:
```
Optimized notes (reduced from 14 to 12): ['C2', 'Eb2', 'G2', 'Bb2', 'D3', 'F3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5']
```

### The Voice Leading Engine: Tying It All Together

At its core, the application implements a sophisticated jazz-specific voice leading system that works similarly to how a skilled jazz pianist would approach chord voicings:

1. **Chord Function Analysis**: Determines the character and role of each chord (tonic, dominant, altered, modal, etc.)
2. **Essential Structure Identification**: Isolates the crucial tones that define each chord's character (3rd, 7th, altered tones)
3. **Voice Mapping**: Creates a direct relationship between voices across chord changes
4. **Minimal Movement Calculation**: Uses MIDI math to find the smallest possible movements between chords
5. **Register Optimization**: Distributes notes across appropriate ranges for optimal sound
6. **Style-Specific Treatment**: Applies different approaches to different types of chords (altered dominants, lydian major chords, modal minor chords)
7. **Validation and Correction**: Ensures the resulting voicings are musically sensible and fixes potential problems

This multi-stage process creates chord progressions that not only sound theoretically correct but have the authentic sound and flow of professional jazz harmony. The console logs throughout the code reveal this sophisticated decision-making in real-time:

```
🎵 Processing voice leading for chord: D7(b9)
📝 Previous voicing: ['C3', 'E3', 'G3', 'B3', 'F#4']
📝 Essential chord tones: ['D2', 'F#3', 'C3', 'A3', 'Eb4']
👉 Essential tone D2 paired with previous C3 (distance: 10 semitones)
👉 Essential tone F#3 paired with previous G3 (distance: 1 semitones)
👉 Essential tone C3 paired with previous E3 (distance: 4 semitones)
👉 Essential tone A3 paired with previous B3 (distance: 2 semitones)
👉 Essential tone Eb4 paired with previous F#4 (distance: 3 semitones)
📝 Voice assignments before adjustment: [...]
👉 Note D: Adjusted from D2 to D3 (jump reduced from 10 to 2 semitones)
👉 Essential note F#: Jump of 1 semitones is acceptable
📝 After octave adjustment: ['D3', 'F#3', 'C3', 'A3', 'Eb4']
🔄 Running optimized jazz voicing algorithm...
📝 Applying proper voicing type for chord quality
📝 Using altered dominant voicing structure
✨ Final optimized jazz voicing: ['D2', 'C3', 'Eb3', 'F#3', 'A4']
▶️ TRIGGERING CHORD PLAYBACK with 5 notes
```

This level of detail and sophistication is what separates this application from simpler chord players, creating an experience that truly captures the nuanced art of jazz harmony. By combining music theory expertise with computational techniques, it creates voice-led progressions that sound authentic, musical, and professionally crafted - truly bridging the gap between theoretical knowledge and practical jazz performance.

---

*"Jazz isn't just about playing the right notes, but about understanding the relationships between them. This tool helps visualize and hear those relationships."*
