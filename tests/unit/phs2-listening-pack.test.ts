import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { renderClarinetListeningPack } from "../../scripts/render-phs2-listening-pack";

describe("PHS2 clarinet listening pack", () => {
  test("is deterministic, covers the review matrix, and cannot claim a human result", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "phs2-listening-a-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "phs2-listening-b-"));
    const first = await renderClarinetListeningPack(firstRoot);
    const second = await renderClarinetListeningPack(secondRoot);
    expect(first["manifestSha256"]).toBe(second["manifestSha256"]);
    const manifest = first["manifest"] as Record<string, unknown>;
    expect((manifest["clips"] as unknown[]).length).toBe(12);
    expect(manifest["manualListening"]).toEqual({
      performed: false,
      outcome: "not-assessed",
      reason: "This command renders evidence; only the owner can record the required listening judgment.",
    });
    expect(manifest["legalReferenceRecording"]).toEqual({
      included: false,
      reason: "Pass the extracted FreePats sample directory to include the reviewed CC0 acoustic reference.",
    });
    const review = JSON.parse(await readFile(join(first["root"] as string, "review-template.json"), "utf8")) as Record<string, unknown>;
    expect(review["verdict"]).toBeNull();
    expect(Object.keys(review["observationsByCase"] as object)).toHaveLength(12);
  }, 30_000);
});
