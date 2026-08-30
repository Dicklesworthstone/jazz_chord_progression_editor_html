import Foundation

enum JazzLibrary {
    // One source line per entry keeps the reviewed musical corpus auditable.
    // swiftlint:disable line_length
    static let entries: [LibraryEntry] = [
        LibraryEntry(id: "two-five-one", title: "ii–V–I in C", kicker: "THE FOUNDATION CADENCE", note: "The sentence every other progression is built from.", provenance: .device, chartText: "| Dm7 | G7 | Cmaj7 | Cmaj7 |", key: .c, tempo: 132, groove: .mediumSwing),
        LibraryEntry(id: "turnaround", title: "I–vi–ii–V turnaround", kicker: "TURNAROUND TEMPLATE", note: "Four bars that loop forever—the standard practice vamp.", provenance: .device, chartText: "| Cmaj7 | Am7 | Dm7 | G7 |", key: .c, tempo: 144, groove: .mediumSwing),
        LibraryEntry(id: "minor-two-five", title: "Minor ii–V–i", kicker: "THE MINOR CADENCE", note: "Half-diminished into an altered dominant, landing minor.", provenance: .device, chartText: "| Dm7b5 | G7b9 | Cm9 | Cm9 |", key: .c, tempo: 120, groove: .ballad),
        LibraryEntry(id: "jazz-blues", title: "Jazz blues in F", kicker: "BLUES TEMPLATE", note: "Twelve bars with the quick IV and a ii–V turnaround.", provenance: .device, chartText: "| F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7 | Gm7 | C7 | F7 D7 | Gm7 C7 |", key: .f, tempo: 152, groove: .mediumSwing),
        LibraryEntry(id: "dorian", title: "Modal vamp in D Dorian", kicker: "MODAL DEVICE", note: "Two chords, no cadence—room to hear a mode instead of a key.", provenance: .device, chartText: "| Dm9 | Dm9 | Em9 | Dm9 |", key: .d, tempo: 116, groove: .straightEighths),
        LibraryEntry(id: "coltrane", title: "Major-third cycle", kicker: "COLTRANE MATRIX", note: "Three tonal centers a major third apart, each reached by its dominant.", provenance: .device, chartText: "| Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 |", key: .b, tempo: 168, groove: .mediumSwing),
        LibraryEntry(id: "rhythm", title: "Rhythm-changes A section", kicker: "TURNAROUND LANGUAGE", note: "I–vi–ii–V, a diminished pivot, then home again.", provenance: .device, chartText: "| Bb G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Bb Bb7 | Ebmaj7 Edim7 | Bb/F G7 | Cm7 F7 |", key: .bb, tempo: 176, groove: .mediumSwing),
        LibraryEntry(id: "bird-blues", title: "Bird blues", kicker: "BEBOP BLUES", note: "A blues rebuilt from descending ii–Vs before rejoining the form.", provenance: .device, chartText: "| Fmaj7 | Em7b5 A7 | Dm7 G7 | Cm7 F7 | Bbmaj7 | Bbm7 Eb7 | Am7 | Abm7 Db7 | Gm7 | C7 | Fmaj7 D7 | Gm7 C7 |", key: .f, tempo: 184, groove: .mediumSwing),
        LibraryEntry(id: "tritone", title: "Tritone substitution chain", kicker: "SUBSTITUTION DEVICE", note: "Shared tritones let dominant roots descend chromatically.", provenance: .device, chartText: "| Dm7 Db7 | Cmaj7 B7 | Bbm7 A7 | Abmaj7 G7 | Gm7 Gb7 | Fmaj7 E7 | Ebm7 D7 | Cmaj7 |", key: .c, tempo: 124, groove: .bossaNova),
        LibraryEntry(id: "tristan", title: "Tristan Prelude opening", kicker: "WAGNER · 1859", note: "A half-diminished sonority resolves to a dominant that refuses to land.", provenance: .publicDomain, chartText: "| Fm7b5 | E7 | Fm7b5 | E7 | Abm7b5 | G7 | Bm7b5 | Bb7 |", key: .a, tempo: 68, groove: .ballad),
        LibraryEntry(id: "lament", title: "Lament bass", kicker: "BAROQUE GROUND", note: "One bass line walks down a fourth while the harmony re-reads each step.", provenance: .publicDomain, chartText: "| Cm | Cm/B | Cm/Bb | Ab | Fm7b5 | G7 | Cm | G7 |", key: .c, tempo: 76, groove: .ballad),
        LibraryEntry(id: "pachelbel", title: "Pachelbel cycle", kicker: "PACHELBEL · C. 1680", note: "The most borrowed eight-bar cycle in tonal music.", provenance: .publicDomain, chartText: "| D | A | Bm | F#m | G | D | G | A |", key: .d, tempo: 104, groove: .straightEighths),
        LibraryEntry(id: "gymnopedie", title: "Gymnopédie colors", kicker: "SATIE · 1888", note: "Two major sevenths breathe against each other without a cadence.", provenance: .publicDomain, chartText: "| Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 | Bm7 | Em7 | A7 |", key: .g, tempo: 72, groove: .ballad),
        LibraryEntry(id: "ragtime", title: "Ragtime dominants", kicker: "JOPLIN · 1899", note: "A chain of dominants, each tonicizing the next.", provenance: .publicDomain, chartText: "| E7 | A7 | D7 | G7 | C | A7 | D7 G7 | C |", key: .c, tempo: 126, groove: .mediumSwing),
        LibraryEntry(id: "glass-lab", title: "Glass elevator", kicker: "ORIGINAL STUDY", note: "Parallel major sevenths meet chromatic dominant gravity.", provenance: .study, chartText: "| Cmaj7 | Ebmaj7 | Abmaj7 | Db7 | Cmaj7 A7 | Dm9 G13 | Cmaj9 | Cmaj9 |", key: .c, tempo: 112, groove: .straightEighths),
        LibraryEntry(id: "backdoor", title: "Backdoor after midnight", kicker: "ORIGINAL STUDY", note: "A minor iv and ♭VII dominant avoid the ordinary leading-tone cadence.", provenance: .study, chartText: "| Cmaj7 | Fm9 | Bb13 | Cmaj9 | Am7 | D7#9 | Dm9 G13 | Cmaj9 |", key: .c, tempo: 92, groove: .ballad)
    ]
    // swiftlint:enable line_length

    static let starter = LibraryEntry(
        id: "starter",
        title: "Midnight laboratory",
        kicker: "WELCOME CHART",
        note: "A compact original progression with enough color to explore every surface.",
        provenance: .study,
        chartText: "| Cmaj9 | Bm7b5 E7b9 | Am9 | D13 | Dm9 G13 | Cmaj7 A7#5 | Dm9 G7b9 | C6 |",
        key: .c,
        tempo: 118,
        groove: .mediumSwing
    )
}
