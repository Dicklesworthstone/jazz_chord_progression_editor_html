/**
 * M1 real-song local evidence (jcpe-qbvz).
 *
 * Opportunistic, NEVER a committed release gate: the two reference songs
 * (`deacon_blues.mid`, `What-A-Fool-Believes-1.mid`) are third-party
 * multi-track recordings and are gitignored, so a clean clone does not have
 * them and this script reports `skipped` there instead of failing. When the
 * files are present it runs the complete production import stack over each
 * and emits a hash-bound ledger under test-results/m1-local/:
 *
 * - decode + automation plan through the real embedded wasm decoder and the
 *   real M1 pipeline (salvage included);
 * - recognizability facts: bars, written chords, distinct symbols, seventh
 *   vocabulary, unwritten spans — the structural face of "a chart a
 *   musician would recognize" (the musical verdict itself stays human: a
 *   listening-note slot is emitted for the owner);
 * - the full envelope against a real controller: commit, stated-undo-count
 *   round trip, exact document restoration;
 * - double-import determinism;
 * - the EAR CHECK (measure-the-sound law): the imported chart is published
 *   through the real F2/F3 document boundary, performed under BOTH the
 *   chosen groove and the reviewed default groove by the real performance
 *   compiler, and each performance's rhythm profile (onset density,
 *   offbeat placement, off-grid rate) is compared numerically against the
 *   source file's own note stream. The chosen groove must not be farther
 *   from the source than the default.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createStudioController,
  validateDocumentSemantics,
  type StudioController,
} from "../src/application";
import {
  createStudioMidiImport,
  type MidiImportPreview,
} from "../src/application/studio-midi-import";
import { performStudioPlaybackPlan } from "../src/application/studio-playback";
import { compileStudioPlaybackPlan } from "../src/application/studio-playback";
import { loadSmfWasmDecoder } from "../src/audio/smf-wasm";
import {
  PROGRESSION_DOCUMENT_SCHEMA,
  decodeDocumentShape,
} from "../src/domain";
import { parseChordSymbol } from "../src/theory";
import type { PlaybackPlan } from "../src/playback";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_DIR = resolve(ROOT, "test-results/m1-local");
const LEDGER_PATH = resolve(LEDGER_DIR, "m1-local-evidence.json");

const SONGS = Object.freeze([
  "deacon_blues.mid",
  "What-A-Fool-Believes-1.mid",
] as const);

const AUTO_VOICING = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function controller(): StudioController {
  const created = createStudioController();
  if (!created.ok) {
    throw new Error(`controller refused: ${created.refusal.code}`);
  }
  return created.controller;
}

/* ------------------------------------------------------------------ *
 * Chart-text → validated document (the real F2/F3 boundary)           *
 * ------------------------------------------------------------------ */

type BarEntry = Readonly<{ symbol: string; beats: number }>;

/** Split chart text into bars of symbol[:beats] entries. */
function barsOfChartText(
  text: string,
  beatsPerBar: number,
): readonly (readonly BarEntry[])[] | null {
  /* Between-pipe cells, empty bars included: "| |" is an empty measure. */
  const bars = text
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("["))
    .flatMap((line) => line.split("|").slice(1, -1))
    .map((token) => token.trim());
  const out: (readonly BarEntry[])[] = [];
  for (const bar of bars) {
    const entries: BarEntry[] = [];
    const tokens = bar.split(/\s+/u).filter((token) => token.length > 0);
    let explicitTotal = 0;
    let explicitCount = 0;
    for (const token of tokens) {
      const match = /^(.+?):(\d+(?:\/\d+)?)$/u.exec(token);
      if (match !== null && match[1] !== undefined && match[2] !== undefined) {
        const [num, den] = match[2].split("/");
        const beats =
          Number.parseInt(num ?? "0", 10) /
          (den === undefined ? 1 : Number.parseInt(den, 10));
        entries.push({ symbol: match[1], beats });
        explicitTotal += beats;
        explicitCount += 1;
      } else {
        entries.push({ symbol: token, beats: Number.NaN });
      }
    }
    const implicitCount = entries.length - explicitCount;
    if (implicitCount > 0) {
      const remaining = beatsPerBar - explicitTotal;
      const share = remaining / implicitCount;
      if (!(share > 0)) return null;
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined && Number.isNaN(entry.beats)) {
          entries[index] = { symbol: entry.symbol, beats: share };
        }
      }
    }
    out.push(entries);
  }
  return out;
}

function toBeatDuration(beats: number): Readonly<{
  numerator: number;
  denominator: number;
}> {
  /* Chart beats are small dyadic/triadic rationals; 12 covers them all. */
  let numerator = Math.round(beats * 12);
  let denominator = 12;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const factor = gcd(numerator, denominator);
  if (factor > 1) {
    numerator /= factor;
    denominator /= factor;
  }
  return Object.freeze({ numerator, denominator });
}

function publishImportedChart(
  songId: string,
  preview: MidiImportPreview,
  dropEventIds: ReadonlySet<string> = new Set(),
): ReturnType<typeof validateDocumentSemantics> | null {
  const automation = preview.automation;
  if (automation === null) return null;
  const meter = automation.initialMeter;
  const bars = barsOfChartText(automation.chartText, meter.numerator);
  if (bars === null) return null;
  let ordinal = 0;
  const measures: unknown[] = [];
  for (const [barIndex, bar] of bars.entries()) {
    /* Ordinals count every entry so ids stay stable across drop passes. */
    const kept: { eventId: string; symbol: string; beats: number }[] = [];
    let droppedBeats = 0;
    for (const entry of bar) {
      ordinal += 1;
      const eventId = `event-${String(ordinal).padStart(4, "0")}`;
      if (dropEventIds.has(eventId)) {
        droppedBeats += entry.beats;
        continue;
      }
      kept.push({ eventId, symbol: entry.symbol, beats: entry.beats });
    }
    /*
     * A dropped chord's time flows to its previous bar-mate (or the next),
     * so the bar stays exactly full and the rhythm skeleton survives.
     */
    if (droppedBeats > 0 && kept.length > 0) {
      const heir = kept[kept.length - 1];
      if (heir !== undefined) heir.beats += droppedBeats;
    }
    const events: unknown[] = [];
    for (const entry of kept) {
      const parsed = parseChordSymbol(entry.symbol, "ascii");
      if (!parsed.ok) return null;
      events.push({
        id: entry.eventId,
        duration: toBeatDuration(entry.beats),
        annotation: "",
        chord: parsed.chord,
        voicing: AUTO_VOICING,
      });
    }
    measures.push({
      id: `measure-${String(barIndex + 1).padStart(4, "0")}`,
      events,
      completion: { kind: events.length === 0 ? "empty" : "complete" },
    });
  }
  const candidate = {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: `doc-m1-local-${songId}`,
    title: songId,
    description: "",
    meter: { beatsPerBar: meter.numerator, beatUnit: meter.beatUnit },
    tempoBpm: Math.max(
      20,
      Math.min(300, Math.round(60_000_000 / automation.initialTempoMicroseconds)),
    ),
    key: null,
    sections: [
      {
        id: "section-0001",
        name: "A",
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "reset",
        measures,
      },
    ],
    playback: {
      instrumentId: "concert-grand",
      masterVolume: 0.8,
      reverbAmount: 0.25,
      countInBars: 0,
    },
  };
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) return null;
  return validateDocumentSemantics(decoded.value);
}

/* ------------------------------------------------------------------ *
 * Rhythm profile (independent of the production groove scorer)        *
 * ------------------------------------------------------------------ */

type RhythmProfile = Readonly<{
  onsetsPerBeat: number;
  offbeatPlacement: number;
  offGridRate: number;
  medianOnsetSpacing: number;
  onsetCount: number;
}>;

/** Profile a stream of onsets measured in beats. */
function profileOnsets(
  onsetBeats: readonly number[],
  totalBeats: number,
): RhythmProfile {
  const distinct = [...new Set(onsetBeats.map((beat) => beat.toFixed(4)))].map(
    Number,
  );
  const fractions = distinct
    .map((beat) => beat - Math.floor(beat))
    .filter((fraction) => fraction > 0.05 && fraction < 0.95);
  const offbeat = fractions.filter(
    (fraction) => fraction >= 0.25 && fraction <= 0.85,
  );
  const median = (values: readonly number[]): number => {
    if (values.length === 0) return 0.5;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0.5;
  };
  const sortedOnsets = [...distinct].sort((a, b) => a - b);
  const spacings: number[] = [];
  for (let index = 1; index < sortedOnsets.length; index += 1) {
    const gap = (sortedOnsets[index] ?? 0) - (sortedOnsets[index - 1] ?? 0);
    if (gap > 1e-6) spacings.push(gap);
  }
  return Object.freeze({
    onsetsPerBeat: totalBeats > 0 ? distinct.length / totalBeats : 0,
    offbeatPlacement: median(offbeat),
    offGridRate:
      distinct.length > 0 ? fractions.length / distinct.length : 0,
    medianOnsetSpacing: median(spacings),
    onsetCount: distinct.length,
  });
}

function profileDistance(a: RhythmProfile, b: RhythmProfile): number {
  /*
   * Feel features only, normalized L1. Absolute onset density is recorded
   * in the ledger but deliberately NOT scored: an eleven-track band
   * recording out-onsets any solo comp sketch by construction, so scoring
   * raw density would reduce every comparison to "which groove is denser"
   * regardless of feel. Rhythmic feel lives in the typical inter-onset
   * gap (eighths vs quarters vs sparse pads, clamped to a two-beat pad
   * scale) and in where onsets sit against the beat grid.
   */
  const spacing =
    Math.abs(
      Math.min(a.medianOnsetSpacing, 2) - Math.min(b.medianOnsetSpacing, 2),
    ) / 2;
  return (
    spacing +
    Math.abs(a.offbeatPlacement - b.offbeatPlacement) +
    Math.abs(a.offGridRate - b.offGridRate)
  );
}

function profilePlan(plan: PlaybackPlan): RhythmProfile {
  const ppq = plan.midiPpq;
  const onsets = plan.events.map((event) => Number(event.startTick) / ppq);
  return profileOnsets(onsets, Number(plan.totalTicks) / ppq);
}

function profileSource(preview: MidiImportPreview): RhythmProfile | null {
  const decoded = preview.decoded;
  if (decoded === null) return null;
  const division = decoded.model.header.division;
  const onsets: number[] = [];
  let lastTick = 0;
  for (const track of decoded.model.tracks) {
    for (const note of track.notes) {
      onsets.push(note.onTick / division);
      if (note.offTick > lastTick) lastTick = note.offTick;
    }
  }
  return profileOnsets(onsets, lastTick / division);
}

/* ------------------------------------------------------------------ */

const SEVENTH_VOCABULARY = /(maj7|m7|mMaj7|7|m7b5|dim7|6)/u;

/**
 * The event id of the chord with this source text in this 1-based bar of a
 * published chart, skipping ids already dropped.
 */
function eventIdAt(
  document: Readonly<{
    sections: readonly Readonly<{
      measures: readonly Readonly<{
        events: readonly Readonly<{
          id: string;
          chord: Readonly<{ sourceText: string }>;
        }>[];
      }>[];
    }>[];
  }>,
  barNumber: number,
  sourceText: string,
  alreadyDropped: ReadonlySet<string>,
): string | null {
  let bar = 0;
  for (const section of document.sections) {
    for (const measure of section.measures) {
      bar += 1;
      if (bar !== barNumber) continue;
      for (const event of measure.events) {
        if (
          event.chord.sourceText === sourceText &&
          !alreadyDropped.has(event.id)
        ) {
          return event.id;
        }
      }
      return null;
    }
  }
  return null;
}

async function runSong(songFile: string): Promise<Record<string, unknown>> {
  const bytes = new Uint8Array(await readFile(resolve(ROOT, songFile)));
  const service = createStudioMidiImport(() =>
    Promise.resolve(loadSmfWasmDecoder()),
  );
  const first = await service.readFile(songFile, bytes);
  const second = await service.readFile(songFile, bytes);
  const deterministic = canonical(first) === canonical(second);

  const facts: Record<string, unknown> = {
    songFile,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    deterministicDoubleImport: deterministic,
    refusal: first.refusal?.code ?? null,
    salvaged: first.salvage !== null,
    automationRefusal: first.automationRefusal,
  };
  const automation = first.automation;
  if (first.refusal !== null || automation === null) {
    facts["outcome"] = "no-automatic-plan";
    return facts;
  }

  const symbols = automation.chartText
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("["))
    .flatMap((line) => line.split(/[\s|]+/u))
    .filter((token) => token.length > 0)
    .map((token) => token.split(":")[0] ?? token);
  const distinctSymbols = [...new Set(symbols)];
  facts["chart"] = {
    measureCount: automation.measureCount,
    writtenChordCount: automation.writtenChordCount,
    unwrittenSpanCount: automation.unwrittenSpanCount,
    emptyMeasureCount: automation.emptyMeasureCount,
    sectionCount: automation.sections.length,
    distinctSymbolCount: distinctSymbols.length,
    distinctSymbols: distinctSymbols.slice(0, 40),
    tempoBpm: Math.round(60_000_000 / automation.initialTempoMicroseconds),
    meter: automation.initialMeter,
    key:
      automation.key === null || automation.keySpelled === null
        ? null
        : `${automation.keySpelled.step}${automation.keySpelled.alter < 0 ? "b" : automation.keySpelled.alter > 0 ? "#" : ""} ${automation.key.mode}`,
    groove: automation.groove.grooveStyleId,
    grooveEvidence: automation.groove.evidence,
    chartTextHead: automation.chartText.slice(0, 400),
  };
  facts["recognizability"] = {
    distinctSymbolsAtLeast8: distinctSymbols.length >= 8,
    majorityOfBarsWritten:
      automation.measureCount - automation.emptyMeasureCount >=
      automation.measureCount / 2,
    seventhVocabularyPresent: distinctSymbols.some((symbol) =>
      SEVENTH_VOCABULARY.test(symbol),
    ),
  };

  /* The envelope against a real controller: commit, undo, restore. */
  const studio = controller();
  const beforeFacts = canonical(studio.getSnapshot().sections);
  const committed = service.commitAutomatic(studio, first);
  facts["envelope"] = {
    committed: committed.committed,
    reason: committed.reason,
    undoCount: committed.undoCount,
    steps: committed.steps,
  };
  if (committed.committed) {
    let undone = 0;
    for (let press = 0; press < committed.undoCount; press += 1) {
      if (!studio.undo().ok) break;
      undone += 1;
    }
    facts["undoRoundTrip"] = {
      undone,
      restoredExactly:
        canonical(studio.getSnapshot().sections) === beforeFacts,
    };
  }

  /* EAR CHECK: perform under chosen vs default groove, compare to source. */
  const published = publishImportedChart(
    songFile.replace(/[^a-z0-9]+/giu, "-").toLowerCase(),
    first,
  );
  const source = profileSource(first);
  if (published === null || !published.ok || source === null) {
    facts["earCheck"] = {
      outcome: "not-computed",
      reason:
        published === null
          ? "the imported chart could not be republished through F2/F3"
          : "publication or source profiling refused",
    };
  } else {
    /*
     * Some imported symbols are real T0 chords V0 cannot voice yet (the
     * probe hit “G#maj9/Bb”). The studio's own Play would refuse the same
     * chart at the same chord, which is a finding in its own right — it is
     * recorded below — but the EAR CHECK measures rhythm, so unvoiceable
     * events are dropped one at a time, each drop disclosed, until the
     * chart compiles or the drop budget is spent.
     */
    /*
     * Realization is contextual (V1 voice-leading spans neighbours), so
     * unvoiceable events are found by asking the real realization builder
     * for its precise refusing eventId, dropping exactly that event, and
     * repeating until the chart realizes or the budget is spent. Every
     * dropped chord is a finding: the studio's own Play refuses it today.
     */
    const songId = songFile.replace(/[^a-z0-9]+/giu, "-").toLowerCase();
    const droppedForVoicing: string[] = [];
    const dropEventIds = new Set<string>();
    let current = published;
    let compiled = compileStudioPlaybackPlan(current.value);
    for (let round = 0; !compiled.ok && round < 80; round += 1) {
      /*
       * The studio wrapper hides the refusing eventId, but its message
       * names the chord and its bar; that pair maps back to exactly one
       * event in the published chart.
       */
      const match = /“(.+?)” in bar (\d+)/u.exec(compiled.refusal.message);
      if (match === null || match[1] === undefined || match[2] === undefined) {
        break;
      }
      const eventId = eventIdAt(
        current.value,
        Number.parseInt(match[2], 10),
        match[1],
        dropEventIds,
      );
      if (eventId === null || dropEventIds.has(eventId)) break;
      dropEventIds.add(eventId);
      droppedForVoicing.push(
        `${match[1]} (bar ${match[2]}; ${compiled.refusal.code})`,
      );
      const next = publishImportedChart(songId, first, dropEventIds);
      if (next === null || !next.ok) break;
      current = next;
      compiled = compileStudioPlaybackPlan(current.value);
    }
    if (!compiled.ok) {
      facts["earCheck"] = {
        outcome: "not-computed",
        reason: `playback compile refused: ${compiled.refusal.code}`,
        droppedForVoicing,
      };
    } else {
      facts["voicingGaps"] = {
        note: "chords the studio's own Play would refuse to voice today",
        droppedForVoicing,
      };
      const chosen = performStudioPlaybackPlan(
        compiled.plan,
        automation.groove.grooveStyleId as never,
      );
      const fallback = performStudioPlaybackPlan(compiled.plan);
      const chosenProfile = profilePlan(chosen);
      const defaultProfile = profilePlan(fallback);
      const chosenDistance = profileDistance(source, chosenProfile);
      const defaultDistance = profileDistance(source, defaultProfile);
      facts["earCheck"] = {
        outcome: "computed",
        sourceProfile: source,
        chosenGroove: automation.groove.grooveStyleId,
        chosenProfile,
        chosenDistance,
        defaultGroove: "ballad-comp@1",
        defaultProfile,
        defaultDistance,
        chosenNoFartherThanDefault: chosenDistance <= defaultDistance + 1e-9,
      };
    }
  }

  facts["humanListeningNote"] = {
    status: "pending-owner",
    instruction:
      "Owner: audition the imported chart under the chosen groove next to the source recording and record the verdict here.",
    verdict: null,
    reviewer: null,
  };
  return facts;
}

async function main(): Promise<void> {
  const present: string[] = [];
  const missing: string[] = [];
  for (const song of SONGS) {
    try {
      await readFile(resolve(ROOT, song));
      present.push(song);
    } catch {
      missing.push(song);
    }
  }
  if (present.length === 0) {
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "jcpe.m1-local-evidence.v1",
          outcome: "skipped",
          reason:
            "the gitignored local song corpus is absent from this clone",
          missing,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const songs: Record<string, unknown>[] = [];
  for (const song of present) {
    songs.push(await runSong(song));
  }
  const ledger = {
    schema: "jcpe.m1-local-evidence.v1",
    traceId: "M1-LOCAL-EVIDENCE-01",
    outcome: "recorded",
    bun: Bun.version,
    missing,
    songs,
  };
  await mkdir(LEDGER_DIR, { recursive: true });
  const temporary = `${LEDGER_PATH}.tmp-${String(process.pid)}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(temporary, LEDGER_PATH);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: ledger.schema,
        outcome: ledger.outcome,
        songs: songs.map((song) => ({
          songFile: song["songFile"],
          refusal: song["refusal"],
          chart: (song["chart"] as Record<string, unknown> | undefined) && {
            measureCount: (song["chart"] as Record<string, unknown>)[
              "measureCount"
            ],
            writtenChordCount: (song["chart"] as Record<string, unknown>)[
              "writtenChordCount"
            ],
            distinctSymbolCount: (song["chart"] as Record<string, unknown>)[
              "distinctSymbolCount"
            ],
            groove: (song["chart"] as Record<string, unknown>)["groove"],
          },
          envelope: (song["envelope"] as Record<string, unknown> | undefined) && {
            committed: (song["envelope"] as Record<string, unknown>)[
              "committed"
            ],
            undoCount: (song["envelope"] as Record<string, unknown>)[
              "undoCount"
            ],
          },
          earCheck:
            (song["earCheck"] as Record<string, unknown> | undefined) && {
              outcome: (song["earCheck"] as Record<string, unknown>)["outcome"],
              chosenDistance: (song["earCheck"] as Record<string, unknown>)[
                "chosenDistance"
              ],
              defaultDistance: (song["earCheck"] as Record<string, unknown>)[
                "defaultDistance"
              ],
              chosenNoFartherThanDefault: (
                song["earCheck"] as Record<string, unknown>
              )["chosenNoFartherThanDefault"],
            },
        })),
        ledgerPath: "test-results/m1-local/m1-local-evidence.json",
      },
      null,
      2,
    )}\n`,
  );
}

if (import.meta.main) {
  await main();
}
