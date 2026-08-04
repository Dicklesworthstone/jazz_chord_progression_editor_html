/**
 * E1 evidence gate.
 *
 * Independently verifies the production SMF type-1 MIDI writer from a
 * clean invocation and emits a hash-bound machine-readable ledger under
 * test-results/e1-evidence/. The gate:
 *
 * 1. snapshots the complete E1 input closure (production, contract, doc,
 *    fixtures, validator, kit, tests) before and after every run and
 *    rejects drift;
 * 2. re-runs the spec validator and the exact E1 test suite as child
 *    processes, requiring zero failures and zero skips;
 * 3. runs seeded metamorphic conformance in-process: deterministic
 *    pseudo-random plans are exported by production and checked, case by
 *    case, against this script's own freshly written minimal SMF reader
 *    and model derivation (no code shared with the validator or the test
 *    kit), plus byte-identical replay, marker-permutation invariance,
 *    tempo-isolation, and exact report-identity laws;
 * 4. records a large-plan performance observation (observation only — it
 *    gates nothing and cannot alter output).
 *
 * Wall time and resource numbers are measurements, never semantic inputs.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MIDI_EXPORT_MARKER_SCHEMA,
  MIDI_EXPORT_REQUEST_SCHEMA,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  exportMidi,
  type MidiExportRequest,
} from "../src/export";
import type { PlaybackPlan } from "../src/playback";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_DIR = resolve(ROOT, "test-results/e1-evidence");
const LEDGER_PATH = resolve(LEDGER_DIR, "e1-evidence-ledger.json");

const INPUT_CLOSURE = Object.freeze([
  "docs/E1_MIDI_EXPORT_CONTRACT.md",
  "scripts/validate-e1-contract.ts",
  "src/export/index.ts",
  "src/export/midi-export-contract.ts",
  "src/export/midi-export.ts",
  "tests/fixtures/midi-export/e1-midi-export-contract.json",
  "tests/fixtures/midi-export/golden-cases.json",
  "tests/fixtures/midi-export/limit-cases.json",
  "tests/fixtures/midi-export/mutation-controls.json",
  "tests/fixtures/midi-export/provenance-ledger.json",
  "tests/fixtures/midi-export/refusal-cases.json",
  "tests/fixtures/midi-export/trace-ledger.json",
  "tests/integration/playback-plan-consumers.test.ts",
  "tests/static/e1-contract.test.ts",
  "tests/support/midi-export-test-kit.ts",
  "tests/unit/midi-export-bytes.test.ts",
  "tests/unit/midi-export-limits.test.ts",
  "tests/unit/midi-export-losses.test.ts",
  "tests/unit/midi-export-markers.test.ts",
  "tests/unit/midi-export-ordering.test.ts",
  "tests/unit/midi-export-refusals.test.ts",
  "tests/unit/midi-export-report.test.ts",
  "tests/unit/midi-export-tempo.test.ts",
] as const);

const TEST_FILES = INPUT_CLOSURE.filter((path) => path.endsWith(".test.ts"));
const MINIMUM_SUITE_PASSES = 77;

const METAMORPHIC_SEEDS = Object.freeze([
  0xe10a0001, 0xe10a0002, 0xe10a0003, 0xe10a0004, 0xe10a0005, 0xe10a0006,
  0xe10a0007, 0xe10a0008, 0xe10a0009, 0xe10a000a, 0xe10a000b, 0xe10a000c,
  0xe10a000d, 0xe10a000e, 0xe10a000f, 0xe10a0010, 0xe10a0011, 0xe10a0012,
  0xe10a0013, 0xe10a0014, 0xe10a0015, 0xe10a0016, 0xe10a0017, 0xe10a0018,
  0xe10a0019, 0xe10a001a, 0xe10a001b, 0xe10a001c, 0xe10a001d, 0xe10a001e,
  0xe10a001f, 0xe10a0020, 0xe10a0021, 0xe10a0022, 0xe10a0023, 0xe10a0024,
  0xe10a0025, 0xe10a0026, 0xe10a0027, 0xe10a0028,
] as const);

type Finding = Readonly<{ code: string; path: string; message: string }>;

class Findings {
  readonly list: Finding[] = [];
  add(code: string, path: string, message: string): void {
    this.list.push({ code, path, message });
  }
}

async function sha256File(path: string): Promise<{ bytes: number; sha256: string }> {
  const data = await readFile(resolve(ROOT, path));
  return {
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

type ClosureSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly Readonly<{ path: string; bytes: number; sha256: string }>[];
}>;

async function snapshotClosure(): Promise<ClosureSnapshot> {
  const components = [];
  for (const path of INPUT_CLOSURE) {
    const { bytes, sha256 } = await sha256File(path);
    components.push({ path, bytes, sha256 });
  }
  const digest = createHash("sha256")
    .update(components.map((c) => `${c.path}:${String(c.bytes)}:${c.sha256}`).join("\n"))
    .digest("hex");
  return { algorithm: "sha256-component-manifest-v1", digest, components };
}

type Execution = Readonly<{
  command: readonly string[];
  exitCode: number;
  elapsedMs: number;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutTail: string;
}>;

async function runChild(command: readonly string[]): Promise<Execution> {
  const startedAt = performance.now();
  const child = Bun.spawn([...command], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {
    command,
    exitCode,
    elapsedMs: performance.now() - startedAt,
    stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
    stderrSha256: createHash("sha256").update(stderr).digest("hex"),
    stdoutTail: (stdout + stderr).split("\n").slice(-12).join("\n"),
  };
}

/* ------------------------------------------------------------------ */
/* Seeded metamorphic conformance                                     */
/* ------------------------------------------------------------------ */

/** Deterministic 32-bit LCG; no ambient randomness may enter evidence. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

type SeedPlanEvent = Readonly<{
  eventId: string;
  ordinal: number;
  startTick: number;
  durationTicks: number;
  gateDurationTicks: number;
  midiPitches: readonly number[];
  altered: boolean;
}>;

type SeedCase = Readonly<{
  seed: number;
  request: MidiExportRequest;
  events: readonly SeedPlanEvent[];
  markers: readonly Readonly<{ kind: string; eventId: string; text: string }>[];
  tempoBpm: number;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  totalTicks: number;
  hasLoop: boolean;
  documentId: string;
}>;

const SEED_METERS = Object.freeze([
  { beatsPerBar: 2, beatUnit: 2 },
  { beatsPerBar: 3, beatUnit: 4 },
  { beatsPerBar: 4, beatUnit: 4 },
  { beatsPerBar: 5, beatUnit: 4 },
  { beatsPerBar: 6, beatUnit: 8 },
  { beatsPerBar: 7, beatUnit: 8 },
] as const);

function buildSeedCase(seed: number): SeedCase {
  const random = makeRandom(seed);
  const eventCount = 1 + Math.floor(random() * 24);
  const tempoBpm = 20 + Math.floor(random() * 381);
  const meter = SEED_METERS[Math.floor(random() * SEED_METERS.length)] ?? {
    beatsPerBar: 4,
    beatUnit: 4,
  };
  const events: SeedPlanEvent[] = [];
  let cursor = 0;
  for (let i = 0; i < eventCount; i += 1) {
    cursor += Math.floor(random() * 961);
    const durationTicks = 1 + Math.floor(random() * 1920);
    const gateDurationTicks = 1 + Math.floor(random() * durationTicks);
    const pitchCount = 1 + Math.floor(random() * 6);
    const pitches = new Set<number>();
    while (pitches.size < pitchCount) {
      pitches.add(Math.floor(random() * 128));
    }
    events.push({
      eventId: `event-${String(i).padStart(4, "0")}`,
      ordinal: i,
      startTick: cursor,
      durationTicks,
      gateDurationTicks,
      midiPitches: [...pitches],
      altered: random() < 0.25,
    });
    cursor += durationTicks;
  }
  const totalTicks = cursor + Math.floor(random() * 961);
  const hasLoop = random() < 0.3;
  const markers: { kind: string; eventId: string; text: string }[] = [];
  for (const event of events) {
    if (random() < 0.6) {
      markers.push({
        kind: "chord",
        eventId: event.eventId,
        text: `Sym${event.eventId.slice(-2)}`,
      });
    }
    if (random() < 0.15) {
      markers.push({ kind: "section", eventId: event.eventId, text: "S" });
    }
  }
  for (let i = markers.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = markers[i];
    const b = markers[j];
    if (a && b) {
      markers[i] = b;
      markers[j] = a;
    }
  }
  const documentId = `doc-e1-seed-${String(seed >>> 0)}`;
  const request = buildRequest(
    documentId,
    tempoBpm,
    meter,
    totalTicks,
    hasLoop,
    events,
    markers,
  );
  return {
    seed,
    request,
    events,
    markers,
    tempoBpm,
    meter,
    totalTicks,
    hasLoop,
    documentId,
  };
}

function buildRequest(
  documentId: string,
  tempoBpm: number,
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>,
  totalTicks: number,
  hasLoop: boolean,
  events: readonly SeedPlanEvent[],
  markers: readonly Readonly<{ kind: string; eventId: string; text: string }>[],
): MidiExportRequest {
  const fraction = (ticks: number): Readonly<{ numerator: number; denominator: number }> => {
    let numerator = ticks;
    let denominator = 960;
    while (numerator % 2 === 0 && denominator % 2 === 0) {
      numerator /= 2;
      denominator /= 2;
    }
    while (numerator % 3 === 0 && denominator % 3 === 0) {
      numerator /= 3;
      denominator /= 3;
    }
    while (numerator % 5 === 0 && denominator % 5 === 0) {
      numerator /= 5;
      denominator /= 5;
    }
    return { numerator, denominator };
  };
  const plan = {
    schema: "changes.playback.plan.v1",
    compilerId: "changes.playback-plan-compiler",
    compilerVersion: 1,
    articulationPolicyId: "changes.playback-articulation",
    articulationPolicyVersion: 1,
    loopPolicyId: "changes.playback-loop",
    loopPolicyVersion: 1,
    velocityPolicyId: "changes.playback-velocity",
    velocityPolicyVersion: 1,
    realizationBindingPolicyId: "changes.playback-realization-binding",
    realizationBindingPolicyVersion: 1,
    sourceDocumentId: documentId,
    midiPpq: 960,
    tempoBpm,
    meter: { ...meter },
    events: events.map((event, index) => ({
      schema: "changes.playback.event.v1",
      ordinal: event.ordinal,
      sourceOrdinal: index,
      eventId: event.eventId,
      sectionId: "section-0000",
      measureId: "measure-0000",
      sourceStartBeat: fraction(event.startTick),
      sourceDurationBeats: fraction(event.durationTicks),
      sourceStartTick: event.startTick,
      sourceDurationTicks: event.durationTicks,
      sourceOffsetBeats: null,
      sourceOffsetTicks: null,
      startBeat: fraction(event.startTick),
      durationBeats: fraction(event.durationTicks),
      gateDurationBeats: fraction(event.gateDurationTicks),
      startTick: event.startTick,
      durationTicks: event.durationTicks,
      gateDurationTicks: event.gateDurationTicks,
      pitches: event.midiPitches.map((midi, pitchIndex) => ({
        step: "C",
        alter: event.altered && pitchIndex === 0 ? 1 : 0,
        octave: Math.floor(midi / 12) - 1,
      })),
      midiPitches: [...event.midiPitches],
      velocity: 96,
      articulation: "ordinary",
    })),
    totalBeats: fraction(totalTicks),
    totalTicks,
    loop: hasLoop
      ? { start: fraction(0), end: fraction(totalTicks) }
      : null,
    loopTicks: hasLoop ? { start: 0, end: totalTicks } : null,
  } as unknown as PlaybackPlan;
  return {
    schema: MIDI_EXPORT_REQUEST_SCHEMA,
    requestId: `e1-evidence-${documentId}`,
    writerId: MIDI_EXPORT_WRITER_ID,
    writerVersion: MIDI_EXPORT_WRITER_VERSION,
    documentId,
    sourceRevision: 1,
    title: "E1 evidence",
    voicingTrackName: "Voicings",
    instrumentName: "Piano",
    markers: markers.map((marker) => ({
      schema: MIDI_EXPORT_MARKER_SCHEMA,
      kind: marker.kind,
      eventId: marker.eventId,
      text: marker.text,
    })),
    plan,
  } as unknown as MidiExportRequest;
}

/* Fresh minimal SMF reader written for this gate; shares no code with the
 * validator, the production writer, or the test kit. */
type FreshEvent = Record<string, unknown>;

function freshParse(bytes: Uint8Array): readonly (readonly FreshEvent[])[] {
  let at = 0;
  const byte = (): number => {
    const value = bytes[at];
    if (value === undefined) throw new Error("eof");
    at += 1;
    return value;
  };
  const word = (): number => (byte() << 8) | byte();
  const quad = (): number => (word() << 16) | word();
  const vlq = (): number => {
    let value = 0;
    for (;;) {
      const group = byte();
      value = value * 128 + (group & 0x7f);
      if ((group & 0x80) === 0) return value;
    }
  };
  const tag = (): string =>
    String.fromCharCode(byte(), byte(), byte(), byte());
  if (tag() !== "MThd" || quad() !== 6) throw new Error("bad header");
  const format = word();
  const trackCount = word();
  const division = word();
  if (format !== 1 || trackCount !== 2 || division !== 960) {
    throw new Error("bad envelope");
  }
  const decoder = new TextDecoder();
  const tracks: FreshEvent[][] = [];
  for (let t = 0; t < trackCount; t += 1) {
    if (tag() !== "MTrk") throw new Error("bad track tag");
    const length = quad();
    const end = at + length;
    let tick = 0;
    let running: number | null = null;
    const events: FreshEvent[] = [];
    while (at < end) {
      tick += vlq();
      const lead = bytes[at];
      if (lead === undefined) throw new Error("eof");
      if (lead === 0xff) {
        at += 1;
        const metaType = byte();
        const size = vlq();
        const payload = bytes.slice(at, at + size);
        at += size;
        running = null;
        events.push({
          tick,
          meta: metaType,
          payload: decoder.decode(payload),
          payloadBytes: [...payload],
          size,
        });
        continue;
      }
      let status: number;
      if ((lead & 0x80) !== 0) {
        status = lead;
        at += 1;
        running = status;
      } else {
        if (running === null) throw new Error("orphan running status");
        status = running;
      }
      const note = byte();
      const velocity = byte();
      events.push({ tick, status, note, velocity });
    }
    if (at !== end) throw new Error("track length mismatch");
    tracks.push(events);
  }
  if (at !== bytes.length) throw new Error("trailing bytes");
  return tracks;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Freshly derived expected note stream: the frozen ordering laws restated. */
function freshNoteStream(
  events: readonly SeedPlanEvent[],
): readonly Readonly<{ tick: number; on: boolean; note: number }>[] {
  const notes: { tick: number; on: boolean; note: number }[] = [];
  for (const event of events) {
    for (const note of event.midiPitches) {
      notes.push({ tick: event.startTick, on: true, note });
      notes.push({
        tick: event.startTick + event.gateDurationTicks,
        on: false,
        note,
      });
    }
  }
  notes.sort(
    (a, b) =>
      a.tick - b.tick ||
      (a.on === b.on ? 0 : a.on ? 1 : -1) ||
      a.note - b.note,
  );
  return notes;
}

type SeedResult = Readonly<{
  seed: number;
  eventCount: number;
  markerCount: number;
  noteCount: number;
  byteLength: number;
  hasLoop: boolean;
  bytesSha256: string;
}>;

function checkSeedCase(findings: Findings, seedCase: SeedCase): SeedResult | null {
  const path = `seed:${String(seedCase.seed >>> 0)}`;
  const first = exportMidi(seedCase.request);
  if (!first.ok) {
    findings.add(
      "E1E_EXPORT",
      path,
      `seed request refused: ${first.refusal.code} at /${first.refusal.path.join("/")}`,
    );
    return null;
  }
  const replay = exportMidi(seedCase.request);
  if (!replay.ok || Buffer.compare(first.value.bytes, replay.value.bytes) !== 0) {
    findings.add("E1E_REPLAY", path, "replay bytes differ");
  }

  let tracks: readonly (readonly FreshEvent[])[];
  try {
    tracks = freshParse(first.value.bytes);
  } catch (error) {
    findings.add("E1E_PARSE", path, `fresh parse failed: ${String(error)}`);
    return null;
  }

  const conductor = tracks[0] ?? [];
  const voicing = tracks[1] ?? [];

  const parsedNotes = voicing
    .filter((event) => event["status"] !== undefined)
    .map((event) => ({
      tick: event["tick"] as number,
      on: ((event["status"] as number) & 0xf0) === 0x90,
      note: event["note"] as number,
    }));
  const expectedNotes = freshNoteStream(seedCase.events);
  if (canonical(parsedNotes) !== canonical(expectedNotes)) {
    findings.add("E1E_MODEL", path, "parsed notes differ from the fresh derivation");
  }
  for (const event of voicing) {
    if (event["status"] === undefined) continue;
    const on = ((event["status"] as number) & 0xf0) === 0x90;
    const velocity = event["velocity"] as number;
    if (on && velocity !== 96) {
      findings.add("E1E_VELOCITY", path, "note-on velocity is not 96");
      break;
    }
    if (!on && velocity !== 0) {
      findings.add("E1E_VELOCITY", path, "note-off velocity is not 0");
      break;
    }
  }

  const tempoMeta = conductor.find((event) => event["meta"] === 0x51);
  const expectedMicroseconds = Math.round(60_000_000 / seedCase.tempoBpm);
  const payloadOk =
    tempoMeta !== undefined &&
    (tempoMeta["payloadBytes"] as readonly number[]).reduce(
      (total, code) => total * 256 + code,
      0,
    ) === expectedMicroseconds;
  if (!payloadOk) {
    findings.add("E1E_TEMPO", path, "tempo payload differs from the fresh law");
  }
  const markerMetas = conductor.filter((event) => event["meta"] === 0x06);
  if (markerMetas.length !== seedCase.markers.length) {
    findings.add("E1E_MARKERS", path, "marker count differs");
  }
  const markerTicks = markerMetas.map((event) => event["tick"] as number);
  for (let i = 1; i < markerTicks.length; i += 1) {
    if ((markerTicks[i] ?? 0) < (markerTicks[i - 1] ?? 0)) {
      findings.add("E1E_MARKERS", path, "markers are not tick-sorted");
      break;
    }
  }

  const report = first.value.report;
  const expectedNoteCount = seedCase.events.reduce(
    (total, event) => total + event.midiPitches.length,
    0,
  );
  if (report.noteCount !== expectedNoteCount) {
    findings.add("E1E_REPORT", path, "noteCount differs from the pitch sum");
  }
  if (report.byteLength !== first.value.bytes.length) {
    findings.add("E1E_REPORT", path, "byteLength differs from the byte payload");
  }
  if (
    report.roundingErrorNumerator !==
      Math.abs(60_000_000 - expectedMicroseconds * seedCase.tempoBpm) ||
    report.roundingErrorDenominator !== seedCase.tempoBpm ||
    report.roundingErrorNumerator * 2 > report.roundingErrorDenominator
  ) {
    findings.add("E1E_REPORT", path, "rounding-error record violates the law");
  }
  const chordMarked = new Set(
    seedCase.markers
      .filter((marker) => marker.kind === "chord")
      .map((marker) => marker.eventId),
  );
  const expectedUnannotated = seedCase.events
    .filter((event) => !chordMarked.has(event.eventId))
    .map((event) => event.eventId);
  const annotationLoss = report.losses.find(
    (loss) => loss.kind === "annotation-text",
  );
  if (
    canonical(annotationLoss?.eventIds ?? []) !==
    canonical(expectedUnannotated)
  ) {
    findings.add("E1E_LOSSES", path, "annotation-text loss set differs");
  }
  const expectedAltered = seedCase.events
    .filter((event) => event.altered)
    .map((event) => event.eventId);
  const spellingLoss = report.losses.find(
    (loss) => loss.kind === "enharmonic-spelling",
  );
  if (canonical(spellingLoss?.eventIds ?? []) !== canonical(expectedAltered)) {
    findings.add("E1E_LOSSES", path, "enharmonic-spelling loss set differs");
  }
  const loopLossPresent = report.losses.some(
    (loss) => loss.kind === "loop-range",
  );
  if (loopLossPresent !== seedCase.hasLoop) {
    findings.add("E1E_LOSSES", path, "loop-range loss does not track the plan loop");
  }
  const sanitized = seedCase.documentId.replaceAll(/[^A-Za-z0-9._-]/gu, "-");
  const expectedFilename = `changes-${sanitized.slice(0, 52)}.mid`;
  if (report.filename !== expectedFilename) {
    findings.add("E1E_FILENAME", path, "filename differs from the fresh law");
  }

  /* Marker-permutation invariance: a rotated marker list must emit
   * byte-identical output because ordering is derived, never positional. */
  if (seedCase.markers.length > 1) {
    const rotated = [...seedCase.markers.slice(1), seedCase.markers[0]].filter(
      (marker): marker is NonNullable<typeof marker> => marker !== undefined,
    );
    const permuted = buildRequest(
      seedCase.documentId,
      seedCase.tempoBpm,
      seedCase.meter,
      seedCase.totalTicks,
      seedCase.hasLoop,
      seedCase.events,
      rotated,
    );
    const second = exportMidi(permuted);
    if (
      !second.ok ||
      Buffer.compare(first.value.bytes, second.value.bytes) !== 0
    ) {
      findings.add(
        "E1E_PERMUTATION",
        path,
        "marker permutation changed the emitted bytes",
      );
    }
  }

  /* Tempo isolation: a different tempo may change only the conductor
   * track; the voicing track bytes are tempo-independent. */
  const otherTempo = seedCase.tempoBpm === 20 ? 400 : 20;
  const retimed = buildRequest(
    seedCase.documentId,
    otherTempo,
    seedCase.meter,
    seedCase.totalTicks,
    seedCase.hasLoop,
    seedCase.events,
    seedCase.markers,
  );
  const retimedResult = exportMidi(retimed);
  if (retimedResult.ok) {
    try {
      const retimedTracks = freshParse(retimedResult.value.bytes);
      if (canonical(retimedTracks[1]) !== canonical(voicing)) {
        findings.add("E1E_TEMPO_ISOLATION", path, "tempo changed the voicing track");
      }
    } catch (error) {
      findings.add("E1E_TEMPO_ISOLATION", path, `retimed parse failed: ${String(error)}`);
    }
  } else {
    findings.add("E1E_TEMPO_ISOLATION", path, "retimed request refused");
  }

  return {
    seed: seedCase.seed >>> 0,
    eventCount: seedCase.events.length,
    markerCount: seedCase.markers.length,
    noteCount: expectedNoteCount,
    byteLength: first.value.bytes.length,
    hasLoop: seedCase.hasLoop,
    bytesSha256: sha256Text(canonical([...first.value.bytes])),
  };
}

/* ------------------------------------------------------------------ */
/* Entry                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const findings = new Findings();
  const before = await snapshotClosure();

  const validator = await runChild([
    process.execPath,
    "scripts/validate-e1-contract.ts",
  ]);
  if (validator.exitCode !== 0) {
    findings.add("E1E_VALIDATOR", "validate-e1-contract", "spec validator failed");
  }

  const suite = await runChild([process.execPath, "test", ...TEST_FILES]);
  const summary = suite.stdoutTail;
  const passMatch = /(\d+) pass/u.exec(summary);
  const failMatch = /(\d+) fail/u.exec(summary);
  const skipMatch = /(\d+) skip/u.exec(summary);
  const passes = passMatch ? Number(passMatch[1]) : 0;
  const failures = failMatch ? Number(failMatch[1]) : -1;
  const skips = skipMatch ? Number(skipMatch[1]) : 0;
  if (
    suite.exitCode !== 0 ||
    failures !== 0 ||
    skips !== 0 ||
    passes < MINIMUM_SUITE_PASSES
  ) {
    findings.add(
      "E1E_SUITE",
      "bun test",
      `suite not clean: exit ${String(suite.exitCode)}, pass ${String(passes)}, fail ${String(failures)}, skip ${String(skips)}`,
    );
  }

  const seedResults: SeedResult[] = [];
  for (const seed of METAMORPHIC_SEEDS) {
    try {
      const result = checkSeedCase(findings, buildSeedCase(seed));
      if (result !== null) seedResults.push(result);
    } catch (error) {
      findings.add(
        "E1E_SEED",
        `seed:${String(seed >>> 0)}`,
        `seed run failed: ${String(error)}`,
      );
    }
  }

  /* Large-plan performance observation: 2048 events, 6 pitches each. */
  const perfStartedAt = performance.now();
  let perfOutcome = "error";
  let perfBytes = 0;
  try {
    const random = makeRandom(0xe1_9e_4f);
    const events: SeedPlanEvent[] = [];
    let cursor = 0;
    for (let i = 0; i < 2048; i += 1) {
      const pitches = new Set<number>();
      while (pitches.size < 6) pitches.add(Math.floor(random() * 128));
      events.push({
        eventId: `event-${String(i).padStart(4, "0")}`,
        ordinal: i,
        startTick: cursor,
        durationTicks: 960,
        gateDurationTicks: 936,
        midiPitches: [...pitches],
        altered: false,
      });
      cursor += 960;
    }
    const request = buildRequest(
      "doc-e1-evidence-perf",
      140,
      { beatsPerBar: 4, beatUnit: 4 },
      cursor,
      false,
      events,
      [],
    );
    const result = exportMidi(request);
    if (result.ok) {
      perfOutcome = "exported";
      perfBytes = result.value.bytes.length;
    } else {
      perfOutcome = `refused:${result.refusal.code}`;
      findings.add("E1E_PERF", "performance-observation", perfOutcome);
    }
  } catch (error) {
    findings.add("E1E_PERF", "performance-observation", String(error));
  }
  const perfElapsedMs = performance.now() - perfStartedAt;

  const after = await snapshotClosure();
  if (after.digest !== before.digest) {
    const changed = after.components.filter(
      (component, index) => before.components[index]?.sha256 !== component.sha256,
    );
    findings.add(
      "E1E_INPUT_DRIFT",
      "input-closure",
      `inputs changed during the run: ${changed.map((c) => c.path).join(", ")}`,
    );
  }

  const outcome = findings.list.length === 0 ? "pass" : "fail";
  const ledger = {
    schema: "changes.evidence.e1-midi-export.v1",
    package: "E1",
    outcome,
    generatedAt: new Date().toISOString(),
    environment: {
      bunVersion: Bun.version,
      platform: platform(),
      osRelease: release(),
      cpuCount: cpus().length,
    },
    inputClosure: before,
    inputClosureAfter: { digest: after.digest },
    gates: {
      specValidator: {
        exitCode: validator.exitCode,
        elapsedMs: Math.round(validator.elapsedMs),
        stdoutSha256: validator.stdoutSha256,
      },
      testSuite: {
        exitCode: suite.exitCode,
        elapsedMs: Math.round(suite.elapsedMs),
        files: TEST_FILES.length,
        passes,
        failures,
        skips,
        stdoutSha256: suite.stdoutSha256,
        stderrSha256: suite.stderrSha256,
      },
    },
    seededConformance: {
      seeds: METAMORPHIC_SEEDS.length,
      generator: "lcg-1664525-1013904223-v1",
      relations: [
        "fresh-parse-model-equality",
        "byte-identical-replay",
        "marker-permutation-invariance",
        "tempo-voicing-isolation",
        "report-identity-laws",
        "loss-set-recomputation",
      ],
      results: seedResults,
    },
    performanceObservation: {
      gating: false,
      chart: "2048-event, six-pitch-per-event, 12288-note seeded plan",
      observedMs: Math.round(perfElapsedMs * 10) / 10,
      outcome: perfOutcome,
      byteLength: perfBytes,
      note: "Observation only; wall time never becomes a musical or semantic cutoff.",
    },
    findings: findings.list,
  };
  await mkdir(LEDGER_DIR, { recursive: true });
  const temporary = `${LEDGER_PATH}.tmp-${String(process.pid)}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(temporary, LEDGER_PATH);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: ledger.schema,
        outcome,
        suite: ledger.gates.testSuite,
        seeds: seedResults.length,
        performanceObservedMs: ledger.performanceObservation.observedMs,
        ledgerPath: "test-results/e1-evidence/e1-evidence-ledger.json",
        findings: findings.list,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
