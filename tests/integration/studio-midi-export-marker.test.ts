import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { createStudioComposition } from "../../src/application";
import { seedStarterChart } from "../../src/application/runtime";

test("U5-LIFE-018: the real composition's MIDI delivery preserves canonical markers and chart authority", async () => {
  const delivered: Uint8Array[] = [];
  const created = createStudioComposition({
    midiExportHashBytes: bytes => Promise.resolve(createHash("sha256").update(bytes).digest("hex")),
    midiExportDelivery: request => {
      delivered.push(request.privateBytes.slice());
      return { completion: Promise.resolve({ objectUrlsCreated: 1, objectUrlsRevoked: 1, outstandingOwnedResources: 0 }) };
    },
  });
  if (!created.ok) throw new Error("BOOTSTRAP_FAILED");
  const { composition } = created;
  expect(seedStarterChart(composition.controller).seeded).toBe(true);
  expect(composition.controller.setTitle("MIDI is not an exact chart backup").ok).toBe(true);
  const before = composition.readApplicationState();
  expect(before.exportRevision).toBeNull();
  const service = composition.midiExport;
  if (service === null) throw new Error("MIDI_SERVICE_UNWIRED");
  const preview = await service.openPreview();
  if (!preview.ok || preview.preparationId === null) throw new Error("MIDI_PREVIEW_NOT_READY");
  expect(preview.preview.readiness).toBe("ready");
  expect(service.generate(preview.preparationId).outcome).toBe("generated");
  expect((await service.download(preview.preparationId)).outcome).toBe("handed-off");
  expect(delivered).toHaveLength(1);
  expect(Array.from(delivered[0]?.slice(0, 4) ?? [])).toEqual([0x4d, 0x54, 0x68, 0x64]);
  const after = composition.readApplicationState();
  expect(after.document).toBe(before.document);
  expect(after.revision).toBe(before.revision);
  expect(after.history).toBe(before.history);
  expect(after.exportRevision).toBe(before.exportRevision);
  expect(after.recovery).toBe(before.recovery);
  expect(after.bookmarks).toBe(before.bookmarks);
  expect(service.inspectRegistry().state).toBe("empty");
});
