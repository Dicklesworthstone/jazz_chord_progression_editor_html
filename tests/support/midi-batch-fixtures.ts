/** Hand-authored SMF construction, independent of the production encoders. */
function vlq(value: number): number[] {
  const result = [value & 127];
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) result.unshift((rest & 127) | 128);
  return result;
}

export function batchChordFile(options: Readonly<{
  bars?: number;
  transpose?: number;
  leadingTicks?: number;
  tempo?: number;
  laterTempo?: number;
  channel?: number;
  omitTempo?: boolean;
}> = {}): Uint8Array {
  const notes = [60, 64, 67, 71].map((key) => key + (options.transpose ?? 0));
  const tempo = (value: number) => [0, 255, 81, 3, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  const events = options.omitTempo === true ? [] : [...tempo(options.tempo ?? 500_000)];
  for (let bar = 0; bar < (options.bars ?? 1); bar++) {
    if (bar === 1 && options.laterTempo !== undefined) events.push(...tempo(options.laterTempo));
    for (const [index, key] of notes.entries()) events.push(...vlq(bar === 0 && index === 0 ? options.leadingTicks ?? 0 : 0), 144 + (options.channel ?? 0), key, 96);
    for (const [index, key] of notes.entries()) events.push(...vlq(index === 0 ? 1920 : 0), 128 + (options.channel ?? 0), key, 0);
  }
  events.push(0, 255, 47, 0);
  return Uint8Array.from([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224,
    77, 84, 114, 107, (events.length >>> 24) & 255, (events.length >>> 16) & 255, (events.length >>> 8) & 255, events.length & 255,
    ...events,
  ]);
}

export function batchMultiTrack(channels: readonly number[], transpose = -24): Uint8Array {
  return Uint8Array.from([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, channels.length, 1, 224,
    ...channels.flatMap((channel, index) => [...batchChordFile({ bars: 5, transpose, channel, omitTempo: index !== 0 }).slice(14)]),
  ]);
}
