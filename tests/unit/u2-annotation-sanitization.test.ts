/**
 * Exact inert annotation data (L-MARKUP-01), reconciled with Foundation.
 */
import { describe, expect, test } from "bun:test";
import { inspectAnnotationText } from "../../src/application/chord-inspector";
import fixtures from "../fixtures/chord-inspector/annotation-cases.json";

describe("U2 inert annotations (L-MARKUP-01)", () => {
  test("preserves clean plain-text annotations untouched", () => {
    const raw = "Play with light staccato feel in second chorus.";
    const result = inspectAnnotationText(raw);

    expect(result.isWithinLimit).toBe(true);
    expect(result.isRefused).toBe(false);
    expect(result.text).toBe(raw);
    expect(result.codePointCount).toBe(raw.length);
  });

  test("preserves literal HTML/script source for safe text-node rendering", () => {
    const raw = "<script>alert('pwned')</script>Use <b onclick='eval()'>rootless</b> A voicing & <img src=x onerror=alert(1) />";
    const result = inspectAnnotationText(raw);

    expect(result.isWithinLimit).toBe(true);
    expect(result.isRefused).toBe(false);
    expect(result.text).toBe(raw);
  });

  test("preserves unicode musical symbols and emojis", () => {
    const raw = "🎷 Bill Evans style: ♭9 / ♯11 resolution 🎵";
    const result = inspectAnnotationText(raw);

    expect(result.isWithinLimit).toBe(true);
    expect(result.isRefused).toBe(false);
    expect(result.text).toBe(raw);
  });

  test("refuses2001 code points without erasing the user's draft", () => {
    const raw = "A".repeat(2001);
    const result = inspectAnnotationText(raw);

    expect(result.isWithinLimit).toBe(false);
    expect(result.isRefused).toBe(true);
    expect(result.refusalCode).toBe("u2.annotation_length_exceeded");
    expect(result.text).toBe(raw);
  });

  for (const scenario of fixtures.cases) test(scenario.id, () => {
    const result = inspectAnnotationText(scenario.rawInput);
    expect(result.text).toBe(scenario.expected.text);
    expect(result.codePointCount).toBe(scenario.expected.codePoints);
    expect(result.isWithinLimit).toBe(scenario.expected.isWithinLimit);
    expect(result.isRefused).toBe(scenario.expected.isRefused);
    expect(scenario.expected.refusalCode ?? null).toBe(result.refusalCode);
  });
});
