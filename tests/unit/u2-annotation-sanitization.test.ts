/**
 * Unit tests for U2 Annotation Sanitization (L-MARKUP-01).
 */
import { describe, expect, test } from "bun:test";
import { sanitizeAnnotationText } from "../../src/application/chord-inspector";

describe("U2 Annotation Sanitization (L-MARKUP-01)", () => {
  test("preserves clean plain-text annotations untouched", () => {
    const raw = "Play with light staccato feel in second chorus.";
    const result = sanitizeAnnotationText(raw);

    expect(result.isWithinLimit).toBe(true);
    expect(result.isRefused).toBe(false);
    expect(result.hasUnsafeMarkupStripped).toBe(false);
    expect(result.sanitized).toBe(raw);
    expect(result.codePointCount).toBe(raw.length);
  });

  test("strips HTML markup and script tags completely", () => {
    const raw = "<script>alert('pwned')</script>Use <b onclick='eval()'>rootless</b> A voicing & <img src=x onerror=alert(1) />";
    const result = sanitizeAnnotationText(raw);

    expect(result.isWithinLimit).toBe(true);
    expect(result.isRefused).toBe(false);
    expect(result.hasUnsafeMarkupStripped).toBe(true);
    expect(result.sanitized).toBe("alert('pwned')Use rootless A voicing & ");
  });

  test("preserves unicode musical symbols and emojis", () => {
    const raw = "🎷 Bill Evans style: ♭9 / ♯11 resolution 🎵";
    const result = sanitizeAnnotationText(raw);

    expect(result.isWithinLimit).toBe(true);
    expect(result.isRefused).toBe(false);
    expect(result.sanitized).toBe(raw);
  });

  test("refuses annotations exceeding maximum code point limit (500)", () => {
    const raw = "A".repeat(501);
    const result = sanitizeAnnotationText(raw);

    expect(result.isWithinLimit).toBe(false);
    expect(result.isRefused).toBe(true);
    expect(result.refusalCode).toBe("u2.annotation_length_exceeded");
    expect(result.sanitized).toBe("");
  });
});
