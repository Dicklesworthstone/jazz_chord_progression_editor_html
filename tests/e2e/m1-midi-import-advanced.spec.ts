import AxeBuilder from "@axe-core/playwright";
import { midiGridFixture } from "../support/midi-grid-fixture";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
  type PageDiagnostics,
} from "./u1-chart-kit";

/**
 * M1 Advanced disclosure over the real generated artifact (jcpe-qbvz).
 *
 * The shipped Advanced surface is the forensic disclosure: the decode
 * summary, the exact chart text one press of Add writes, and every sonority
 * with its chosen reading, its evidence, its ranked alternatives, and the
 * literal pitch sets nothing could name. These specs pin that surface, its
 * rail/sheet dual-context consistency, the 320 px layout, and the
 * accessibility contract of the new controls.
 *
 * The interactive Advanced overrides the M1 build bead described (per-track
 * include/exclude, alternative-reading pickers, groove override, audition)
 * did not ship in jcpe-upbz; their e2e coverage is tracked on the follow-up
 * bead recorded in jcpe-qbvz's notes, not silently faked here.
 */

type GoldenCase = Readonly<{ id: string; bytesHex: string }>;

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

function requireGolden(id: string): GoldenCase {
  const found = GOLDEN_CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing golden ${id}`);
  return found;
}

type LedgerEntry = Readonly<{ at: number; step: string; detail: unknown }>;

function makeLedger(testName: string, testInfo: TestInfo) {
  const entries: LedgerEntry[] = [];
  const started = Date.now();
  return {
    log(step: string, detail: unknown): void {
      entries.push(Object.freeze({ at: Date.now() - started, step, detail }));
    },
    async flush(
      status: "passed" | "failed",
      diagnostics: PageDiagnostics,
    ): Promise<void> {
      const dir = join(process.cwd(), "test-results", "m1");
      mkdirSync(dir, { recursive: true });
      const payload = `${JSON.stringify(
        {
          schema: "jcpe.m1.e2e-ledger.v1",
          testName,
          project: testInfo.project.name,
          status,
          consoleErrors: diagnostics.consoleErrors,
          pageErrors: diagnostics.pageErrors,
          entries,
        },
        null,
        2,
      )}\n`;
      writeFileSync(
        join(dir, `${testName}.${testInfo.project.name}.json`),
        payload,
      );
      await testInfo.attach(`${testName}-ledger`, {
        body: payload,
        contentType: "application/json",
      });
    },
  };
}

async function chooseFile(
  page: Page,
  name: string,
  bytesHex: string,
): Promise<void> {
  await page
    .getByTestId("midi-import-file")
    .filter({ visible: true })
    .first()
    .setInputFiles({
      name,
      mimeType: "audio/midi",
      buffer: Buffer.from(bytesHex, "hex"),
    });
}

test.describe("M1 Advanced disclosure", () => {
  test("M1-ADV-001 collapsed by default; open shows the decode facts, the exact chart text, and every reading with its evidence", async ({
    page,
  }, testInfo) => {
    const ledger = makeLedger("m1-adv-001-forensics", testInfo);
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await chooseFile(
        page,
        "two-chords.mid",
        requireGolden("M0-GLD-002").bytesHex,
      );
      await expect(page.getByTestId("midi-import-auto")).toBeVisible();

      /* Progressive disclosure: the forensic detail starts collapsed. */
      const advanced = page.getByTestId("midi-import-advanced");
      await expect(advanced).toBeVisible();
      expect(await advanced.evaluate((node) => node.hasAttribute("open"))).toBe(
        false,
      );
      await expect(page.getByTestId("midi-import-summary")).not.toBeVisible();

      await page.getByTestId("midi-import-advanced-summary").click();
      await expect(page.getByTestId("midi-import-summary")).toBeVisible();
      const chartText =
        (await page.getByTestId("midi-import-chart-text").textContent()) ?? "";
      ledger.log("chart-text", { chartText });
      /* The chart text is the real T0 line an insert writes. */
      expect(chartText).toMatch(/\|.+\|/);

      const sonorities = page.getByTestId("midi-import-sonority");
      const count = await sonorities.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const row = sonorities.nth(index);
        const where = await row
          .locator(".studio-midi-import__sonority-where")
          .textContent();
        const evidence = await row
          .locator(".studio-midi-import__sonority-evidence")
          .textContent();
        ledger.log("sonority", { index, where, evidence });
        /* Every row states where it was heard and why it reads as it does. */
        expect(where ?? "").toMatch(/Bar \d+/);
        expect((evidence ?? "").trim()).not.toBe("");
      }
      /* The m7/6 duality must be shown, not collapsed to one reading. */
      await expect(
        page.getByTestId("midi-import-alternatives").first(),
      ).toContainText("Also reads as:");

      /*
       * The M1-TRACE ledger (jcpe-qyyn): Advanced carries the full
       * machine-readable trace — nine frozen stages with input digests —
       * and this spec dumps it into the per-test ledger so a failure
       * carries the complete forensic record.
       */
      const traceDetails = page.getByTestId("midi-import-trace");
      await expect(traceDetails).toBeVisible();
      await traceDetails.locator("summary").click();
      const traceText = await traceDetails.locator("pre").textContent();
      const trace = JSON.parse(traceText ?? "null") as {
        schema: string;
        records: readonly { stage: string; inputDigest: string }[];
      } | null;
      ledger.log("import-trace", trace);
      expect(trace?.schema).toBe("changes.import.automation-trace.v1");
      expect(trace?.records.map((record) => record.stage)).toEqual([
        "decode",
        "salvage",
        "classify",
        "segment",
        "infer-key",
        "resolve",
        "groove",
        "plan",
        "envelope",
      ]);
      for (const record of trace?.records ?? []) {
        expect(record.inputDigest).toMatch(/^[0-9a-f]{16}$/u);
      }
      expectCleanDiagnostics(diagnostics);
      await ledger.flush("passed", diagnostics);
    } catch (error) {
      await ledger.flush("failed", diagnostics);
      throw error;
    }
  });

  test("M1-ADV-002 rail and sheet render the same pending import: one preview, two consistent contexts", async ({
    page,
  }, testInfo) => {
    const ledger = makeLedger("m1-adv-002-dual-context", testInfo);
    const diagnostics = captureDiagnostics(page);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openStudio(page);
      await chooseFile(
        page,
        "two-chords.mid",
        requireGolden("M0-GLD-002").bytesHex,
      );
      const rail = page.getByTestId("midi-import-rail");
      await expect(rail.getByTestId("midi-import-auto")).toBeVisible();
      const railHeadline = await rail
        .getByTestId("midi-import-auto")
        .locator(".studio-midi-import__fact-value")
        .first()
        .textContent();
      await rail.getByTestId("midi-import-advanced-summary").click();
      const railChart = await rail
        .getByTestId("midi-import-chart-text")
        .textContent();
      ledger.log("rail", { railHeadline, railChart });

      /*
       * Shrink to the phone shell: the library moves into a sheet that
       * renders a SECOND copy of the panel (jcpe-ph6d/jcpe-ddq7). The same
       * pending preview must appear there, byte-identical in substance —
       * one import, two contexts, no divergent state.
       */
      await page.setViewportSize({ width: 320, height: 720 });
      await page.locator("#studio-open-library-sheet").click();
      const sheet = page.getByTestId("midi-import-sheet");
      await expect(sheet.getByTestId("midi-import-auto")).toBeVisible();
      const sheetHeadline = await sheet
        .getByTestId("midi-import-auto")
        .locator(".studio-midi-import__fact-value")
        .first()
        .textContent();
      await sheet.getByTestId("midi-import-advanced-summary").click();
      const sheetChart = await sheet
        .getByTestId("midi-import-chart-text")
        .textContent();
      ledger.log("sheet", { sheetHeadline, sheetChart });

      expect(sheetHeadline).toBe(railHeadline);
      expect(sheetChart).toBe(railChart);
      expectCleanDiagnostics(diagnostics);
      await ledger.flush("passed", diagnostics);
    } catch (error) {
      await ledger.flush("failed", diagnostics);
      throw error;
    }
  });

  test("M1-ADV-003 the auto card and open Advanced fit a 320px viewport with no horizontal scroll and no duplicate ids", async ({
    page,
  }, testInfo) => {
    const ledger = makeLedger("m1-adv-003-320px", testInfo);
    const diagnostics = captureDiagnostics(page);
    try {
      await page.setViewportSize({ width: 320, height: 720 });
      await openStudio(page);
      await page.locator("#studio-open-library-sheet").click();
      const sheet = page.getByTestId("midi-import-sheet");
      await expect(sheet).toBeVisible();
      await chooseFile(
        page,
        "two-chords.mid",
        requireGolden("M0-GLD-002").bytesHex,
      );
      await expect(sheet.getByTestId("midi-import-auto")).toBeVisible();
      await sheet.getByTestId("midi-import-advanced-summary").click();
      await expect(sheet.getByTestId("midi-import-summary")).toBeVisible();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      ledger.log("overflow", { overflow });
      expect(overflow).toBeLessThanOrEqual(0);

      /* The duplicate-id law holds with both panel copies mounted. */
      const duplicates = await page.evaluate(() => {
        const seen = new Map<string, number>();
        for (const element of document.querySelectorAll("[id]")) {
          seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
        }
        return [...seen.entries()]
          .filter(([, count]) => count > 1)
          .map(([id]) => id);
      });
      ledger.log("duplicates", { duplicates });
      expect(duplicates).toEqual([]);
      expectCleanDiagnostics(diagnostics);
      await ledger.flush("passed", diagnostics);
    } catch (error) {
      await ledger.flush("failed", diagnostics);
      throw error;
    }
  });

  test("M1-ADV-004 the import controls carry their accessibility contract: names, live status, and zero axe violations", async ({
    page,
  }, testInfo) => {
    const ledger = makeLedger("m1-adv-004-a11y", testInfo);
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      const rail = page.getByTestId("midi-import-rail");

      /* The real file input is the labelled, describedby-wired control. */
      const field = rail.getByTestId("midi-import-file");
      const wiring = await field.evaluate((node) => {
        const describedBy = node.getAttribute("aria-describedby") ?? "";
        return {
          describedBy,
          describedByResolves: describedBy
            .split(/\s+/)
            .filter((token) => token.length > 0)
            .every((token) => document.getElementById(token) !== null),
          labelled:
            node.id.length > 0 &&
            document.querySelector(`label[for="${node.id}"]`) !== null,
        };
      });
      ledger.log("field-wiring", wiring);
      expect(wiring.labelled).toBe(true);
      expect(wiring.describedByResolves).toBe(true);

      /* The status region announces politely and atomically. */
      const status = rail.getByTestId("midi-import-status");
      await expect(status).toHaveAttribute("role", "status");
      await expect(status).toHaveAttribute("aria-live", "polite");
      await expect(status).toHaveAttribute("aria-atomic", "true");

      /* With a pending import, both decisions are named buttons. */
      await chooseFile(
        page,
        "two-chords.mid",
        requireGolden("M0-GLD-002").bytesHex,
      );
      await expect(rail.getByTestId("midi-import-auto")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add to the chart" }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "Discard this import" }),
      ).toBeEnabled();

      /* Axe over the whole import section, card and Advanced open. */
      await rail.getByTestId("midi-import-advanced-summary").click();
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .include('[data-testid="midi-import-rail"]')
        .analyze();
      ledger.log("axe", {
        violations: axe.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.length,
        })),
      });
      expect(axe.violations).toEqual([]);
      expectCleanDiagnostics(diagnostics);
      await ledger.flush("passed", diagnostics);
    } catch (error) {
      await ledger.flush("failed", diagnostics);
      throw error;
    }
  });
});

test("M1-ADV-005 the Advanced overrides re-plan the pending import: picker changes one symbol, groove override wins, exclusion recovers", async ({
  page,
}, testInfo) => {
  const ledger = makeLedger("m1-adv-005-overrides", testInfo);
  const diagnostics = captureDiagnostics(page);
  try {
    await openStudio(page);
    await chooseFile(
      page,
      "two-chords.mid",
      requireGolden("M0-GLD-002").bytesHex,
    );
    await expect(page.getByTestId("midi-import-auto")).toBeVisible();
    await page.getByTestId("midi-import-advanced-summary").click();
    const chartText = page.getByTestId("midi-import-chart-text");
    await expect(chartText).toContainText("Dm7");
    const before = await chartText.textContent();
    ledger.log("before", { before });

    /* Alternative picker: choosing F6/D changes exactly that symbol. */
    const picker = page.getByTestId("midi-import-alternative-picker").first();
    await expect(picker).toBeVisible();
    await picker.selectOption({ label: "F6/D" });
    await expect(chartText).toContainText("F6/D");
    await expect(chartText).not.toContainText("Dm7");
    await expect(chartText).toContainText("C");
    ledger.log("alternative", { after: await chartText.textContent() });
    /* Choosing the automatic reading back restates the original text. */
    await picker.selectOption({ index: 0 });
    await expect(chartText).toContainText("Dm7");
    expect(await chartText.textContent()).toBe(before);

    /* Groove override wins over the match, with the frozen sentence. */
    await page
      .getByTestId("midi-import-groove-override")
      .selectOption("bossa-nova@1");
    await expect(page.getByTestId("midi-import-groove-evidence")).toHaveText(
      "You chose this groove yourself.",
    );
    ledger.log("groove", {});
    await page.getByTestId("midi-import-groove-override").selectOption("");
    await expect(
      page.getByTestId("midi-import-groove-evidence"),
    ).not.toHaveText("You chose this groove yourself.");

    /* Exclusion: unchecking the only track refuses honestly and recovers. */
    const include = page.getByTestId("midi-import-track-include").first();
    await include.uncheck();
    await expect(page.getByTestId("midi-import-auto")).toHaveCount(0);
    await expect(include).toBeVisible();
    await include.check();
    await expect(page.getByTestId("midi-import-auto")).toBeVisible();
    expect(await chartText.textContent()).toBe(before);
    ledger.log("exclusion-recovered", {});

    expectCleanDiagnostics(diagnostics);
    await ledger.flush("passed", diagnostics);
  } catch (error) {
    await ledger.flush("failed", diagnostics);
    throw error;
  }
});


test("M1-ADV-006 section names survive other overrides, clear, reset on file choice and land with Add", async ({ page }, testInfo) => {
  const ledger = makeLedger("m1-adv-006-section-names", testInfo);
  const diagnostics = captureDiagnostics(page);
  try {
    await openStudio(page);
    await chooseFile(page, "two-chords.mid", requireGolden("M0-GLD-002").bytesHex);
    await page.getByTestId("midi-import-advanced-summary").click();
    const name = page.getByTestId("midi-import-section-name-0");
    const chart = page.getByTestId("midi-import-chart-text");
    const original = await chart.textContent();
    await name.fill("Bridge 🎵");
    await name.press("Tab");
    await expect(chart).toContainText("[Bridge 🎵]");
    await page.getByTestId("midi-import-groove-override").selectOption("bossa-nova@1");
    await expect(name).toHaveValue("Bridge 🎵");
    const include = page.getByTestId("midi-import-track-include").first();
    await include.uncheck();
    await include.check();
    await expect(name).toHaveValue("Bridge 🎵");
    await name.fill("");
    await name.press("Tab");
    await expect(chart).toHaveText(original ?? "");
    await name.fill("New name");
    await name.press("Tab");
    await chooseFile(page, "another.mid", requireGolden("M0-GLD-002").bytesHex);
    await expect(name).toHaveValue("");
    await expect(page.getByTestId("midi-import-advanced")).not.toHaveAttribute("open");
    await page.getByTestId("midi-import-advanced-summary").click();
    await name.fill("Imported bridge");
    await name.press("Tab");
    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(page.getByTestId("section-name-field").filter({ visible: true }).last()).toHaveValue("Imported bridge");
    ledger.log("committed-name", { name: "Imported bridge" });
    const status = await page.getByTestId("midi-import-status").first().textContent();
    const count = /as (?:one|(\d+)) edit/.exec(status ?? "");
    expect(count).not.toBeNull();
    const undoCount = count?.[1] === undefined ? 1 : Number.parseInt(count[1], 10);
    for (let i = 0; i < undoCount; i += 1) await page.locator("#studio-undo").click();
    expect(await page.getByTestId("section-name-field").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).not.toContain("Imported bridge");
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
    await ledger.flush("passed", diagnostics);
  } catch (error) {
    await ledger.flush("failed", diagnostics);
    throw error;
  }
});


test("M1-ADV-007 grid refusal restores without rereading, retains names, resets and adds with Undo", async ({ page }, testInfo) => {
  const ledger = makeLedger("m1-adv-007-grid", testInfo);
  const diagnostics = captureDiagnostics(page);
  try {
    await openStudio(page);
    const bytes = Buffer.from(midiGridFixture()).toString("hex");
    await chooseFile(page, "Grid.mid", bytes);
    await page.getByTestId("midi-import-advanced-summary").click();
    const grid = page.getByTestId("midi-import-grid");
    const name = page.getByTestId("midi-import-section-name-0");
    const chart = page.getByTestId("midi-import-chart-text");
    await name.fill("Keep this name");
    await name.press("Tab");
    await expect(chart).toContainText("Keep this name");
    const named = await chart.textContent();
    await grid.selectOption("bar");
    await expect(page.getByTestId("midi-import-auto")).toHaveCount(0);
    await expect(grid).toBeVisible();
    await expect(grid).toHaveValue("bar");
    await grid.selectOption("quarter-bar");
    await expect(chart).toHaveText(named ?? "");
    await expect(name).toHaveValue("Keep this name");
    await grid.selectOption("half-bar");
    await expect(grid).toHaveValue("half-bar");
    await grid.selectOption("");
    await expect(chart).toHaveText(named ?? "");
    await chooseFile(page, "New grid.mid", bytes);
    await expect(grid).toHaveValue("");
    await expect(name).toHaveValue("");
    await page.getByTestId("midi-import-advanced-summary").click();
    await grid.selectOption("quarter-bar");
    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(4);
    const status = await page.getByTestId("midi-import-status").first().textContent();
    const match = /as (?:one|(\d+)) edit/.exec(status ?? "");
    expect(match).not.toBeNull();
    const count = match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);
    for (let index = 0; index < count; index += 1) await page.locator("#studio-undo").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    ledger.log("grid-add-and-undo", { count });
    expectCleanDiagnostics(diagnostics);
    await ledger.flush("passed", diagnostics);
  } catch (error) {
    await ledger.flush("failed", diagnostics);
    throw error;
  }
});


test("M1-ADV-008 destination persists through overrides, resets, and inserts before an existing section with Undo", async ({ page }, testInfo) => {
  const ledger = makeLedger("m1-adv-008-destination", testInfo);
  const diagnostics = captureDiagnostics(page);
  try {
    await openStudio(page);
    const cards = page.locator(".studio-chord-card");
    const bytes = Buffer.from(midiGridFixture()).toString("hex");
    await chooseFile(page, "Intro.mid", bytes);
    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(cards).toHaveCount(4);
    await chooseFile(page, "Outro.mid", bytes);
    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(cards).toHaveCount(8);
    const originalIds = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-chord-id")));
    await chooseFile(page, "Placed.mid", bytes);
    await page.getByTestId("midi-import-advanced-summary").click();
    const destination = page.getByTestId("midi-import-destination");
    const target = await destination.locator("option").filter({ hasText: "Outro" }).getAttribute("value");
    if (target === null) throw new Error("Missing independent Outro target");
    await destination.selectOption(target);
    await page.getByTestId("midi-import-grid").selectOption("quarter-bar");
    await expect(destination).toHaveValue(target);
    await chooseFile(page, "New placement.mid", bytes);
    await expect(destination).toHaveValue("");
    await page.getByTestId("midi-import-advanced-summary").click();
    await destination.selectOption(target);
    await page.locator("#studio-undo").click();
    await expect(cards).toHaveCount(4);
    await expect(destination.locator("option:checked")).toHaveText("Selected section no longer exists");
    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(page.getByTestId("midi-import-status").first()).toContainText("selected destination no longer exists");
    await expect(cards).toHaveCount(4);
    await page.locator("#studio-redo").click();
    await expect(cards).toHaveCount(8);
    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(cards).toHaveCount(12);
    const afterIds = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-chord-id")));
    expect(afterIds.slice(0, 4)).toEqual(originalIds.slice(0, 4));
    expect(afterIds.slice(8)).toEqual(originalIds.slice(4));
    expect(afterIds.slice(4, 8).some((id) => originalIds.includes(id))).toBe(false);
    const status = await page.getByTestId("midi-import-status").first().textContent();
    const match = /as (?:one|(\d+)) edit/.exec(status ?? "");
    expect(match).not.toBeNull();
    const count = match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);
    for (let index = 0; index < count; index += 1) await page.locator("#studio-undo").click();
    await expect(cards).toHaveCount(8);
    expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-chord-id")))).toEqual(originalIds);
    ledger.log("placement-add-and-undo", { target, count, originalIds, afterIds });
    expectCleanDiagnostics(diagnostics);
    await ledger.flush("passed", diagnostics);
  } catch (error) {
    await ledger.flush("failed", diagnostics);
    throw error;
  }
});
