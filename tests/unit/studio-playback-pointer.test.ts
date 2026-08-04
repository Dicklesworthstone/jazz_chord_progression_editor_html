/**
 * jcpe-hxap evidence: the playback pointer resolves the sounding chord and
 * the sweep fraction from the exact fraction labels the view model
 * publishes, with cross-multiplied bigint comparison and no rounding in
 * the containment decision.
 */
import { describe, expect, test } from "bun:test";

import { playbackPointer } from "../../src/ui/App";
import type { StudioViewModel } from "../../src/application/runtime";

function snapshotWith(
  status: string,
  playheadBeatLabel: string,
): StudioViewModel {
  return {
    transport: { status, playheadBeatLabel },
    sections: [
      {
        measures: [
          {
            events: [
              {
                id: "ev-1",
                symbolText: "Gadd9",
                startBeatLabel: "0/1",
                durationBeatLabel: "4/1",
              },
              {
                id: "ev-2",
                symbolText: "Cadd9/E",
                startBeatLabel: "4/1",
                durationBeatLabel: "4/1",
              },
              {
                id: "ev-3",
                symbolText: "Bm7",
                startBeatLabel: "8/1",
                durationBeatLabel: "2/1",
              },
              {
                id: "ev-4",
                symbolText: "E7#9",
                startBeatLabel: "10/1",
                durationBeatLabel: "2/1",
              },
            ],
          },
        ],
      },
    ],
  } as unknown as StudioViewModel;
}

describe("the playback pointer", () => {
  test("is inert unless the transport is playing", () => {
    expect(playbackPointer(snapshotWith("ready", "0/1"))).toEqual({
      chordId: null,
      chordLabel: null,
      progressPercent: null,
    });
    expect(playbackPointer(snapshotWith("paused", "5/1"))).toEqual({
      chordId: null,
      chordLabel: null,
      progressPercent: null,
    });
  });

  test("resolves the sounding chord by half-open exact containment", () => {
    expect(playbackPointer(snapshotWith("playing", "0/1")).chordId).toBe("ev-1");
    expect(playbackPointer(snapshotWith("playing", "7/2")).chordId).toBe("ev-1");
    /* A boundary belongs to the next chord: [start, end). */
    expect(playbackPointer(snapshotWith("playing", "4/1")).chordId).toBe("ev-2");
    expect(playbackPointer(snapshotWith("playing", "9/1")).chordLabel).toBe("Bm7");
    expect(playbackPointer(snapshotWith("playing", "10/1")).chordLabel).toBe(
      "E7#9",
    );
  });

  test("compares non-normalized fractions exactly", () => {
    /* 8/2 == 4/1: the boundary still belongs to the second chord. */
    expect(playbackPointer(snapshotWith("playing", "8/2")).chordId).toBe("ev-2");
    /* 39/10 sits just inside the first chord; 79/10 just inside the second. */
    expect(playbackPointer(snapshotWith("playing", "39/10")).chordId).toBe(
      "ev-1",
    );
    expect(playbackPointer(snapshotWith("playing", "79/10")).chordId).toBe(
      "ev-2",
    );
  });

  test("reports the sweep fraction against the chart end", () => {
    const half = playbackPointer(snapshotWith("playing", "6/1"));
    expect(half.progressPercent).toBe(50);
    const done = playbackPointer(snapshotWith("playing", "12/1"));
    expect(done.chordId).toBe(null);
    expect(done.progressPercent).toBe(100);
  });

  test("beyond-the-end playheads clamp and resolve no chord", () => {
    const past = playbackPointer(snapshotWith("playing", "999/1"));
    expect(past.chordId).toBe(null);
    expect(past.progressPercent).toBe(100);
  });

  /* jcpe-v31p: the live display label outranks the last-notified label. */
  test("a live playhead label overrides the committed label while playing", () => {
    const live = playbackPointer(snapshotWith("playing", "0/1"), "9/1");
    expect(live.chordId).toBe("ev-3");
    expect(live.chordLabel).toBe("Bm7");
    expect(live.progressPercent).toBe(75);
  });

  test("a null live label falls back to the committed label", () => {
    expect(playbackPointer(snapshotWith("playing", "4/1"), null).chordId).toBe(
      "ev-2",
    );
  });

  test("while starting, the committed start beat highlights and the live label is ignored", () => {
    const starting = playbackPointer(snapshotWith("starting", "0/1"), "9/1");
    expect(starting.chordId).toBe("ev-1");
  });

  test("outside playing and starting the live label cannot resurrect a pointer", () => {
    expect(playbackPointer(snapshotWith("ready", "0/1"), "9/1").chordId).toBe(
      null,
    );
  });
});
