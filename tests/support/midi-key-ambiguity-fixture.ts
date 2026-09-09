/** Original SMF: two bars of equal-duration C/Eb/F#/A, no separate bass weighting. */
export function ambiguousKeyMidi(transpose = 0): Uint8Array {
  const notes = [60, 63, 66, 69].map((note) => note + transpose);
  const events = [0, 255, 81, 3, 7, 161, 32]; // 120 BPM
  for (let bar = 0; bar < 2; bar++) {
    for (const note of notes) events.push(0, 144, note, 96);
    for (const [index, note] of notes.entries()) events.push(...(index === 0 ? [143, 0] : [0]), 128, note, 0); // 1920 ticks
  }
  events.push(0, 255, 47, 0);
  return Uint8Array.from([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224,
    77, 84, 114, 107, 0, 0, 0, events.length, ...events]);
}
