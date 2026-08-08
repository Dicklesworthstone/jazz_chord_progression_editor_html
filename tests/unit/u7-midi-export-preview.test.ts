import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  createStudioMidiExport,
  type StudioMidiExportPreview,
  type StudioMidiExportPreparationId,
} from "../../src/application/studio-midi-export";
import type { ValidatedDocument } from "../../src/domain";
import {
  u7DocumentForCase,
  u7PreviewCases,
  type U7PreviewCaseRecord,
} from "../support/u7-midi-export-fixture";

/**
 * Production proof for the U7 preview: every fixture scenario is fed through
 * the real service (real theory compile, real E1 writer, real SHA-256) and
 * the produced preview must equal the packet's independently authored
 * expectation.
 */

type JsonObject = Record<string, unknown>;

function makePorts(document: ValidatedDocument | null): Parameters<
  typeof createStudioMidiExport
>[0] {
  return {
    readDocument: () => document,
    readBinding: () =>
      document === null
        ? null
        : Object.freeze({ documentId: document.id, revision: 7 }),
    hashBytes: (bytes) =>
      Promise.resolve(createHash("sha256").update(bytes).digest("hex")),
    startDelivery: () => {
      throw new Error("delivery is not exercised by the preview suite");
    },
  };
}

function previewShape(preview: StudioMidiExportPreview): JsonObject {
  return {
    readiness: preview.readiness,
    blockers: preview.blockers.map((blocker) => ({
      kind: blocker.kind,
      code: blocker.code,
      eventId: blocker.eventId,
    })),
    realization: preview.realization,
    ppq: preview.ppq,
    trackCount: preview.trackCount,
    tempoBpm: preview.tempoBpm,
    meter: preview.meter,
    derivedMarkers: preview.derivedMarkers.map((marker) => ({
      kind: marker.kind,
      eventId: marker.eventId,
      text: marker.text,
    })),
    losses: preview.losses,
    markerOmissions: preview.markerOmissions,
    titleNotice: preview.titleNotice,
    derivedTitle: preview.derivedTitle,
    artifact: preview.artifact,
  };
}

function expectedShape(entry: U7PreviewCaseRecord): JsonObject {
  const expected = entry.expectedPreview;
  return {
    readiness: expected.readiness,
    blockers: ((expected.blockers as JsonObject[]) ?? []).map((blocker) => ({
      kind: blocker.kind,
      code: blocker.code ?? null,
      eventId: blocker.eventId ?? null,
    })),
    realization: expected.realization,
    ppq: expected.ppq,
    trackCount: expected.trackCount,
    tempoBpm: expected.tempoBpm,
    meter: expected.meter,
    derivedMarkers: expected.derivedMarkers ?? [],
    losses: expected.losses ?? [],
    markerOmissions: expected.markerOmissions ?? [],
    titleNotice: expected.titleNotice ?? null,
    derivedTitle: expected.derivedTitle,
    artifact: expected.artifact ?? null,
  };
}

const DECLARED_ONLY_CASES = new Set(["U7-PRE-004", "U7-PRE-005"]);

describe("U7 MIDI export preview (production vs packet fixtures)", () => {
  for (const entry of u7PreviewCases()) {
    if (DECLARED_ONLY_CASES.has(entry.id)) continue;
    test(`${entry.id}: ${entry.summary}`, async () => {
      const document = u7DocumentForCase(entry);
      const service = createStudioMidiExport(makePorts(document));
      const result = await service.openPreview();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(previewShape(result.preview)).toEqual(expectedShape(entry));
      /* determinism: a second open over the same document yields the same preview */
      const second = createStudioMidiExport(makePorts(document));
      const repeated = await second.openPreview();
      expect(repeated.ok).toBe(true);
      if (!repeated.ok) return;
      expect(previewShape(repeated.preview)).toEqual(previewShape(result.preview));
      if (result.preview.artifact !== null && repeated.preview.artifact !== null) {
        expect(repeated.preview.artifact.sha256).toBe(
          result.preview.artifact.sha256,
        );
      }
      /* the ready preview leaves a prepared artifact in the registry */
      if (result.preview.readiness === "ready") {
        expect(result.preparationId).not.toBeNull();
        expect(service.inspectRegistry().state).toBe("ready");
        service.abandon(result.preparationId as StudioMidiExportPreparationId);
        expect(service.inspectRegistry().state).toBe("empty");
      } else {
        expect(service.inspectRegistry().state).toBe("empty");
      }
    });
  }

  test("no current document refuses with u7.document_unavailable", async () => {
    const service = createStudioMidiExport(makePorts(null));
    const result = await service.openPreview();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe("u7.document_unavailable");
    expect(service.inspectRegistry().state).toBe("empty");
  });

  test("hash port failure refuses with u7.hash_unavailable and prepares nothing", async () => {
    const entry = u7PreviewCases().find(
      (candidate) => candidate.id === "U7-PRE-001",
    );
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const document = u7DocumentForCase(entry);
    const ports = makePorts(document);
    const service = createStudioMidiExport({
      ...ports,
      hashBytes: () => Promise.reject(new Error("no subtle crypto")),
    });
    const result = await service.openPreview();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe("u7.hash_unavailable");
    expect(service.inspectRegistry().state).toBe("empty");
  });

  test("a second open while a preparation is held refuses u7.preparation_conflict", async () => {
    const entry = u7PreviewCases().find(
      (candidate) => candidate.id === "U7-PRE-001",
    );
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const document = u7DocumentForCase(entry);
    const service = createStudioMidiExport(makePorts(document));
    const first = await service.openPreview();
    expect(first.ok).toBe(true);
    const conflict = await service.openPreview();
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.refusal.code).toBe("u7.preparation_conflict");
  });

  test("U7-PRE-004 declared realization blocker mirrors the packet row", () => {
    const entry = u7PreviewCases().find(
      (candidate) => candidate.id === "U7-PRE-004",
    );
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const blockers = entry.expectedPreview.blockers as JsonObject[];
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatchObject({
      kind: "realization",
      code: "voicing.constraints_unsatisfied",
      eventId: "event-0000",
    });
    expect(entry.expectedPreview.readiness).toBe("blocked");
  });

  test("U7-PRE-005 declared custom-voicing blocker mirrors the packet row (defensive law)", () => {
    const entry = u7PreviewCases().find(
      (candidate) => candidate.id === "U7-PRE-005",
    );
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const blockers = entry.expectedPreview.blockers as JsonObject[];
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatchObject({
      kind: "plan",
      code: "playback.custom_voicing_missing",
      eventId: "event-0000",
    });
  });
});
