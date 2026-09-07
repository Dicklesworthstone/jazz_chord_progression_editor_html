import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { expect, test } from "bun:test";
import fixture from "../fixtures/exact-share/document.changes.json";
import { createStudioBootstrap, createStudioCompositionOverState, createStudioDocumentImport,
  createX1SerializedTransportRetirementAdapter } from "../../src/application";
import { createStudioExactShare } from "../../src/application/studio-exact-share";
import { applyExactSharedStartup } from "../../src/application/exact-share-startup";
import { decodeExactShareText, encodeExactShareDocument } from "../../src/application/exact-share";
import { createStudioLifecycle } from "../../src/application/studio-lifecycle";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import { createTransportHarness } from "../support/transport-test-kit";

function harness(writeClipboard: (text: string) => Promise<void> = () => Promise.resolve()) {
  const bootstrap = createStudioBootstrap(); if (!bootstrap.ok) throw new Error("bootstrap refused");
  const composition = createStudioCompositionOverState(bootstrap.value.state, bootstrap.value.dependencies, { nowMs: () => 12000 });
  const recovery = createRecoveryHarness(), transport = createTransportHarness();
  const retirement = createX1SerializedTransportRetirementAdapter(transport.service, transport.nextRequestId, {
    beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
    settled: composition.replacementWorkflow.settleTransportRetirement,
  });
  let deliveries = 0;
  const lifecycle = createStudioLifecycle({ composition, recovery: recovery.service,
    hashBytes: bytes => Promise.resolve(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")), nowIso: () => "2026-09-07T00:00:00.000Z",
    startDelivery: () => { deliveries++; throw new Error("No delivery gesture was authorized by these preparation cases"); },
  });
  const importer = createStudioDocumentImport({ composition, recovery: recovery.service, retirement,
    exportCurrent: () => { void lifecycle.openExport(); } });
  const sharing = createStudioExactShare({ composition, lifecycle, readLocation: () => "file:///private/studio.html", writeClipboard });
  return { composition, controller: composition.controller, importer, recovery, transport, sharing, lifecycle, deliveries: () => deliveries };
}

const exactText = JSON.stringify(fixture);
test("exact startup publishes the independent document in one undoable E0 swap without audio initialization", async () => {
  const h = harness(), before = h.composition.readApplicationState();
  expect(await applyExactSharedStartup(h.composition, h.importer, exactText)).toEqual({ applied: true });
  const after = h.composition.readApplicationState();
  const observed: unknown = after.document;
  expect(observed).toEqual(fixture); expect(after.history.undo).toHaveLength(1);
  expect(after.exportRevision).toBeNull(); expect(after.dialogs).toEqual([]); expect(after.importDraft).toBeNull();
  expect(h.transport.service.inspectTransport().state).toBe("locked");
  expect(h.controller.undo().ok).toBe(true); expect(h.composition.readApplicationState().document).toEqual(before.document);
  expect(h.controller.redo().ok).toBe(true); const redone: unknown = h.composition.readApplicationState().document; expect(redone).toEqual(fixture);
});
for (const [label, text] of [
  ["syntax", "{"], ["unknown field", exactText.replace('"schema":', '"extra":1,"schema":')],
  ["escaped duplicate", exactText.replace('"numerator":5', '"numerator":5,"\\u006eumerator":5')],
  ["future schema", exactText.replace('changes.progression.v2','changes.progression.v3')],
  ["invalid duration", exactText.replace('"numerator":5','"numerator":0')],
  ["note spelling", exactText.replace('"step":"E"','"step":"H"')],
  ["duplicate ID", exactText.replace('share-event-frozen','share-event-manual')],
  ["depth", '{"x":'.repeat(33)+'0'+'}'.repeat(33)],
] as const) test(`startup refuses ${label} through real E0/F2/F3 and preserves the blank chart`, async () => {
  const h = harness(), before = h.composition.readApplicationState();
  const result = await applyExactSharedStartup(h.composition, h.importer, text);
  expect(result.applied).toBe(false); expect(h.composition.readApplicationState().document).toBe(before.document);
  expect(h.composition.readApplicationState().history).toBe(before.history);
  expect(h.composition.readApplicationState().dialogs).toEqual([]); expect(h.composition.readApplicationState().importDraft).toBeNull();
  expect(h.transport.service.inspectTransport().state).toBe("locked");
});
test("startup refuses an edited workspace and an edit entered across preparation", async () => {
  const h = harness(); expect(h.controller.setTitle("Keep my edit").ok).toBe(true);
  const before = h.composition.readApplicationState();
  expect((await applyExactSharedStartup(h.composition, h.importer, exactText)).applied).toBe(false);
  expect(h.composition.readApplicationState()).toBe(before);
  const fresh = harness(), pending = applyExactSharedStartup(fresh.composition, fresh.importer, exactText);
  expect(fresh.controller.setTitle("Edit while reading").ok).toBe(true);
  const edited = fresh.composition.readApplicationState();
  expect((await pending).applied).toBe(false);
  expect(fresh.composition.readApplicationState().document).toBe(edited.document);
  expect(fresh.composition.readApplicationState().history).toBe(edited.history);
});
test("Share carries exact canonical state and never writes on open or changes markers/history", async () => {
  const copied: string[] = [], h = harness(text => { copied.push(text); return Promise.resolve(); });
  expect((await applyExactSharedStartup(h.composition, h.importer, exactText)).applied).toBe(true);
  const before = h.composition.readApplicationState(); h.sharing.open();
  expect(h.composition.readApplicationState().dialogs.map(dialog => dialog.kind)).toEqual(["exact-share"]);
  expect(copied).toEqual([]); expect(h.deliveries()).toBe(0);
  expect(h.sharing.getSnapshot().url?.startsWith("https://jazzchords.org/#zdoc=2.")).toBe(true);
  await h.sharing.copy(); expect(copied).toHaveLength(1); expect(h.sharing.getSnapshot().phase).toBe("copied");
  const decoded = decodeExactShareText(new URL(copied[0] ?? "").hash);
  if (!decoded.ok) throw new Error(decoded.message);
  expect(JSON.parse(decoded.value)).toEqual(fixture);
  h.sharing.cancel(); const after = h.composition.readApplicationState();
  expect(after.document).toBe(before.document); expect(after.history).toBe(before.history);
  expect(after.exportRevision).toBe(before.exportRevision); expect(after.recovery).toBe(before.recovery);
  expect(after.dialogs).toEqual([]);
});
test("a changed chart needs a second explicit copy click", async () => {
  const copied: string[] = [], h = harness(text => { copied.push(text); return Promise.resolve(); });
  h.sharing.open(); expect(h.controller.setTitle("Updated title").ok).toBe(true);
  await h.sharing.copy(); expect(copied).toEqual([]); expect(h.sharing.getSnapshot().message).toContain("changed");
  await h.sharing.copy(); expect(copied).toHaveLength(1); expect(h.sharing.getSnapshot().phase).toBe("copied");
});
for (const cancel of [false,true]) test(`late clipboard cannot certify a newer chart or reopen a cancelled owner (${String(cancel)})`, async () => {
  let settle: () => void = () => { throw new Error("copy did not begin"); }; let calls = 0;
  const h = harness(() => { calls++; return new Promise<void>(resolve => { settle = resolve; }); });
  h.sharing.open(); const pending = h.sharing.copy(); await h.sharing.copy(); expect(calls).toBe(1);
  if (cancel) { h.sharing.cancel(); h.sharing.open(); }
  else expect(h.controller.setTitle("Changed during copy").ok).toBe(true);
  settle(); await pending;
  expect(h.sharing.getSnapshot().phase).not.toBe("copied"); expect(h.sharing.getSnapshot().copyPending).toBe(false);
  if (cancel) expect(h.sharing.getSnapshot().message).toBeNull();
  else expect(h.sharing.getSnapshot().message).toContain("previous chart");
});
test("clipboard denial leaves a selectable exact URL and cancellation remains inert", async () => {
  const h = harness(() => Promise.reject(new Error("denied"))); h.sharing.open(); const url = h.sharing.getSnapshot().url;
  await h.sharing.copy(); expect(h.sharing.getSnapshot().url).toBe(url);
  expect(h.sharing.getSnapshot().message).toContain("Select and copy"); expect(h.sharing.getSnapshot().phase).toBe("ready");
  h.sharing.cancel(); expect(h.sharing.getSnapshot().open).toBe(false);
});
test("oversized sharing opens existing exact JSON preparation only after an explicit fallback gesture", async () => {
  const h = harness(); const large = JSON.stringify({ ...fixture, description: "🎹".repeat(2000) });
  expect((await applyExactSharedStartup(h.composition,h.importer,large)).applied).toBe(true);
  h.sharing.open(); expect(h.sharing.getSnapshot()).toMatchObject({ phase: "oversized", url: null });
  expect(h.lifecycle.getSnapshot().dialog).toBeNull(); expect(h.deliveries()).toBe(0);
  h.sharing.downloadJson(); expect(h.sharing.getSnapshot().open).toBe(false);
  expect(h.lifecycle.getSnapshot().dialog).toBe("export");
  expect(h.composition.readApplicationState().dialogs.map(dialog => dialog.kind)).toEqual(["lifecycle-export"]);
  for(let i=0;i<100 && h.lifecycle.getSnapshot().phase==="preparing";i++) await Promise.resolve();
  expect(h.lifecycle.getSnapshot().phase).toBe("ready"); expect(h.deliveries()).toBe(0);
  h.lifecycle.cancelLifecycleDialog();
});

test("an empty canonical chart shares and opens without inventing chords", async () => {
  const source = harness(), recipient = harness();
  const original = source.composition.readApplicationState().document;
  const encoded = encodeExactShareDocument(original);
  if (!encoded.ok) throw new Error(encoded.message);
  const decoded = decodeExactShareText(encoded.value);
  if (!decoded.ok) throw new Error(decoded.message);
  expect(await applyExactSharedStartup(recipient.composition, recipient.importer, decoded.value)).toEqual({ applied: true });
  expect(recipient.composition.readApplicationState().document).toEqual(original);
  expect(recipient.controller.getSnapshot().chordCount).toBe(0);
});
test("same-build chart voicing plans keep independent ordered pitches and rational time across sharing", async () => {
  const source = harness(), recipient = harness();
  expect((await applyExactSharedStartup(source.composition, source.importer, exactText)).applied).toBe(true);
  const original = source.composition.readApplicationState().document;
  const encoded = encodeExactShareDocument(original);
  if (!encoded.ok) throw new Error(encoded.message);
  const decoded = decodeExactShareText(encoded.value);
  if (!decoded.ok) throw new Error(decoded.message);
  expect((await applyExactSharedStartup(recipient.composition, recipient.importer, decoded.value)).applied).toBe(true);
  const before = compileStudioPlaybackPlan(original), after = compileStudioPlaybackPlan(recipient.composition.readApplicationState().document);
  if (!before.ok || !after.ok) throw new Error(JSON.stringify({ before, after }));
  expect(after.plan).toEqual(before.plan);
  const pitches: readonly (readonly number[])[] = after.plan.events.map(event => event.midiPitches);
  expect(pitches).toEqual([[64,49,49,49],[59,64,67,72]]);
  expect(after.plan.events.map(event => ({ numerator: event.durationBeats.numerator, denominator: event.durationBeats.denominator }))).toEqual([{numerator:5,denominator:3},{numerator:7,denominator:3}]);
  expect(after.plan.events.map(event => ({ numerator: event.startBeat.numerator, denominator: event.startBeat.denominator }))).toEqual([{numerator:0,denominator:1},{numerator:5,denominator:3}]);
});
