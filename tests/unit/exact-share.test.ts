import { expect, test } from "bun:test";
import fixture from "../fixtures/exact-share/document.changes.json";
import { EXACT_SHARE_BOUNDARIES, EXACT_SHARE_INVALID_WIRE, EXACT_SHARE_WIRE } from "../fixtures/exact-share";
import { decodeDocumentShape } from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { compactCanonicalShareDocument, decodeExactShareText, decodeSharedStartup,
  encodeExactShareDocument, encodeExactShareText, exactShareUrl } from "../../src/application/exact-share";

function validate(value: unknown) {
  const decoded = decodeDocumentShape(value);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded));
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error(JSON.stringify(validated));
  return validated.value;
}
for (const row of EXACT_SHARE_WIRE) test(`exact wire ${row.encoded}`, () => {
  expect(encodeExactShareText(row.text)).toEqual({ ok: true, value: `#zdoc=2.${row.encoded}` });
  expect(decodeExactShareText(`#zdoc=2.${row.encoded}`)).toEqual({ ok: true, value: row.text });
});
for (const [name, wire] of EXACT_SHARE_INVALID_WIRE) test(`refuse ${name}`, () => {
  expect(decodeExactShareText(`#zdoc=2.${wire}`).ok).toBe(false);
});
for (const row of EXACT_SHARE_BOUNDARIES) test(`exact byte boundary ${String(row.bytes)}`, () => {
  const text = "x".repeat(row.bytes), wire = `#zdoc=2.${Buffer.from(text).toString("base64url")}`;
  expect(wire.length).toBe(row.fragmentChars);
  expect(encodeExactShareText(text).ok).toBe(row.accepted);
  expect(decodeExactShareText(wire).ok).toBe(row.accepted);
});
test("UTF-8 byte cap and final unused bits refuse near misses", () => {
  expect(encodeExactShareText("é".repeat(3069)).ok).toBe(true);
  expect(encodeExactShareText("é".repeat(3070)).ok).toBe(false);
  for (const payload of ["Zg_", "Zh", "Zg=", "e30#", "e30?x", "e30\n"]) {
    expect(decodeExactShareText(`#zdoc=2.${payload}`).ok).toBe(false);
  }
  expect(decodeExactShareText("#zdoc=2.Zg")).toEqual({ ok: true, value: "f" });
});
test("entire independent document survives canonical sharing, including literal text and repeated notes", () => {
  const doc = validate(fixture), encoded = encodeExactShareDocument(doc);
  expect(encoded.ok).toBe(true); if (!encoded.ok) throw new Error(encoded.message);
  const decoded = decodeExactShareText(encoded.value);
  if (!decoded.ok) throw new Error(decoded.message);
  expect(JSON.parse(decoded.value)).toEqual(fixture);
  expect(validate(JSON.parse(decoded.value))).toEqual(doc);
  expect(encodeExactShareDocument(doc)).toEqual(encoded);
  expect(decoded.value).toContain('"numerator":5,"denominator":3');
});
test("lexical compaction preserves escaped quotes, spaces, backslashes and negative zero", () => {
  const doc = validate({ ...fixture, title: 'Quoted " \\ text\n🎹', playback: { ...fixture.playback, masterVolume: -0 } });
  const text = compactCanonicalShareDocument(doc), parsed: unknown = JSON.parse(text);
  expect(parsed).toEqual(doc); expect(text).toContain('"masterVolume":-0');
  expect(text).toContain('Quoted \\" \\\\ text\\n🎹');
});
test("version routing retains v1 reader and refuses unknown versions", () => {
  const payload = { v: 1, t: "Older", b: 120, g: "straight-eighths@1", c: "| Cmaj7:4/1 |" };
  const decoded = decodeSharedStartup(`#zdoc=1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`);
  expect(decoded).toMatchObject({ ok: true, value: { version: 1, payload: { title: "Older" } } });
  expect(decodeSharedStartup("#zdoc=3.e30")).toMatchObject({ ok: false, code: "share.version_unsupported" });
  expect(decodeSharedStartup("#section")).toMatchObject({ ok: false, code: "share.fragment_absent" });
});
test("URL construction hides local paths and credentials without any network operation", () => {
  expect(exactShareUrl("file:///private/Teacher/My%20Chart.html", "#zdoc=2.e30")).toBe("https://jazzchords.org/#zdoc=2.e30");
  expect(exactShareUrl("https://user:password@example.com/a%20b?secret=1#old", "#zdoc=2.e30")).toBe("https://example.com/a%20b#zdoc=2.e30");
  expect(exactShareUrl("http://127.0.0.1:9000/index.html?q=1", "#zdoc=2.e30")).toBe("http://127.0.0.1:9000/index.html#zdoc=2.e30");
  expect(exactShareUrl("javascript:alert(1)", "#zdoc=2.e30")).toBeNull();
});

test("an independently spelled F-major specimen retains enharmonic unisons and registers", () => {
  const first = fixture.sections[0], manual = first?.measures[0]?.events[0], frozen = first?.measures[0]?.events[1];
  if (first === undefined || manual === undefined || frozen === undefined) throw new Error("Missing independent fixture");
  const pitches = [{ step: "A", alter: 0, octave: 4 }, { step: "G", alter: -1, octave: 3 },
    { step: "G", alter: -1, octave: 3 }, { step: "F", alter: 1, octave: 3 }];
  const frozenPitches = [{ step: "E", alter: 0, octave: 4 }, { step: "A", alter: 0, octave: 4 },
    { step: "C", alter: 0, octave: 5 }, { step: "F", alter: 0, octave: 5 }];
  const doc = validate({ ...fixture, key: { tonic: { step: "F", alter: 0 }, mode: "major" }, sections: [{ ...first,
    keyOverride: { tonic: { step: "G", alter: -1 }, mode: "major" }, measures: [{ id: "share-measure-a", completion: { kind: "complete" }, events: [
      { ...manual, chord: { kind: "custom", sourceText: "A / Gb + F#", label: "A / Gb + F#", bass: null,
        pitchNames: [{ step: "A", alter: 0 }, { step: "G", alter: -1 }, { step: "F", alter: 1 }] },
        voicing: { mode: "manual", bassPolicy: "included", pitches } },
      { ...frozen, chord: { ...frozen.chord, sourceText: "Fmaj7", root: { step: "F", alter: 0 } },
        voicing: { ...frozen.voicing, pitches: frozenPitches } },
    ] }] }, fixture.sections[1]] });
  const encoded = encodeExactShareDocument(doc); if (!encoded.ok) throw new Error(encoded.message);
  const decoded = decodeExactShareText(encoded.value); if (!decoded.ok) throw new Error(decoded.message);
  const opened = validate(JSON.parse(decoded.value)); expect(opened).toEqual(doc);
  const events = opened.sections[0]?.measures[0]?.events;
  const observed: unknown = events?.map(event => event.voicing.mode === "auto" ? [] : event.voicing.pitches);
  expect(observed).toEqual([pitches, frozenPitches]);
});
