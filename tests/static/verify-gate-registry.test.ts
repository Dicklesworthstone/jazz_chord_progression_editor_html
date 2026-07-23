import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const VERIFY_SCRIPT_PATH = resolve(root, "scripts/verify.ts");
const GATE_ID_PATTERN = /id:\s*"([^"]+)"/gu;
const GATE_COMMAND_PATTERN = /command:\s*\[process\.execPath,\s*"([^"]+)"/gu;

describe("aggregate verify gate registry", () => {
  test("registers every gate id exactly once", async () => {
    const source = await readFile(VERIFY_SCRIPT_PATH, "utf8");
    const ids = [...source.matchAll(GATE_ID_PATTERN)]
      .map((match) => match[1])
      .filter((id): id is string => typeof id === "string");
    expect(ids.length).toBeGreaterThan(0);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  test("registers every gate command script exactly once and each exists", async () => {
    const source = await readFile(VERIFY_SCRIPT_PATH, "utf8");
    const scripts = [...source.matchAll(GATE_COMMAND_PATTERN)]
      .map((match) => match[1])
      .filter((script): script is string => typeof script === "string")
      .filter((script) => script !== "test");
    expect(scripts.length).toBeGreaterThan(0);
    const duplicates = scripts.filter(
      (script, index) => scripts.indexOf(script) !== index,
    );
    expect(duplicates).toEqual([]);
    for (const script of scripts) {
      expect(await Bun.file(resolve(root, script)).exists()).toBe(true);
    }
  });
});
