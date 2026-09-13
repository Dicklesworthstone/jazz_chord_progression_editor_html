import { expect, test } from "bun:test";
import { parseStableId } from "../../src/domain";
import { createMidiExportDownloadStart, type MidiExportDownloadAnchor } from "../../src/ui/midi-export-delivery";

const id = parseStableId("document", "download-cleanup");
if (!id.ok) throw new Error("Invalid test document ID");
const request = {
  binding: { kind: "standard-midi-file" as const, sourceDocumentId: id.value, sourceRevision: 1,
    filename: "example.mid", byteLength: 3, artifactSha256: "a".repeat(64) },
  privateBytes: new Uint8Array([1, 2, 3]),
};
type Fault = "url" | "anchor" | "href" | "filename" | "attach" | "click" | "revoke" | "remove";
function fixture(faults: readonly Fault[] = []) {
  const calls: string[] = [], urls = new Set<string>(), anchors = new Set<MidiExportDownloadAnchor>();
  const fault = new Error("Injected browser failure");
  const step = (name: Fault): void => { calls.push(name); if (faults.includes(name)) throw fault; };
  let href = "", filename = "";
  const anchor: MidiExportDownloadAnchor = {
    get href() { return href; }, set href(value) { step("href"); href = value; },
    get download() { return filename; }, set download(value) { step("filename"); filename = value; },
    click: () => { step("click"); expect(anchors.has(anchor)).toBe(true); },
    remove: () => { step("remove"); anchors.delete(anchor); },
  };
  const start = createMidiExportDownloadStart({
    createObjectUrl: blob => { step("url"); expect(blob.type).toBe("audio/midi"); urls.add("blob:test"); return "blob:test"; },
    revokeObjectUrl: url => { step("revoke"); urls.delete(url); },
    createAnchor: () => { step("anchor"); return anchor; },
    // An adapter may throw after attachment; cleanup must still remove it.
    attachToDocument: value => { anchors.add(value); step("attach"); },
  });
  return { start, calls, urls, anchors, fault, anchor };
}

test("MIDI activation is synchronous and successful completion releases both resources once", async () => {
  const f = fixture(), started = f.start(request);
  expect(f.calls).toEqual(["url", "anchor", "href", "filename", "attach", "click"]);
  expect(f.anchor.download).toBe("example.mid");
  expect(f.urls.size).toBe(1); expect(f.anchors.size).toBe(1);
  expect(await started.completion).toEqual({ objectUrlsCreated: 1, objectUrlsRevoked: 1, outstandingOwnedResources: 0 });
  await started.completion;
  expect(f.calls.slice(6)).toEqual(["revoke", "remove"]);
  expect(f.urls.size).toBe(0); expect(f.anchors.size).toBe(0);
});

for (const fault of ["url", "anchor", "href", "filename", "attach", "click"] as const) {
  test(`MIDI ${fault} failure releases everything acquired before throwing`, () => {
    const f = fixture([fault]);
    expect(() => f.start(request)).toThrow(f.fault);
    expect(f.urls.size).toBe(0); expect(f.anchors.size).toBe(0);
    expect(f.calls.filter(c => c === "revoke")).toHaveLength(fault === "url" ? 0 : 1);
    expect(f.calls.filter(c => c === "remove")).toHaveLength(fault === "url" || fault === "anchor" ? 0 : 1);
  });
}

for (const faults of [["revoke"], ["remove"], ["revoke", "remove"]] as const) {
  test(`MIDI cleanup accounts for ${faults.join(" and ")} failure and still tries both releases`, async () => {
    const f = fixture(faults), result = await f.start(request).completion;
    expect(f.calls.slice(-2)).toEqual(["revoke", "remove"]);
    expect(result).toMatchObject({ objectUrlsCreated: 1,
      objectUrlsRevoked: faults.some(fault => fault === "revoke") ? 0 : 1,
      outstandingOwnedResources: faults.length });
    if (result === null || typeof result !== "object" || !("error" in result)) throw new Error("Missing cleanup diagnostic");
    expect(typeof result.error).toBe("string");
    expect(f.urls.size + f.anchors.size).toBe(faults.length);
  });
}

test("activation plus cleanup failures preserve the original cause and disclose incomplete cleanup", () => {
  const f = fixture(["click", "revoke"]);
  let failure: unknown;
  try { f.start(request); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error("Missing aggregate failure");
  expect(failure.cause).toBe(f.fault);
  expect(failure.errors).toContain(f.fault);
  expect(f.calls.slice(-2)).toEqual(["revoke", "remove"]);
  expect(f.anchors.size).toBe(0);
});
