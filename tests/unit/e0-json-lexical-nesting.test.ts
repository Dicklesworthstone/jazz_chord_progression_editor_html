import { expect, test } from "bun:test";
import { classifyJsonLexically } from "../../src/application/e0-interchange";

for (const source of ["{", '{"name":1,', '{"sections":[]', '{"schema":"changes.progression.v2",']) {
  test(`an unfinished object reaches the syntax diagnostic: ${source}`, () => {
    expect(classifyJsonLexically(source)).toMatchObject({ ok: true, route: "host-parse-to-diagnose-malformed" });
  });
}
test("a closed unrecognized object remains a shape refusal", () => {
  expect(classifyJsonLexically('{"name":1}')).toEqual({ ok: true, route: "unversioned-unrecognized",
    schema: null, rootOwnSectionsArrayObserved: false });
});

for (const [name, text, key] of [
  ["nested literal key", '{"schema":"changes.progression.v2","meter":{"beatsPerBar":4,"beatsPerBar":3}}', '"beatsPerBar":3'],
  ["nested escaped alias", '{"schema":"changes.progression.v2","meter":{"beatsPerBar":4,"\\u0062eatsPerBar":3}}', '"\\u0062eatsPerBar":3'],
  ["object in array", '{"schema":"changes.progression.v2","sections":[{"name":"A","name":"B"}]}', '"name":"B"'],
  ["second nested sibling", '{"schema":"changes.progression.v2","sections":[{"name":"A"},{"name":"B","name":"C"}]}', '"name":"C"'],
  ["root array", '[{"name":"A","name":"B"}]', '"name":"B"'],
] as const) {
  test(`E0 lexical preflight reports the exact decoded duplicate: ${name}`, () => {
    const start = text.indexOf(key);
    expect(classifyJsonLexically(text)).toEqual({ ok: false, code: "import.json_duplicate_key",
      range: { start, end: start + key.indexOf(":") } });
  });
}

test("the same key in separate objects is not a duplicate", () => {
  expect(classifyJsonLexically('{"schema":"changes.progression.v2","sections":[{"name":"A"},{"name":"B"}]}'))
    .toEqual({ ok: true, route: "canonical-v2", schema: "changes.progression.v2", rootOwnSectionsArrayObserved: true });
});

test("quoted punctuation is data, never an object key or container boundary", () => {
  expect(classifyJsonLexically('{"schema":"changes.progression.v2","description":"\\"x\\":1,\\"x\\":2 {} []","sections":[]}'))
    .toEqual({ ok: true, route: "canonical-v2", schema: "changes.progression.v2", rootOwnSectionsArrayObserved: true });
});
