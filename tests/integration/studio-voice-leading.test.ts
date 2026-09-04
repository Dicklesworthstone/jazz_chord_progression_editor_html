import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { compileStudioPlaybackPlan, performStudioPlaybackPlan } from "../../src/application/studio-playback";
import { buildStudioRealizations } from "../../src/application/studio-realization";
import { exportMidi, MIDI_EXPORT_REQUEST_SCHEMA, MIDI_EXPORT_WRITER_ID, MIDI_EXPORT_WRITER_VERSION } from "../../src/export";
import { parseSmfBytes } from "../support/midi-export-test-kit";
import { compilePerformancePlan, PERFORMANCE_STYLES, PERFORMANCE_STYLE_IDS, type PlaybackPlan } from "../../src/playback";
import { buildFrame, runToTerminal } from "../support/progression-optimizer-test-kit";
import { required, realVoiceOperations, chainCost, transitionCost, soundedChain, soundedEdge } from "../support/progression-continuity";
import { MUSICAL_CHAINS, musicalDocument, studioCandidates, studioRequest } from "../support/studio-voice-leading";

function compFrames(plan: PlaybackPlan, arrivalOnly = true) {
  // First-arrival diagnostics and the complete actually sounded sequence are
  // reported separately: a later comp can change register before the next chord.
  const seen = new Set<number>();
  return plan.events.filter((event) => {
    if (event.midiPitches.length < 2 || (arrivalOnly && seen.has(event.sourceOrdinal))) return false;
    seen.add(event.sourceOrdinal);
    return true;
  }).map((event, i) => buildFrame(`event-comp-${String(i)}`, "candidate-000", "balanced", event.midiPitches));
}

for (const chart of MUSICAL_CHAINS) {
  test(`${chart.id}: continuity improves real candidates and the sounded arrangement`, async () => {
    const document = musicalDocument(chart.bars);
    const before = JSON.stringify(document);
    const rows = studioCandidates(document);
    const selected = rows.map((row) => row.selected);
    const legacy = runToTerminal(studioRequest(document, 1), realVoiceOperations).outcome;
    const current = runToTerminal(studioRequest(document, 2), realVoiceOperations).outcome;
    if (legacy.kind !== "optimized" || current.kind !== "optimized") throw new Error("Optimizer refused chart");
    const oldIds = required(required(legacy.segments, 0).realizations, 0).candidateIds;
    const newIds = required(required(current.segments, 0).realizations, 0).candidateIds;
    expect(selected.map((frame) => frame.roles.candidateId)).toEqual([...newIds]);
    const oldFrames = rows.map((row, i) => {
      const found = row.candidates.find((candidate) => candidate.roles.candidateId === oldIds[i]);
      if (!found) throw new Error("Missing legacy candidate");
      return found;
    });
    const compiled = compileStudioPlaybackPlan(document);
    if (!compiled.ok) throw new Error(compiled.refusal.code);
    const legacyPlan: PlaybackPlan = { ...compiled.plan, events: compiled.plan.events.map((event, i) => {
      const frame = required(oldFrames, i);
      const [first, ...rest] = frame.voices;
      return { ...event, pitches: [first.pitch, ...rest.map((voice) => voice.pitch)] as const,
        midiPitches: [first.midi, ...rest.map((voice) => voice.midi)] as const };
    }) };
    const comp = compFrames(performStudioPlaybackPlan(compiled.plan));
    const legacyPerformance = compilePerformancePlan({ plan: legacyPlan, styleId: "ballad-comp@1" });
    if (!legacyPerformance.ok) throw new Error(legacyPerformance.refusal.code);
    const oldComp = compFrames(legacyPerformance.plan);
    const evidence = {
      chart: chart.id, axes: ["alignment", "gaps", "span", "leap", "motion", "commonLost", "crowded", "doubled", "omitted"],
      compAxes: ["alignment", "gaps", "span", "leap", "motion"],
      legacy: { notes: oldFrames.map((f) => f.voices.map((v) => v.midi)), cost: chainCost(oldFrames), comp: soundedChain(oldComp) },
      current: { notes: selected.map((f) => f.voices.map((v) => v.midi)), cost: chainCost(selected), comp: soundedChain(comp) },
      edges: selected.slice(1).map((to, i) => ({ from: required(rows, i).event.chord.sourceText,
        to: required(rows, i + 1).event.chord.sourceText,
        literal: transitionCost(required(selected, i), to),
        comp: soundedEdge(required(comp, i).voices.map((v) => v.midi), required(comp, i + 1).voices.map((v) => v.midi)),
      })),
      actualComp: { legacy: soundedChain(compFrames(legacyPerformance.plan, false)), current: soundedChain(compFrames(performStudioPlaybackPlan(compiled.plan), false)) },
      currentCompNotes: comp.map((f) => f.voices.map((v) => v.midi)),
      work: current.stats,
    };
    await mkdir("test-results/voice-leading", { recursive: true });
    await writeFile(`test-results/voice-leading/${chart.id}.json`, JSON.stringify(evidence, null, 2));
    expect(required(evidence.current.cost, 0)).toBeLessThan(required(evidence.legacy.cost, 0));
    expect(required(evidence.current.cost, 1)).toBe(0);
    expect(required(evidence.current.cost, 2)).toBeLessThanOrEqual(24);
    expect(required(evidence.actualComp.current, 0)).toBeLessThan(required(evidence.actualComp.legacy, 0));
    expect(comp).toHaveLength(rows.length);
    expect(JSON.stringify(document)).toBe(before);
    expect(compiled.plan.events.map((event) => [...event.midiPitches])).toEqual(selected.map((f) => f.voices.map((v) => v.midi)));
    const midi = exportMidi({ schema: MIDI_EXPORT_REQUEST_SCHEMA, requestId: "continuity-midi",
      writerId: MIDI_EXPORT_WRITER_ID, writerVersion: MIDI_EXPORT_WRITER_VERSION,
      documentId: document.id, sourceRevision: 0, title: document.title,
      voicingTrackName: "Voicings", instrumentName: "Piano", markers: [], plan: compiled.plan });
    if (!midi.ok) throw new Error(midi.refusal.code);
    const parsed = parseSmfBytes(midi.value.bytes);
    const actualNotes = parsed.tracks.flatMap((track) => track.filter((e) => e["kind"] === "on")
      .map((e) => `${String(e["tick"])}:${String(e["note"])}`)).sort();
    expect(actualNotes).toEqual(compiled.plan.events.flatMap((e) => e.midiPitches.map((note) => `${String(e.startTick)}:${String(note)}`)).sort());
    const performed = performStudioPlaybackPlan(compiled.plan);
    const basses = performed.events.filter((e) => /\.b[0-9]+$/u.test(e.eventId));
    const comps = performed.events.filter((e) => /\.c[0-9]+$/u.test(e.eventId));
    for (const chord of comps) for (const bass of basses) {
      if (bass.startTick < chord.startTick + chord.gateDurationTicks && chord.startTick < bass.startTick + bass.gateDurationTicks) {
        expect(chord.midiPitches[0] - bass.midiPitches[0]).toBeGreaterThanOrEqual(4);
      }
    }
  });
}

test("Manual and Frozen retain exact spelling, unisons and source order beside optimized Auto", () => {
  const pitches = [{ step: "C", alter: 0, octave: 4 }, { step: "G", alter: 0, octave: 3 },
    { step: "C", alter: 0, octave: 4 }, { step: "E", alter: 0, octave: 4 }, { step: "B", alter: 0, octave: 3 }];
  for (const mode of ["manual", "frozen"] as const) {
    const stored = { mode, pitches, bassPolicy: "included",
      ...(mode === "frozen" ? { generatedBy: { engineVersion: "test-reviewed-v1", family: "balanced" } } : {}) };
    const document = musicalDocument([["Dm7"], ["Cmaj7"], ["G7"]], stored);
    const before = JSON.stringify(document);
    const built = buildStudioRealizations(document);
    if (!built.ok) throw new Error(built.refusal.code);
    const event = required(required(required(document.sections, 0).measures, 1).events, 0);
    const binding = built.realizations.get(event.id);
    if (binding?.kind !== "stored") throw new Error("Stored binding replaced");
    expect(JSON.stringify(binding.result.voicing.pitches)).toBe(JSON.stringify(pitches));
    const compiled = compileStudioPlaybackPlan(document);
    if (!compiled.ok) throw new Error(compiled.refusal.code);
    expect(JSON.stringify(required(compiled.plan.events, 1).pitches)).toBe(JSON.stringify(pitches));
    expect(JSON.stringify(document)).toBe(before);
  }
});

test("current studio voicings obey every style's register, timing and sustained bass-separation laws", () => {
  // Include the whole-bars input which exposed a comp/bass unison after the
  // new V2 selections; keep the old arrangement goldens unchanged as well.
  for (const bars of [MUSICAL_CHAINS[1].bars, [["Cmaj7"], ["Fmaj7"], ["Bbmaj7"], ["Ebmaj7"]],
    [["Dm7", "G7"], ["Cmaj7", "A7"], ["Dm7", "G7"], ["Cmaj7"]]]) {
    const compiled = compileStudioPlaybackPlan(musicalDocument(bars));
    if (!compiled.ok) throw new Error(compiled.refusal.code);
    for (const styleId of PERFORMANCE_STYLE_IDS) {
      const style = PERFORMANCE_STYLES[styleId];
      const result = compilePerformancePlan({ plan: compiled.plan, styleId, compContinuityVersion: 2 });
      const legacy = compilePerformancePlan({ plan: compiled.plan, styleId });
      if (!result.ok || !legacy.ok) throw new Error(`Style refused: ${styleId}`);
      if (style.compRegister === null) { expect(result.plan).toBe(compiled.plan); continue; }
      const basses = result.plan.events.filter((e) => /\.b[0-9]+$/u.test(e.eventId));
      expect(basses).toEqual(legacy.plan.events.filter((e) => /\.b[0-9]+$/u.test(e.eventId)));
      expect(result.plan.events.map((e) => [e.eventId, e.startTick, e.durationTicks, e.gateDurationTicks, e.velocity]))
        .toEqual(legacy.plan.events.map((e) => [e.eventId, e.startTick, e.durationTicks, e.gateDurationTicks, e.velocity]));
      for (const chord of result.plan.events.filter((e) => /\.c[0-9]+$/u.test(e.eventId))) {
        expect(chord.midiPitches[0]).toBeGreaterThanOrEqual(style.compRegister.lowMidi);
        expect(chord.midiPitches[0]).toBeLessThanOrEqual(style.compRegister.highMidi);
        expect(Math.max(...chord.midiPitches)).toBeLessThanOrEqual(style.compRegister.ceilingMidi);
        const written = required(compiled.plan.events, chord.sourceOrdinal);
        const top = written.midiPitches.slice(-chord.midiPitches.length);
        const shifts = chord.midiPitches.map((n, i) => n - required(top, i));
        expect(new Set(shifts).size).toBe(1);
        expect(required(shifts, 0) % 12 === 0).toBe(true);
        for (const bass of basses) {
          if (bass.startTick < chord.startTick + chord.gateDurationTicks && chord.startTick < bass.startTick + bass.gateDurationTicks) {
            expect(chord.midiPitches[0] - bass.midiPitches[0]).toBeGreaterThanOrEqual(4);
          }
        }
      }
      const work = result.compContinuity;
      if (!work) throw new Error("Missing deterministic work evidence");
      expect(work.candidateTransitions).toBeLessThanOrEqual(4 * work.compEvents);
      expect(work.tracebackStates).toBeLessThanOrEqual(2 * work.compEvents);
      expect(work.alignmentCells).toBeLessThanOrEqual(289 * work.candidateTransitions);
      expect(work.placementChecks).toBeLessThanOrEqual(32 * work.compEvents);
      expect(work.bassOverlapChecks).toBeLessThanOrEqual(2 * result.plan.events.length);
    }
  }
});
