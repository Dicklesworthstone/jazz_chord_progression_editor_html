import { expect, test } from "bun:test";
import packet from "../fixtures/my-charts/cases.json";
import document from "../fixtures/exact-share/document.changes.json";

test("independent collection packet pins exact byte/count edges and complete transaction outcomes", () => {
  const limits = new Map([["records", 128], ["documentBytes", 2 * 1024 ** 2],
    ["collectionBytes", 32 * 1024 ** 2], ["backupBytes", 64 * 1024 ** 2 + 128 * 1024], ["indexBytes", 128 * 1024]]);
  for (const row of packet.bounds) {
    const maximum = limits.get(row.kind);
    if (maximum === undefined) throw new Error("Unknown independently specified bound");
    expect(row.value === maximum || row.value === maximum + 1).toBe(true);
    expect(row.accepted).toBe(row.value <= maximum);
  }
  for (const row of packet.transactions) {
    if (row.result === "committed") {
      expect(row.expectedGeneration).toBe(row.actualGeneration);
      expect(row.fault).toBe(null);
      expect(row.after).toEqual(row.proposed);
      expect(row.generation).toBe(row.actualGeneration + 1);
    } else {
      expect(row.after).toEqual(row.before);
      expect(row.generation).toBe(row.actualGeneration);
    }
    if (row.result === "conflict") expect(row.expectedGeneration).not.toBe(row.actualGeneration);
  }
});

test("independent restore cases partition IDs without conflating titles or musical identity", () => {
  for (const row of packet.restore) {
    const conflicts: string[] = [], additions: string[] = [], identical: string[] = [];
    for (const incoming of row.incoming) {
      const id = incoming[0];
      if (id === undefined) throw new Error("Missing record ID");
      const local = row.local.find(value => value[0] === id);
      if (local === undefined) additions.push(id);
      else if (JSON.stringify(local) === JSON.stringify(incoming)) identical.push(id);
      else conflicts.push(id);
    }
    expect({ conflicts, additions, identical }).toEqual({ conflicts: row.conflicts, additions: row.additions, identical: row.identical });
  }
});

test("independent full-document witness enumerates every ID and preserves ordered unisons", () => {
  const ids = [document.id];
  for (const section of document.sections) {
    ids.push(section.id);
    for (const measure of section.measures) {
      ids.push(measure.id);
      for (const event of measure.events) ids.push(event.id);
    }
  }
  expect(ids).toEqual(packet.identity.source);
  expect(new Set(packet.identity.duplicate).size).toBe(7);
  expect(packet.identity.duplicate.every(id => !ids.includes(id))).toBe(true);
  const events = document.sections[0]?.measures[0]?.events;
  if (events === undefined) throw new Error("Missing independent exact-note witness");
  const semitones = new Map([["C", 0], ["D", 2], ["E", 4], ["F", 5], ["G", 7], ["A", 9], ["B", 11]]);
  expect(events.map(event => event.voicing.pitches.map(pitch => {
    const base = semitones.get(pitch.step);
    if (base === undefined) throw new Error("Unknown spelled pitch");
    return 12 * (pitch.octave + 1) + base + pitch.alter;
  }))).toEqual(packet.identity.unchangedNotes);
  expect(events.map(event => event.duration)).toEqual(packet.identity.unchangedDurations);
});
