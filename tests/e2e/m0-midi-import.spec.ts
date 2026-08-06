import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cards,
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
} from "./u1-chart-kit";

/**
 * M0 MIDI import over the real generated artifact.
 *
 * Everything here runs in a real browser against the built standalone file:
 * the file input, the embedded wasm decoder, the reverse-T1 preview, the
 * commit as ONE undoable edit, and the honest refusal of a hostile file. The
 * bytes come from the independently authored fixtures — `*.mid` is ignored by
 * this repository for provenance reasons, so the specs hand Playwright the
 * fixture bytes directly instead of a checked-in file.
 */

type GoldenCase = Readonly<{ id: string; bytesHex: string }>;
type RefusalCase = Readonly<{
  id: string;
  bytesHex?: string;
  expected: Readonly<{ code: string; byteOffset: number | null }>;
}>;

/*
 * Playwright runs under a real Node process, where a JSON module import needs
 * an import attribute; reading the reviewed fixtures directly keeps the spec
 * portable and keeps the bytes exactly the ones the unit suites use.
 */
function readFixtureCases(fileName: string): readonly unknown[] {
  const raw = readFileSync(
    join(process.cwd(), "tests", "fixtures", "midi-import", fileName),
    "utf8",
  );
  const parsed = JSON.parse(raw) as Readonly<{ cases: readonly unknown[] }>;
  return parsed.cases;
}

const GOLDEN_CASES = readFixtureCases(
  "golden-cases.json",
) as readonly GoldenCase[];
const REFUSAL_CASES = readFixtureCases(
  "refusal-cases.json",
) as readonly RefusalCase[];

function fixtureBytes(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function requireGolden(id: string): GoldenCase {
  const found = GOLDEN_CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing golden ${id}`);
  return found;
}

function requireRefusal(id: string): RefusalCase {
  const found = REFUSAL_CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing refusal ${id}`);
  return found;
}

async function chooseFile(
  page: Page,
  name: string,
  bytes: Buffer,
): Promise<void> {
  await page.getByTestId("midi-import-file").setInputFiles({
    name,
    mimeType: "audio/midi",
    buffer: bytes,
  });
}

test.describe("M0 MIDI import over the real artifact", () => {
  test("M0-E2E-001 a golden file previews per-sonority candidates before anything is committed", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await chooseFile(
      page,
      "two-chords.mid",
      fixtureBytes(requireGolden("M0-GLD-002").bytesHex),
    );

    /* The automatic result card states the whole gesture up front. */
    await expect(page.getByTestId("midi-import-auto")).toBeVisible();
    await expect(
      page.getByTestId("midi-import-groove-evidence"),
    ).not.toBeEmpty();
    /* Nothing has entered the document yet: the preview is a statement. */
    await expect(cards(page)).toHaveCount(0);

    /* The forensic detail lives behind Advanced, collapsed by default. */
    await page.getByTestId("midi-import-advanced-summary").click();
    await expect(page.getByTestId("midi-import-summary")).toBeVisible();

    const sonorities = page.getByTestId("midi-import-sonority");
    await expect(sonorities).toHaveCount(2);
    await expect(sonorities.nth(0)).toContainText("C");
    await expect(sonorities.nth(1)).toContainText("Dm7");
    /* The m7/6 duality must be shown, not silently collapsed to one reading. */
    await expect(sonorities.nth(1)).toContainText("F6/D");
    await expect(page.getByTestId("midi-import-chart-text")).toContainText(
      "| C:1 Dm7:3 |",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("M0-E2E-002 committing states its undo count and exactly that many presses restore the chart", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await chooseFile(
      page,
      "two-chords.mid",
      fixtureBytes(requireGolden("M0-GLD-002").bytesHex),
    );
    await expect(page.getByTestId("midi-import-auto")).toBeVisible();

    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0)).toContainText("C");
    await expect(cards(page).nth(1)).toContainText("Dm7");

    /*
     * The M1 envelope states its exact undo cost in the status line
     * ("…was added as N edits. Press Undo N times…" or "…as one edit.").
     * The law under test: the STATED count is the TRUE count.
     */
    const status = await page
      .getByTestId("midi-import-status")
      .first()
      .textContent();
    const match = /as (?:one|(\d+)) edit/.exec(status ?? "");
    expect(match).not.toBeNull();
    const statedCount =
      match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);
    const undo = page.locator("#studio-undo");
    for (let press = 0; press < statedCount; press += 1) {
      await expect(undo).toBeEnabled();
      await undo.click();
    }
    await expect(cards(page)).toHaveCount(0);
    await expect(undo).toBeDisabled();
    expectCleanDiagnostics(diagnostics);
  });

  test("M0-E2E-003 an unnameable sonority is stated literally, never invented", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await chooseFile(
      page,
      "cluster.mid",
      fixtureBytes(requireGolden("M0-GLD-005").bytesHex),
    );

    await page.getByTestId("midi-import-advanced-summary").click();
    await expect(page.getByTestId("midi-import-custom")).toBeVisible();
    await expect(page.getByTestId("midi-import-custom")).toContainText("Db");
    await expect(page.getByTestId("midi-import-custom")).toContainText("Gb");
    await expect(page.getByTestId("midi-import-blocked")).toBeVisible();
    await expect(
      page.locator("#studio-midi-import-commit-rail"),
    ).toBeDisabled();
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("M0-E2E-004 a hostile file refuses with its frozen code and byte offset", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const hostile = requireRefusal("M0-REF-007");
    await chooseFile(
      page,
      "format-two.mid",
      fixtureBytes(hostile.bytesHex ?? ""),
    );

    const refusal = page.getByTestId("midi-import-refusal");
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(hostile.expected.code);
    await expect(refusal).toContainText(
      `byte ${String(hostile.expected.byteOffset)}`,
    );
    await expect(page.getByTestId("midi-import-summary")).toHaveCount(0);
    await expect(
      page.locator("#studio-midi-import-commit-rail"),
    ).toBeDisabled();
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("M0-E2E-005 the import surface fits a 320px viewport without horizontal scroll", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await page.setViewportSize({ width: 320, height: 720 });
    await openStudio(page);

    /* At phone widths the library lives in a sheet, so the surface is there. */
    await page.locator("#studio-open-library-sheet").click();
    await expect(page.getByTestId("midi-import-sheet")).toBeVisible();

    await page.getByTestId("midi-import-file").setInputFiles({
      name: "two-chords.mid",
      mimeType: "audio/midi",
      buffer: fixtureBytes(requireGolden("M0-GLD-002").bytesHex),
    });
    await expect(
      page.getByTestId("midi-import-sheet").getByTestId("midi-import-auto"),
    ).toBeVisible();
    await page
      .getByTestId("midi-import-sheet")
      .getByTestId("midi-import-advanced-summary")
      .click();
    await expect(
      page.getByTestId("midi-import-sheet").getByTestId("midi-import-summary"),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    /* The duplicate-id law (jcpe-ph6d, f287b7e) holds with the sheet open. */
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const element of document.querySelectorAll("[id]")) {
        const id = element.id;
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      return [...seen.entries()]
        .filter(([, count]) => count > 1)
        .map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
    expectCleanDiagnostics(diagnostics);
  });
});

test("the import panel is visible in the rail without scrolling", async ({
  page,
}) => {
  /*
   * jcpe-osxq: the shipped panel originally rendered after the full
   * quick-entry section (~3.9k px deep in a ~750 px rail viewport) and
   * users reported the feature as nonexistent. Reachable-by-autoscroll
   * is not visible: the law is that the panel's box starts inside the
   * rail's own visible height with the rail unscrolled.
   */
  await page.setViewportSize({ height: 900, width: 1440 });
  await openStudio(page);
  const geometry = await page.evaluate(() => {
    const rail = document.querySelector("#library-rail");
    const panel = document.querySelector('[data-testid="midi-import-rail"]');
    if (!(rail instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      return null;
    }
    const railBox = rail.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    return {
      panelTop: panelBox.top,
      railTop: railBox.top,
      railVisibleBottom: railBox.top + rail.clientHeight,
    };
  });
  expect(geometry).not.toBeNull();
  if (geometry === null) return;
  expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.railTop);
  expect(geometry.panelTop).toBeLessThan(geometry.railVisibleBottom);
});
