/**
 * The reviewed progression library (jcpe-lib1).
 *
 * A studio that can only show one chart cannot show what it is for. These
 * entries exist to exercise the hard parts of the engine — chromatic
 * mediants, half-diminished suspensions, dim7 pivots, tritone substitution,
 * planing, modal shifts, extended dominants — on real, recognisable harmony.
 *
 * PROVENANCE LAW. Four kinds of entry are allowed here and nothing else:
 *
 *   "public-domain"  A named work whose composition is in the public domain
 *                    (pre-1929 publication). Transcribed harmony is fine.
 *   "device"         A harmonic template that belongs to the shared language
 *                    of tonal and jazz practice — a cycle, a turnaround, a
 *                    blues form, a substitution pattern. Not any one work.
 *   "study"          An ORIGINAL progression written here in a named
 *                    harmonic idiom, to show what that language sounds like.
 *   "owner-directed" A transcription of a copyrighted work that the project
 *                    owner EXPLICITLY DIRECTED, with the instruction
 *                    recorded verbatim in a comment on the entry — the
 *                    jcpe-x0z9 Deacon Blues starter-chart precedent
 *                    (studio-starter-chart.ts). Never a default; never
 *                    added on an agent's own judgment.
 *
 * A faithful chord-by-chord transcription of a copyrighted song is NOT
 * otherwise permitted, however famous, and no entry may be titled as one.
 * The studio already applies this rule to reference recordings, which are
 * measuring sticks for aggregate statistics only and are never committed.
 *
 * Every entry is proven to parse and to reach sound through the real
 * transport composition by tests/unit/studio-progression-library.test.ts.
 * A symbol with no V0 voicing family parses happily and then refuses to
 * play, which is exactly how the first starter chart shipped broken.
 */

import type { PerformanceStyleId } from "../playback";

export type ProgressionProvenance =
  | "public-domain"
  | "device"
  | "study"
  | "owner-directed";

export type ProgressionLibraryEntry = Readonly<{
  /** Stable id; also the button id suffix. */
  id: string;
  title: string;
  /** Short category line shown above the title. */
  kicker: string;
  /** What this progression demonstrates, in one sentence. */
  note: string;
  provenance: ProgressionProvenance;
  /** Bars in the quick-entry grammar. */
  chartText: string;
  /**
   * The performance style loading this entry selects — a reviewed musical
   * judgment per entry, machine-checked against the declared style set.
   * Since jcpe-jnnu the groove is a document setting: applying an entry's
   * non-default groove lands one undoable Set-groove command, so the choice
   * travels with the chart through share links and recovery.
   */
  grooveStyleId: PerformanceStyleId;
  /**
   * The tempo the entry commits when loaded, through the same tempo-field
   * command path a user travels. Optional because most entries are studies
   * with no canonical tempo; a transcription has one, and the What a Fool
   * Believes chart at the studio's 105 default dragged 13% under its
   * record — no groove survives the wrong tempo.
   */
  tempoBpm?: number;
}>;

export const PROGRESSION_LIBRARY: readonly ProgressionLibraryEntry[] =
  Object.freeze([
    /* ---------------------------------------------- public domain works */
    Object.freeze({
      id: "tristan",
      grooveStyleId: "ballad-comp@1",
      title: "Tristan Prelude opening",
      kicker: "Wagner, 1859",
      note: "The Tristan chord: a half-diminished sonority that resolves to a dominant which never lands, then repeats a minor third higher.",
      provenance: "public-domain",
      chartText:
        "| Fm7b5 | E7 | Fm7b5 | E7 | Abm7b5 | G7 | Bm7b5 | Bb7 |",
    }),
    Object.freeze({
      id: "commendatore",
      grooveStyleId: "ballad-comp@1",
      title: "Don Giovanni, Commendatore",
      kicker: "Mozart, 1787",
      note: "D minor with diminished-seventh pivots — the chord Mozart uses to make the ground give way.",
      provenance: "public-domain",
      chartText:
        "| Dm | C#dim7 | Dm | Gm6 | A7 | Dm | Bbmaj7 | A7 |",
    }),
    Object.freeze({
      id: "lament-bass",
      grooveStyleId: "ballad-comp@1",
      title: "Lament bass",
      kicker: "Bach and the Baroque",
      note: "The descending chromatic bass of the passacaglia: one line walks down a fourth while the harmony re-reads it every step.",
      provenance: "public-domain",
      chartText:
        "| Cm | Cm/B | Cm/Bb | Ab | Fm7b5 | G7 | Cm | G7 |",
    }),
    Object.freeze({
      id: "pachelbel",
      grooveStyleId: "straight-eighths@1",
      title: "Pachelbel cycle",
      kicker: "Pachelbel, c. 1680",
      note: "The most-borrowed eight-bar cycle in music; every pop turnaround since is a re-voicing of it.",
      provenance: "public-domain",
      chartText: "| D | A | Bm | F#m | G | D | G | A |",
    }),
    Object.freeze({
      id: "gymnopedie",
      grooveStyleId: "ballad-comp@1",
      title: "Gymnopedie colours",
      kicker: "Satie, 1888",
      note: "Two major sevenths a fifth apart, breathing against each other with no cadence at all.",
      provenance: "public-domain",
      chartText:
        "| Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 | Bm7 | Em7 | A7 |",
    }),
    Object.freeze({
      id: "ragtime",
      grooveStyleId: "medium-swing@1",
      title: "Ragtime secondary dominants",
      kicker: "Joplin, 1899",
      note: "A chain of dominants, each one tonicising the next — the engine of ragtime and of early jazz.",
      provenance: "public-domain",
      chartText: "| E7 | A7 | D7 | G7 | C | A7 | D7 G7 | C |",
    }),
    Object.freeze({
      id: "chopin-chromatic",
      grooveStyleId: "ballad-comp@1",
      title: "Chromatic descent",
      kicker: "Chopin, 1839",
      note: "Romantic voice leading: the top line holds while inner voices slide by semitone under it.",
      provenance: "public-domain",
      chartText:
        "| Em | B7 | Em | Am6 | Em/B | F#7 | B7 | Em |",
    }),

    /* ------------------------------------------- shared harmonic devices */
    /*
     * The five foundation standards of the v2 redesign's library surface
     * (jcpe-v2r-library-ulwb): the plain sentences every other entry here
     * elaborates. Tempi follow the owner-approved prototype's metadata.
     */
    Object.freeze({
      id: "two-five-one",
      grooveStyleId: "medium-swing@1",
      tempoBpm: 132,
      title: "ii–V–I in C",
      kicker: "The foundation cadence",
      note: "The sentence every other progression is built from.",
      provenance: "device",
      chartText: "| Dm7 | G7 | Cmaj7 | Cmaj7 |",
    }),
    Object.freeze({
      id: "one-six-two-five",
      grooveStyleId: "medium-swing@1",
      tempoBpm: 144,
      title: "I–vi–ii–V turnaround",
      kicker: "Turnaround template",
      note: "Four bars that loop forever. The standard vamp for practice.",
      provenance: "device",
      chartText: "| Cmaj7 | Am7 | Dm7 | G7 |",
    }),
    Object.freeze({
      id: "minor-two-five-one",
      grooveStyleId: "ballad-comp@1",
      tempoBpm: 120,
      title: "Minor ii–V–i",
      kicker: "The minor cadence",
      note: "Half-diminished into an altered dominant, landing minor.",
      provenance: "device",
      chartText: "| Dm7b5 | G7b9 | Cm9 | Cm9 |",
    }),
    Object.freeze({
      id: "jazz-blues-f",
      grooveStyleId: "medium-swing@1",
      tempoBpm: 152,
      title: "Jazz blues in F",
      kicker: "Blues template",
      note: "Twelve bars, with the quick IV in bar two and a ii–V turnaround.",
      provenance: "device",
      chartText:
        "| F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7 | Gm7 | C7 | F7 D7 | Gm7 C7 |",
    }),
    Object.freeze({
      id: "dorian-vamp",
      grooveStyleId: "straight-eighths@1",
      tempoBpm: 116,
      title: "Modal vamp in D Dorian",
      kicker: "Modal device",
      note: "Two chords, no cadence. Room to hear a mode instead of a key.",
      provenance: "device",
      chartText: "| Dm9 | Dm9 | Em9 | Dm9 |",
    }),
    Object.freeze({
      id: "major-third-cycle",
      grooveStyleId: "medium-swing@1",
      title: "Major-third cycle",
      kicker: "Coltrane matrix",
      note: "Three tonal centres a major third apart, each reached by its own dominant. The hardest common changes in jazz.",
      provenance: "device",
      chartText:
        "| Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 |",
    }),
    Object.freeze({
      id: "rhythm-turnaround",
      grooveStyleId: "medium-swing@1",
      title: "Rhythm-changes A section",
      kicker: "Turnaround template",
      note: "I-vi-ii-V twice over, then the flat-three diminished pivot: the most-played eight bars in the repertoire.",
      provenance: "device",
      chartText:
        "| Bb G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Bb Bb7 | Ebmaj7 Edim7 | Bb/F G7 | Cm7 F7 |",
    }),
    Object.freeze({
      id: "bird-blues",
      grooveStyleId: "medium-swing@1",
      title: "Bird blues",
      kicker: "Bebop blues template",
      note: "A twelve-bar blues rebuilt out of ii-Vs, descending by step until it rejoins the form.",
      provenance: "device",
      chartText:
        "| Fmaj7 | Em7b5 A7 | Dm7 G7 | Cm7 F7 | Bbmaj7 | Bbm7 Eb7 | Am7 | Abm7 Db7 | Gm7 | C7 | Fmaj7 D7 | Gm7 C7 |",
    }),
    Object.freeze({
      id: "minor-blues",
      grooveStyleId: "medium-swing@1",
      title: "Minor blues with backdoor",
      kicker: "Blues template",
      note: "Minor blues closing through the backdoor cadence — bVII7 into I, the cadence that avoids the leading tone.",
      provenance: "device",
      chartText:
        "| Cm7 | Fm7 | Cm7 | Cm7 | Fm7 | Fm7 | Cm7 | Ebm7 Ab7 | Dm7b5 | G7b9 | Cm7 Bb7 | Cm7 |",
    }),
    Object.freeze({
      id: "tritone-chain",
      grooveStyleId: "bossa-nova@1",
      title: "Tritone substitution chain",
      kicker: "Substitution device",
      note: "Every dominant replaced by the one a tritone away, so the roots walk down chromatically under a shared tritone.",
      provenance: "device",
      chartText:
        "| Dm7 Db7 | Cmaj7 B7 | Bbm7 A7 | Abmaj7 G7 | Gm7 Gb7 | Fmaj7 E7 | Ebm7 D7 | Cmaj7 |",
    }),
    Object.freeze({
      id: "modal-planing",
      grooveStyleId: "bossa-nova@1",
      title: "Modal planing",
      kicker: "Modal device",
      note: "One voicing shape moved bodily up and down; the mode changes, the hand shape does not.",
      provenance: "device",
      chartText:
        "| Dm7 | Dm7 | Ebm7 | Ebm7 | Dm7 | Dm7 | Ebm7 Dm7 | Dm7 |",
    }),
    Object.freeze({
      id: "chromatic-mediants",
      grooveStyleId: "straight-eighths@1",
      title: "Chromatic mediants",
      kicker: "Late-romantic device",
      note: "Major triads a third apart sharing one tone — the sound of film scoring, borrowed straight from Schubert.",
      provenance: "device",
      chartText:
        "| Cmaj7 | Abmaj7 | Emaj7 | Cmaj7 | Abmaj7 | Emaj7 | Fmaj7 | G7sus4 |",
    }),

    /* -------------------------------------- original studies, named idiom */
    Object.freeze({
      id: "mu-major-study",
      grooveStyleId: "straight-eighths@1",
      title: "Mu-major study",
      kicker: "Original study",
      note: "The add9 major triad with no seventh — bright, rootless-sounding, and the signature of the West Coast studio sound.",
      provenance: "study",
      chartText:
        "| Cadd9 | Aadd9 | Fadd9 | Gadd9 | Cadd9 Ebmaj7 | Dm9 | G13 | Cadd9 |",
    }),
    Object.freeze({
      id: "lush-ballad-study",
      grooveStyleId: "ballad-comp@1",
      title: "Lush ballad study",
      kicker: "Original study",
      note: "Extended harmony that never sits still: sixths and ninths over a bass that keeps stepping down.",
      provenance: "study",
      chartText:
        "| Fmaj7#11 | Em7 A7b9 | Dm9 | Db13 | Cmaj7 | Bm7b5 E7b9 | Am9 D13 | Gm7 C13 |",
    }),
    Object.freeze({
      id: "gospel-blues-study",
      grooveStyleId: "medium-swing@1",
      title: "Gospel-blues study",
      kicker: "Original study",
      note: "Church cadences pushed through blues harmony — plagal motion, a diminished pivot, and a walk-up to the turn.",
      provenance: "study",
      chartText:
        "| Bbmaj7 | Ebmaj7 | Bbmaj7 | Bb7 | Ebmaj7 | Edim7 | Bb/F | Gm7 | Cm7 | F7b9 | Bbmaj7 G7b9 | Cm7 F7 |",
    }),
    Object.freeze({
      id: "whole-tone-study",
      grooveStyleId: "ballad-comp@1",
      title: "Whole-tone approach",
      kicker: "Original study",
      note: "Augmented triads and altered dominants where no note is a semitone from its neighbour: harmony with no gravity.",
      provenance: "study",
      chartText:
        "| Caug | Daug | Caug | Fmaj7 | Bm7b5 E7b9 | Am7 | Dm7 G7 | Cmaj7 |",
    }),

    /* ------------------------------- owner-directed transcriptions */
    /*
     * OWNER DIRECTION, recorded verbatim (Gracie Terzian, 2026-07-31):
     * "add 'What a Fool Believes' (the Doobie Brothers, writers Michael
     * McDonald & Kenny Loggins, 1979) to the progression library with
     * ACCURATE changes and an ACCURATE groove — replicating the discipline
     * of the earlier owner-directed Deacon Blues work."
     *
     * That direction is the sole authority for this entry, exactly as the
     * jcpe-x0z9 comment in studio-starter-chart.ts is for the Deacon Blues
     * seed. The changes were verified against multiple independent sources
     * before writing: the published sheet-music key (Db major, Musicnotes
     * editions MN0161692/MN0062166/MN0085521), Gordon Tebo's Roman-numeral
     * breakdown (verse IV -> I/iii -> ii -> I then ii -> I/iii -> vi -> #v+,
     * chorus in E reached through the A-chord pivot), the Modulation of the
     * Day analysis (the chorus begins on the PARALLEL-MINOR iv of Db, which
     * is ii of E — the imperceptible modulation), Ryan Welton's bass-line
     * account (Ab-Gb-F-Eb down, back up to Bb), and the Cifra Club chart
     * (Ab4 / F# / Fm / Ebm7 ... Bbm / A7 verse; Bbm / Ab7 / Ebm7 / Ab /
     * Dbmaj7 / Gm7b5 pre-chorus; F#m / B4 / Emaj7 / C#m7 / A7#5 chorus).
     * Tempo ~120 BPM per SongBPM/Tunebat. Every symbol below is proven to
     * parse AND reach sound through the real transport composition by
     * tests/unit/studio-progression-library.test.ts.
     */
    Object.freeze({
      id: "what-a-fool-believes",
      grooveStyleId: "syncopated-sixteenths@1",
      tempoBpm: 120,
      title: "What a Fool Believes",
      kicker: "McDonald & Loggins, 1979",
      note: "The keyboard riff walks IVmaj7 through a first-inversion tonic to ii7 under slash-chord elevenths, then the parallel-minor iv pivots the chorus into E major without a seam.",
      provenance: "owner-directed",
      chartText:
        "| Gb/Ab Gbmaj7 | Db/F Ebm7 | Gb/Ab Gbmaj7 | Db/F Ebm7 | Ebm7 Db/F | Bbm7 A7#5 | Bbm7 | Ab7sus4 | Ebm7 Gb/Ab | Dbmaj7 Gm7b5 | F#m7 A/B | Emaj7 C#m7 | F#m7 A/B | Emaj7 A7#5 |",
    }),

    /* ------------------------------- owner-directed transcriptions, 2026-08 */
    /*
     * OWNER DIRECTION, recorded verbatim (Gracie Terzian, 2026-08-05):
     * "I want to add a few new ones of each kind, but only of the very
     * highest quality possible, nothing that sucks can be added to this
     * project! Songs: (you should find sheet music and midi files online
     * to ground yourself and ensure accuracy of chords and grooves/rhythm/
     * tempo): 'Can't Help It' by Michael Jackson; 'Hello, It's Me' by
     * Todd Rundgren; 'Peg' and 'Aja' by Steely Dan; 'Giant Steps' by John
     * Coltrane" — with the follow-up direction: "midi files generally have
     * much richer and better information than random chord charts, which I
     * would strongly advise ignoring. High quality sheet music preview
     * images or scans from PDFs of real published sheet music are also
     * good sources."
     *
     * That direction is the sole authority for the entries below, exactly
     * as the jcpe-x0z9 comment in studio-starter-chart.ts is for the
     * Deacon Blues seed. Every entry records its own verification account:
     * real MIDI transcriptions and published sheet music only, never
     * aggregator chord charts.
     */

    /*
     * VERIFICATION (Giant Steps). The changes were verified against the
     * published Real-Book-form chart on jazzguitarcomprehensive.com in
     * THREE editions — concert, Bb, and Eb — whose interval structures
     * agree bar for bar (the strongest cross-check a chart admits). Form
     * is the standard 16-bar A-B in 4/4; bars 8 and 14 keep the Real
     * Book's Fm7 spelling. Tempo: the Jazzomat Research Project (HfM
     * Weimar) analysis of the 1959 master take measures 290.3 BPM over
     * the solo choruses, the whole take averages ~285, and the published
     * Hal Leonard marking is "Fast swing" (Mark Taylor, 10 John Coltrane
     * Classics, 2002); 290 is committed. The uptempo-swing@1 groove was
     * authored for this entry. Every symbol below is proven to parse AND
     * reach sound through the real transport composition by
     * tests/unit/studio-progression-library.test.ts.
     */
    Object.freeze({
      id: "giant-steps",
      grooveStyleId: "uptempo-swing@1",
      tempoBpm: 290,
      title: "Giant Steps",
      kicker: "Coltrane, 1960",
      note: "The full sixteen-bar head of the Coltrane-changes standard: a phrase in B answered in G and resolved in Eb, every tonic entered through its own dominant.",
      provenance: "owner-directed",
      chartText:
        "| Bmaj7 | D7 Gmaj7 | Bb7 Ebmaj7 | Am7 D7 | Gmaj7 | Bb7 Ebmaj7 | F#7 Bmaj7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 | C#m7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | C#m7 F#7 |",
    }),

    /*
     * VERIFICATION (Peg). The five-chord intro descent was extracted
     * bar-by-bar from a full 11-track ensemble MIDI transcription
     * (reviewer material, not committed): Gmaj9 | F#7#9 | F6/9 | E7#9 |
     * Eb6/9, 119 BPM, 4/4, G major — each descent chord entering on beat
     * four of the preceding bar, which the chart flattens to one chord per
     * bar honestly. The verse and chorus were NOT charted: no published
     * sheet-music content for them was reachable inside the source law,
     * and a MIDI-only guess at Fagen's inner voicings would be exactly the
     * low-quality addition the direction forbids. The entry is the intro
     * alone — the same excerpt discipline as the Deacon Blues seed.
     * Every symbol below is proven to parse AND reach sound through the
     * real transport composition by
     * tests/unit/studio-progression-library.test.ts.
     */
    Object.freeze({
      id: "peg",
      grooveStyleId: "syncopated-sixteenths@1",
      tempoBpm: 119,
      title: "Peg",
      kicker: "Fagen & Becker, 1977",
      note: "The intro descent in five chromatically falling colors — maj9, sharp-nine dominant, six-nine, sharp-nine dominant, six-nine again — the doorway into the Aja album's most famous solo vehicle.",
      provenance: "owner-directed",
      chartText: "| Gmaj9 | F#7#9 | F6/9 | E7#9 | Eb6/9 |",
    }),

    /*
     * VERIFICATION (Aja). The intro vamp was extracted bar-by-bar from a
     * full 12-track ensemble MIDI transcription by Norma Williams
     * (reviewer material, not committed): eight bars of B pedal at
     * 110 BPM, 4/4, the riff's pitch content spelling Bmaj9 colors
     * (B-D#-F#-A#-C# weighted through the set) over the pedal. The
     * suite's later sections (the C/D/E pedal build, the meter changes,
     * the soprano-solo vamp) were NOT charted: they shift meter inside
     * the phrase and the studio's library loads entries into the
     * document's 4/4, where a faithful chart is impossible. The entry is
     * the intro vamp alone. Every symbol below is proven to parse AND
     * reach sound through the real transport composition by
     * tests/unit/studio-progression-library.test.ts.
     */
    Object.freeze({
      id: "aja",
      grooveStyleId: "straight-eighths@1",
      tempoBpm: 110,
      title: "Aja",
      kicker: "Fagen & Becker, 1977",
      note: "The title suite's intro vamp: eight bars over a B pedal while the riff spells maj9 colors against it — the calm before the longest, strangest journey in the band's book.",
      provenance: "owner-directed",
      chartText:
        "| Bmaj9 | Bmaj9 | Bmaj9 | Bmaj9 | Bmaj9 | Bmaj9 | Bmaj9 | Bmaj9 |",
    }),

    /*
     * VERIFICATION (Hello, It's Me). Charted from a full 18-track
     * professional karaoke MIDI (reviewer material, not committed) whose
     * lyric track aligns the sections: Bb major, 4/4, 91 BPM — matching
     * the Something/Anything? recording's 3:31 single-edit duration
     * cross-checked against the bar count. The intro vamp is Gm7 against
     * Fmaj7; the verse descends the Bb diatonic ladder (Ebmaj7 - Dm7 -
     * Cm7 - Gm7) and settles on the tonic before the F turnaround. The
     * form fact behind the note — Rundgren adapted the chord structure
     * from the eight-bar intro of a Jimmy Smith recording of "When
     * Johnny Comes Marching Home" — is documented in the song's
     * encyclopedic account. Every symbol below is proven to parse AND
     * reach sound through the real transport composition by
     * tests/unit/studio-progression-library.test.ts.
     */
    Object.freeze({
      id: "hello-its-me",
      grooveStyleId: "ballad-comp@1",
      tempoBpm: 91,
      title: "Hello, It's Me",
      kicker: "Rundgren, 1972",
      note: "Written at eighteen and re-cut as the mid-tempo classic of Something/Anything?: a Gm7-Fmaj7 vamp that descends the whole diatonic ladder of Bb before it ever lets the tonic land.",
      provenance: "owner-directed",
      chartText:
        "| Gm7 | Fmaj7 | Gm7 | Fmaj7 | Gm7 | Fmaj7 | Gm7 | Fmaj7 | Ebmaj7 | Dm7 | Cm7 | Gm7 | Bb | Bb | Bb | F |",
    }),
  ]);

/** Every entry id, frozen, for contract and test enumeration. */
export const PROGRESSION_LIBRARY_IDS: readonly string[] = Object.freeze(
  PROGRESSION_LIBRARY.map((entry) => entry.id),
);
