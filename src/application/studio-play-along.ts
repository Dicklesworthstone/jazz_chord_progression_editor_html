import { beatValueToMidiTicks, measureCapacity, MIDI_PPQ, type BeatRange, type ValidatedDocument } from "../domain";

type Span = Readonly<{
  start: number;
  end: number;
  measureStart: number;
  symbol: string;
  section: string;
  bar: number;
}>;

export type PlayAlongTimeline = Readonly<{
  spans: readonly Span[];
  beatTicks: number;
  beatsPerBar: number;
}>;

export type StudioPlayAlongView = Readonly<{
  status: string;
  current: string | null;
  next: string | null;
  section: string | null;
  bar: number | null;
  pulse: number | null;
  beatsPerBar: number;
}>;

/** Source-only timeline: accompaniment attacks never become chord changes. */
export function buildPlayAlongTimeline(document: ValidatedDocument): PlayAlongTimeline {
  const spans: Span[] = [];
  let tick = 0;
  let bar = 0;
  for (const section of document.sections) {
    for (const measure of section.measures) {
      bar += 1;
      const measureStart = tick;
      if (measure.completion.kind === "empty") {
        const end = tick + beatValueToMidiTicks(measureCapacity(document.meter));
        spans.push(Object.freeze({ start: tick, end, measureStart, symbol: "Rest", section: section.name, bar }));
        tick = end;
      } else {
        for (const event of measure.events) {
          const end = tick + beatValueToMidiTicks(event.duration);
          spans.push(Object.freeze({ start: tick, end, measureStart, symbol: event.chord.sourceText, section: section.name, bar }));
          tick = end;
        }
      }
    }
  }
  return Object.freeze({ spans: Object.freeze(spans), beatTicks: MIDI_PPQ * 4 / document.meter.beatUnit, beatsPerBar: document.meter.beatsPerBar });
}

function findSpan(spans: readonly Span[], tick: number): number {
  let left = 0;
  let right = spans.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const span = spans[mid];
    if (span !== undefined && span.end <= tick) left = mid + 1;
    else right = mid;
  }
  const found = spans[left];
  return found !== undefined && found.start <= tick && tick < found.end ? left : -1;
}

export function readPlayAlongTimeline(
  timeline: PlayAlongTimeline,
  quarterBeats: number,
  loop: BeatRange | null,
  status: string,
): StudioPlayAlongView {
  const tick = quarterBeats * MIDI_PPQ;
  const loopStart = loop === null ? null : beatValueToMidiTicks(loop.start);
  const loopEnd = loop === null ? null : beatValueToMidiTicks(loop.end);
  const index = Number.isFinite(tick) && (loopStart === null || tick >= loopStart) && (loopEnd === null || tick < loopEnd)
    ? findSpan(timeline.spans, tick) : -1;
  const current = timeline.spans[index];
  if (current === undefined) return Object.freeze({ status, current: null, next: null, section: null, bar: null, pulse: null, beatsPerBar: timeline.beatsPerBar });
  const nextIndex = loopEnd !== null && current.end >= loopEnd && loopStart !== null
    ? findSpan(timeline.spans, loopStart) : index + 1;
  return Object.freeze({ status, current: current.symbol, next: timeline.spans[nextIndex]?.symbol ?? null,
    section: current.section, bar: current.bar,
    pulse: Math.floor((tick - current.measureStart) / timeline.beatTicks) + 1, beatsPerBar: timeline.beatsPerBar });
}
