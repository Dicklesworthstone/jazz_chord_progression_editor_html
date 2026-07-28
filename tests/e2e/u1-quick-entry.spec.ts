import { expect, test } from "@playwright/test";

import {
  cards,
  declareIncompleteMeasure,
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Declared evidence owner for `U1-TRACE-QUICKENTRY`.
 *
 * The trace requires that the raw draft stays caller-owned and exact, that
 * token status comes from one T0 parse, and that the insertion plan is stated
 * before anything is published. Every assertion runs against the real
 * generated artifact.
 */
test.describe("U1-TRACE-QUICKENTRY quick entry over the real artifact", () => {
  test("U1-QE publishing a complete draft yields real chord cards", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByTestId("quick-entry-status")).toContainText(
      "No draft",
    );

    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:2");
    await expect(page.getByTestId("quick-entry-status")).toContainText(
      "Draft parses",
    );

    await page.locator("#studio-quick-entry-insert").click();

    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0)).toContainText("Dm9");
    await expect(cards(page).nth(1)).toContainText("G13");
    await expect(cards(page).nth(0)).toContainText("2/1 beats");
    await expect(page.getByTestId("quick-entry-field")).toHaveValue("");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-002 an invalid draft keeps its source text exactly", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await page.getByTestId("quick-entry-field").fill("H7");
    await expect(page.getByTestId("quick-entry-status")).toContainText(
      "Draft has parse errors",
    );
    await expect(page.getByTestId("quick-entry-issues")).toBeVisible();
    await expect(page.locator("#studio-quick-entry-insert")).toBeDisabled();
    // The exact typed text survives; nothing is repaired or guessed.
    await expect(page.getByTestId("quick-entry-field")).toHaveValue("H7");
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-002 a mixed draft is never partially applied", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    // The first token parses and the second does not. Applying "the valid
    // parts" is not an operation, so the whole draft must stay unpublished.
    await page.getByTestId("quick-entry-field").fill("Dm9:2 H7:2");
    await expect(page.locator("#studio-quick-entry-insert")).toBeDisabled();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByTestId("quick-entry-field")).toHaveValue("Dm9:2 H7:2");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-005 the whole preview applies as one undoable command", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Cmaj9:4");
    await expect(cards(page)).toHaveCount(1);

    await page.locator("#studio-undo").click();
    await expect(cards(page)).toHaveCount(0);

    await page.locator("#studio-redo").click();
    await expect(cards(page)).toHaveCount(1);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-003 Clear empties the draft without publishing", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:2");
    await page.locator("#studio-quick-entry-clear").click();
    await expect(page.getByTestId("quick-entry-field")).toHaveValue("");
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-004 an overfilling draft states overfill-requires-split", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");
    await expect(cards(page)).toHaveCount(2);

    // Aim explicitly at the bar that is now exactly full, then offer it a
    // second complete bar. The plan says so before anything is published.
    const measureId = await page
      .locator(".studio-measure")
      .first()
      .getAttribute("data-measure-id");
    await page.locator(`#studio-target-measure-${measureId ?? ""}`).click();
    await page.getByTestId("quick-entry-field").fill("Cmaj9:4");
    const plan = page.getByTestId("insertion-plan");
    await expect(plan).toHaveAttribute("data-statement", "overfill-requires-split");
    await expect(plan).toContainText("Does not fit the chosen destination");
    await expect(plan).toContainText("Shorten the draft");
    await expect(page.locator("#studio-quick-entry-insert")).toBeDisabled();
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByTestId("quick-entry-field")).toHaveValue("Cmaj9:4");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-004 the plan states exactly one statement per draft", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    const plan = page.getByTestId("insertion-plan");

    // Empty draft.
    await expect(plan).toHaveAttribute("data-statement", "no-draft");
    await expect(page.locator("#studio-quick-entry-insert")).toBeDisabled();

    // A complete bar into the empty target measure.
    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:2");
    await expect(plan).toHaveAttribute("data-statement", "fits-measure");
    await expect(plan).toContainText("Fills the target measure exactly");
    await expect(page.locator("#studio-quick-entry-insert")).toBeEnabled();

    // A short bar cannot be committed without an explicit decision.
    await page.getByTestId("quick-entry-field").fill("Dm9:2");
    await expect(plan).toHaveAttribute(
      "data-statement",
      "incomplete-requires-confirmation",
    );
    await expect(plan).toContainText("Complete the final measure");
    await expect(page.locator("#studio-quick-entry-insert")).toBeDisabled();

    // An unparsable draft cannot be inserted atomically at all.
    await page.getByTestId("quick-entry-field").fill("H7");
    await expect(plan).toHaveAttribute("data-statement", "not-atomic-refusal");
    await expect(page.locator("#studio-quick-entry-insert")).toBeDisabled();

    // Nothing above published anything.
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-003 a refused draft lists recoverable rows and no parsed rows", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:2");
    const tokens = page.getByTestId("quick-entry-token");
    await expect(tokens).toHaveCount(2);
    await expect(tokens.nth(0)).toHaveAttribute("data-state", "valid");

    // The second token cannot be read at all; T0 still recovers the first.
    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:1 X");
    await expect(tokens.filter({ has: page.locator("code") })).toHaveCount(3);
    await expect(
      page.locator('[data-testid="quick-entry-token"][data-state="valid"]'),
    ).toHaveCount(0);
    const insertable = page.locator(
      '[data-testid="quick-entry-token"][data-state="insertable"]',
    );
    await expect(insertable).toHaveCount(2);
    // The exact source slice is shown, never a repaired guess.
    await expect(insertable.nth(0)).toContainText("Dm9:2");
    await expect(insertable.nth(1)).toContainText("G13:1");
    await expect(
      page.locator('[data-testid="quick-entry-token"][data-state="invalid"]'),
    ).toContainText("symbol.root_invalid");
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-006 recovering one chord requires the stated acknowledgement", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:1 X");
    const lane = page.getByTestId("quick-entry-recovery");
    await expect(lane).toBeVisible();
    await expect(lane).toContainText(
      "source-bar-and-section-layout-will-be-lost@1",
    );

    // Until the loss is accepted, the only control that could publish is off.
    const insert = page.locator("#studio-recover-chord-0");
    await expect(insert).toBeDisabled();
    await page.locator("#studio-quick-entry-acknowledge").check();
    await expect(insert).toBeEnabled();

    // A short bar is still an explicit decision: the measure-completion
    // dialog asks for a reason instead of the chord arriving silently.
    await insert.click();
    await expect(cards(page)).toHaveCount(0);
    const refusal = page.getByTestId("chart-edit-refusal");
    await expect(refusal).toHaveAttribute(
      "data-code",
      "u1.completion_reason_required",
    );
    await declareIncompleteMeasure(
      page,
      "Recovered one chord from a refused draft",
    );

    // Exactly one chord arrived; the rest of the refused draft did not.
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).nth(0)).toContainText("Dm9");
    await expect(cards(page).nth(0)).toContainText("2/1 beats");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-EDIT-006 a chord T0 could not measure needs an exact duration", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    // The trailing chord is published with `chart.layout_invalid`, so its
    // duration is the caller's to state exactly.
    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:2 | Cmaj7");
    await page.locator("#studio-quick-entry-acknowledge").check();
    const insert = page.locator("#studio-recover-chord-2");
    await expect(insert).toBeEnabled();

    await insert.click();
    await expect(page.getByTestId("quick-entry-refusal")).toContainText(
      "exact positive beat value",
    );
    await expect(cards(page)).toHaveCount(0);

    await page.getByTestId("recovery-duration-field").fill("4");
    await insert.click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).nth(0)).toContainText("Cmaj7");
    await expect(cards(page).nth(0)).toContainText("4/1 beats");
    expectCleanDiagnostics(diagnostics);
  });

  test("jcpe-8idn the chord palette appends draft text through the typed path only", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const field = page.getByTestId("quick-entry-field");
    const palette = page.getByTestId("chord-palette");
    await expect(palette).toBeVisible();

    // The default root is C; a quality chip appends the full symbol.
    await page.locator("#studio-palette-quality-m7").click();
    await expect(field).toHaveValue("Cm7 ");

    // Switching roots changes only what the next chip appends.
    await page.locator("#studio-palette-root-g").click();
    await expect(palette).toHaveAttribute(
      "aria-label",
      "Chord palette, root G",
    );
    await page.locator("#studio-palette-quality-dom7").click();
    await expect(field).toHaveValue("Cm7 G7 ");

    // Sharped and slash-free symbols parse ready straight off the chips.
    await page.locator("#studio-palette-root-f-sharp").click();
    await page.locator("#studio-palette-quality-maj7-sharp11").click();
    await expect(field).toHaveValue("Cm7 G7 F#maj7#11 ");
    await expect(page.getByTestId("quick-entry-status")).toContainText(
      "Draft parses",
    );

    // The palette publishes nothing: only the existing Insert commits.
    await expect(cards(page)).toHaveCount(0);
    await page
      .locator("#studio-quick-entry-insert")
      .filter({ visible: true })
      .first()
      .click();
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(2)).toContainText("F#maj7#11");
    expectCleanDiagnostics(diagnostics);
  });
});
