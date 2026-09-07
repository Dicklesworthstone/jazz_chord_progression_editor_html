import { expect, test } from "bun:test";
import { decodeMyChartsBackup } from "../../src/application/my-charts";

test("the actual outer backup byte boundary accepts a complete envelope and rejects one extra byte", () => {
  // Literal wire fixture and accepted contract boundary, independent of the
  // production encoder/constants. Trailing JSON whitespace is valid input.
  const wire = '{"schema":"changes.my-charts.backup.v1","records":[]}';
  const exact = wire + " ".repeat(67_239_936 - wire.length);
  expect(new TextEncoder().encode(exact).byteLength).toBe(67_239_936);
  expect(decodeMyChartsBackup(exact)).toEqual({ ok: true, value: [] });
  expect(decodeMyChartsBackup(exact + " ")).toEqual({ ok: false, code: "my-charts.backup_limit" });
});
