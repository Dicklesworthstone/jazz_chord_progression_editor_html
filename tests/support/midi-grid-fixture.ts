/** Independent format-0 SMF: four distinct major triads per bar. */
export function midiGridFixture(transpose = 0, bars = 1): Uint8Array {
  const events = [0, 255, 81, 3, 7, 161, 32]; // 120 BPM
  for (let bar = 0; bar < bars; bar += 1) {
    for (const root of [60, 62, 64, 66]) {
      for (const offset of [0, 4, 7]) events.push(0, 144, root + offset + transpose, 96);
      for (const [index, offset] of [0, 4, 7].entries()) {
        events.push(...(index === 0 ? [131, 96] : [0]), 128, root + offset + transpose, 0);
      }
    }
  }
  events.push(0, 255, 47, 0);
  return Uint8Array.from([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224,
    77, 84, 114, 107, (events.length >>> 24) & 255, (events.length >>> 16) & 255,
    (events.length >>> 8) & 255, events.length & 255, ...events,
  ]);
}
