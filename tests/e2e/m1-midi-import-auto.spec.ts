import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  cards,
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
  typeAndInsert,
  type PageDiagnostics,
} from "./u1-chart-kit";

/**
 * M1 automatic MIDI import over the real generated artifact (jcpe-qbvz).
 *
 * The default path under test: choose a file → the automatic result card
 * states bars/chords, the groove choice WITH its evidence sentence, and the
 * settings that will change → Add lands the whole gesture with a stated undo
 * count that is provably true → the matched groove is the document's groove.
 *
 * LOGGING: every test writes a JSON ledger under test-results/m1/ carrying
 * the full step timeline, console/page errors (zero tolerance), the card
 * copy, document-state digests around undo/redo, and the undo accounting,
 * so a red run is a complete forensic record. The ledger is also attached
 * to the Playwright report via testInfo.
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
  await page.getByTestId("midi-import-file").first().setInputFiles({
    name,
    mimeType: "audio/midi",
    buffer: Buffer.from(bytesHex, "hex"),
  });
}

/**
 * A deterministic digest of the visible document state: chord identities in
 * visual order plus each card's rendered text. Undo/redo round trips are
 * asserted by digest equality, not by count alone.
 */
async function documentDigest(page: Page): Promise<string> {
  const state = await page.evaluate(() =>
    [...document.querySelectorAll(".studio-chord-card")].map((card) => ({
      id: card.getAttribute("data-chord-id"),
      text: card.textContent,
    })),
  );
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

/** The checked groove radio's accessible name, or null. */
async function checkedGroove(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const picker = document.querySelector("#studio-groove-picker-rail");
    if (picker === null) return null;
    const checked = picker.querySelector('[role="radio"][aria-checked="true"]');
    if (checked === null) return null;
    return checked.textContent.trim();
  });
}

test.describe("M1 automatic import: the one-gesture default path", () => {
  test("M1-E2E-001 choose → card with groove evidence → Add → settings land → stated undo count is true and redo restores", async ({
    page,
  }, testInfo) => {
    const ledger = makeLedger("m1-e2e-001-one-gesture", testInfo);
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      ledger.log("open", { title: await page.title() });

      const tempoBefore = await page
        .locator("#studio-tempo-input-rail")
        .inputValue();
      const grooveBefore = await checkedGroove(page);
      const digestBefore = await documentDigest(page);
      ledger.log("before", { tempoBefore, grooveBefore, digestBefore });

      await chooseFile(
        page,
        "session-take.mid",
        requireGolden("M0-GLD-002").bytesHex,
      );
      const auto = page.getByTestId("midi-import-auto");
      await expect(auto).toBeVisible();
      const cardText = await auto.textContent();
      const grooveEvidence = await page
        .getByTestId("midi-import-groove-evidence")
        .textContent();
      ledger.log("card", { cardText, grooveEvidence });
      expect((grooveEvidence ?? "").trim()).not.toBe("");
      /* The card must speak user language: no raw codes, no schema ids. */
      expect(cardText ?? "").not.toMatch(/changes\.import\.|M0-TPL|\{[a-z]+\}/i);
      /* Nothing has entered the document yet: the preview is a statement. */
      await expect(cards(page)).toHaveCount(0);

      await page.locator("#studio-midi-import-commit-rail").click();
      await expect(cards(page).first()).toBeVisible();
      const committedCount = await cards(page).count();
      const digestAfterCommit = await documentDigest(page);
      const status = await page
        .getByTestId("midi-import-status")
        .first()
        .textContent();
      ledger.log("committed", { status, committedCount, digestAfterCommit });

      /*
       * The stated-count law: the status line states its exact undo cost
       * ("…was added as one edit." or "…as N edits. Press Undo N times…"),
       * and the STATED count is the TRUE count.
       */
      const match = /as (?:one|(\d+)) edit/.exec(status ?? "");
      expect(match).not.toBeNull();
      const statedCount =
        match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);
      ledger.log("stated-count", { statedCount });

      /*
       * Settings landed on the empty destination: the tempo input shows the
       * file's tempo fact from the card, and the matched groove is now the
       * document's groove (the card's evidence sentence justified it).
       */
      const tempoAfter = await page
        .locator("#studio-tempo-input-rail")
        .inputValue();
      const grooveAfter = await checkedGroove(page);
      ledger.log("settings-after", { tempoAfter, grooveAfter });
      expect(cardText ?? "").toContain(`${tempoAfter} BPM from the file`);
      expect(grooveAfter).not.toBeNull();

      const undo = page.locator("#studio-undo");
      for (let press = 0; press < statedCount; press += 1) {
        await expect(undo).toBeEnabled();
        await undo.click();
        ledger.log("undo", { press: press + 1 });
      }
      await expect(cards(page)).toHaveCount(0);
      await expect(undo).toBeDisabled();
      const digestAfterUndo = await documentDigest(page);
      expect(digestAfterUndo).toBe(digestBefore);
      /* Undo returned the pre-import groove too — the gesture was whole. */
      expect(await checkedGroove(page)).toBe(grooveBefore);

      /* Redo replays the whole gesture to the exact committed state. */
      const redo = page.locator("#studio-redo");
      for (let press = 0; press < statedCount; press += 1) {
        await expect(redo).toBeEnabled();
        await redo.click();
      }
      await expect(cards(page)).toHaveCount(committedCount);
      const digestAfterRedo = await documentDigest(page);
      ledger.log("round-trip", {
        digestBefore,
        digestAfterCommit,
        digestAfterUndo,
        digestAfterRedo,
      });
      expect(digestAfterRedo).toBe(digestAfterCommit);
      expect(await checkedGroove(page)).toBe(grooveAfter);

      expectCleanDiagnostics(diagnostics);
      await ledger.flush("passed", diagnostics);
    } catch (error) {
      await ledger.flush("failed", diagnostics);
      throw error;
    }
  });

  test("M1-E2E-002 no dead ends: a file that writes nothing states why, keeps Advanced and Discard live", async ({
    page,
  }, testInfo) => {
    const ledger = makeLedger("m1-e2e-002-no-dead-ends", testInfo);
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      /* A cluster file that writes nothing must still explain itself. */
      await chooseFile(page, "cluster.mid", requireGolden("M0-GLD-005").bytesHex);
      const blocked = page.getByTestId("midi-import-blocked");
      await expect(blocked).toBeVisible();
      const blockedText = (await blocked.textContent()) ?? "";
      ledger.log("blocked", { blockedText });
      /* The statement carries substance, not a shrug. */
      expect(blockedText.length).toBeGreaterThan(20);
      await expect(
        page.locator("#studio-midi-import-commit-rail"),
      ).toBeDisabled();
      /* Advanced still shows every literal pitch set: a next action. */
      await page
        .getByTestId("midi-import-advanced-summary")
        .click();
      await expect(page.getByTestId("midi-import-custom").first()).toBeVisible();
      const customNote = await page
        .getByTestId("midi-import-custom")
        .first()
        .textContent();
      ledger.log("custom", { customNote });
      /* Discard is always available: the surface never wedges. */
      const discard = page.locator("#studio-midi-import-discard-rail");
      await expect(discard).toBeEnabled();
      await discard.click();
      await expect(page.getByTestId("midi-import-status").first()).toContainText(
        "No file chosen.",
      );
      expectCleanDiagnostics(diagnostics);
      await ledger.flush("passed", diagnostics);
    } catch (error) {
      await ledger.flush("failed", diagnostics);
      throw error;
    }
  });

  test("M1-E2E-003 an occupied chart keeps its tempo and chosen groove, and undo returns exactly the pre-import chart", async ({
    page,
  }, testInfo) => {
    const ledger = makeLedger("m1-e2e-003-occupied-chart", testInfo);
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);

      /*
       * Occupy the destination the way a user does: an explicit groove
       * choice and a typed chord. The M1-XFER law says an occupied chart
       * keeps its tempo/meter/key/title, and a groove the user chose
       * personally is never overridden by the file's match.
       */
      const picker = page.locator("#studio-groove-picker-rail");
      await picker.scrollIntoViewIfNeeded();
      await picker.getByRole("radio", { name: "Bossa nova" }).click();
      await expect(
        picker.getByRole("radio", { name: "Bossa nova" }),
      ).toHaveAttribute("aria-checked", "true");
      await typeAndInsert(page, "| Cmaj7 |");
      await expect(cards(page)).toHaveCount(1);
      const tempoBefore = await page
        .locator("#studio-tempo-input-rail")
        .inputValue();
      const digestBefore = await documentDigest(page);
      const countBefore = await cards(page).count();
      ledger.log("occupied", { tempoBefore, digestBefore, countBefore });

      await chooseFile(
        page,
        "second-take.mid",
        requireGolden("M0-GLD-002").bytesHex,
      );
      await expect(page.getByTestId("midi-import-auto")).toBeVisible();
      await page.locator("#studio-midi-import-commit-rail").click();
      await expect
        .poll(async () => cards(page).count())
        .toBeGreaterThan(countBefore);

      const status = await page
        .getByTestId("midi-import-status")
        .first()
        .textContent();
      const match = /as (?:one|(\d+)) edit/.exec(status ?? "");
      expect(match).not.toBeNull();
      const statedCount =
        match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);
      ledger.log("committed", { status, statedCount });

      /* Kept-settings law: tempo untouched, the chosen groove untouched. */
      expect(
        await page.locator("#studio-tempo-input-rail").inputValue(),
      ).toBe(tempoBefore);
      await expect(
        picker.getByRole("radio", { name: "Bossa nova" }),
      ).toHaveAttribute("aria-checked", "true");

      /* The stated count returns exactly the pre-import chart. */
      const undo = page.locator("#studio-undo");
      for (let press = 0; press < statedCount; press += 1) {
        await expect(undo).toBeEnabled();
        await undo.click();
      }
      await expect(cards(page)).toHaveCount(countBefore);
      expect(await documentDigest(page)).toBe(digestBefore);
      ledger.log("restored", { countBefore });
      expectCleanDiagnostics(diagnostics);
      await ledger.flush("passed", diagnostics);
    } catch (error) {
      await ledger.flush("failed", diagnostics);
      throw error;
    }
  });
});
