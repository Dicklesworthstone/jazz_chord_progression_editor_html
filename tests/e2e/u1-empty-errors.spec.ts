import { expect, test } from "@playwright/test";

import {
  activateMenuItem,
  cards,
  captureDiagnostics,
  chordIds,
  declareIncompleteMeasure,
  expectCleanDiagnostics,
  focusCard,
  openCardMenu,
  openStudio,
  showTeachingView,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * The reviewed empty, error, and cancellation interaction states.
 *
 * Each one is about what the surface *says*: an empty chart names its next
 * action, a token error keeps its own source text and code, a measure states
 * its exact beats or its stored reason, and a cancelled edit restores the exact
 * prior value while publishing nothing. All of it is asserted against the real
 * generated artifact.
 */

test.describe("U1-TRACE-QUICKENTRY empty and error states name themselves", () => {
  test("U1-INT-042 an empty chart states its next action", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await expect(cards(page)).toHaveCount(0);

    // The bar is visibly empty and says what to do about it.
    const empty = page.locator(".studio-measure__empty-copy");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Empty measure");
    await expect(empty).toContainText("Type chart text");

    // A named insertion target exists as a real control, not a hover reveal.
    const target = page.locator('[id^="studio-target-measure-"]').first();
    await expect(target).toBeVisible();
    await expect(target).toHaveAccessibleName(/Quick entry aims here|Aim quick entry at measure/u);

    // And quick entry itself is operable from the empty state.
    const field = page
      .getByTestId("quick-entry-field")
      .filter({ visible: true })
      .first();
    await expect(field).toBeEnabled();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-043 each token error keeps its own source text and code", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    const field = page
      .getByTestId("quick-entry-field")
      .filter({ visible: true })
      .first();
    await field.fill("Dm9:1 §§§:1 G13:2");

    const rows = page.getByTestId("quick-entry-token");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // The two chords T0 recovered keep their own exact draft slices, and the
    // one token it could not parse is its own row.
    const invalid = rows.filter({ has: page.getByTestId("quick-entry-token-range") });
    await expect(invalid).toHaveCount(1);
    await expect(invalid.first()).toContainText("§");

    // That row carries T0's own code and T0's own range — both verbatim.
    // jcpe-xzjo: the code is now small secondary text beside its prose.
    const code = await invalid
      .first()
      .locator(".studio-quick-entry__token-code")
      .innerText();
    expect(code).toContain(".");
    await expect(invalid.first().getByTestId("quick-entry-token-range")).toContainText(
      /characters \d+–\d+/u,
    );

    // The recovered chords are separate rows with their own source text.
    const texts = await rows.allInnerTexts();
    expect(texts.join("\n")).toContain("Dm9:1");
    expect(texts.join("\n")).toContain("G13:2");
    // The field still holds exactly what was typed.
    await expect(field).toHaveValue("Dm9:1 §§§:1 G13:2");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-045 an empty selection states its requirement instead of going inert", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");

    // Nothing selected yet.
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      /no chord|nothing/iu,
    );
    // Every selection-scoped control must exist and be visibly unavailable —
    // a missing control would silently satisfy a "disabled" assertion.
    for (const id of [
      "#studio-move-previous",
      "#studio-move-next",
      "#studio-delete-selection",
      "#studio-duplicate-selection",
    ]) {
      const control = page.locator(id);
      await expect(control).toHaveCount(1);
      await expect(control).toBeDisabled();
    }

    // Selecting one chord makes exactly those actions available.
    await focusCard(page, 0);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chart-selection-status")).toContainText("1");
    await expect(page.locator("#studio-move-next")).toBeEnabled();
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("U1-TRACE-INLINE measures state exact beats and stored reasons", () => {
  test("U1-INT-046 an overfilling duration states the exact arithmetic", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");
    const before = await chordIds(page);

    await focusCard(page, 0);
    await page.keyboard.press("Alt+T");
    const editor = page.getByTestId("duration-editor");
    await expect(editor).toBeVisible();
    await editor.fill("5");
    await editor.press("Enter");

    const refusal = page.getByTestId("chart-edit-refusal");
    await expect(refusal).toBeVisible();
    await expect(refusal).toHaveAttribute(
      "data-code",
      "u1.duration_overfills_measure",
    );
    // Exact rationals: what the bar holds, what it would hold, and its capacity.
    await expect(refusal).toContainText("4/1");
    await expect(refusal).toContainText("7/1");
    // Nothing was published.
    expect(await chordIds(page)).toEqual(before);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-047 a short measure shows the stored reason with the measure", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    await focusCard(page, 3);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Delete");
    // jcpe-yvni: the routine delete lands at once, auto-declared with the
    // reviewed constant. The default (compact) view marks the short bar
    // with a VISIBLE badge carrying the stored reason verbatim.
    await expect(page.getByTestId("incomplete-reason-field")).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
    const badge = page.getByTestId("measure-completion-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("title", "Shortened by delete");

    // The deliberate card-menu path still stores a typed reason, replacing
    // the constant verbatim and shown with the measure's teaching facts.
    const reasonText = "Pickup bar into the head";
    await openCardMenu(page, 0);
    await activateMenuItem(page, "Declare this measure's completion");
    await declareIncompleteMeasure(page, reasonText);
    await expect(badge).toHaveAttribute("title", reasonText);
    await showTeachingView(page);
    await expect(page.locator(".studio-measure__facts")).toContainText(
      reasonText,
    );
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("U1-TRACE-INLINE cancellation restores the exact prior value", () => {
  test("U1-INT-048 Escape on a dirty symbol draft restores the exact prior text", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");
    const before = await chordIds(page);
    const symbolBefore = await cards(page)
      .nth(0)
      .locator(".studio-chord-card__symbol")
      .innerText();

    await focusCard(page, 0);
    await page.keyboard.press("F2");
    const editor = page.getByTestId("inline-symbol-editor");
    await expect(editor).toBeVisible();
    await editor.fill("Ebmaj7#11");
    await editor.press("Escape");

    await expect(editor).toHaveCount(0);
    await expect(
      cards(page).nth(0).locator(".studio-chord-card__symbol"),
    ).toHaveText(symbolBefore);
    // Nothing was dispatched: identities and the chart are unchanged.
    expect(await chordIds(page)).toEqual(before);
    await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-049 Cancel in the completion dialog dispatches nothing", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    // jcpe-yvni: routine deletes no longer open the dialog, so the dialog
    // under test is reached through the deliberate declaration path on the
    // bar the delete left short.
    await focusCard(page, 3);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Delete");
    await expect(cards(page)).toHaveCount(3);
    const before = await chordIds(page);

    await openCardMenu(page, 0);
    await activateMenuItem(page, "Declare this measure's completion");
    const reason = page.getByTestId("incomplete-reason-field");
    await expect(reason).toBeVisible();
    await reason.fill("A reason typed and then abandoned");

    await page.locator("#studio-abandon-pending-edit").click();
    await expect(reason).toHaveCount(0);

    // The chart is exactly where it was; the stored auto-declared reason is
    // untouched by the abandoned draft.
    expect(await chordIds(page)).toEqual(before);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByTestId("measure-completion-badge")).toHaveAttribute(
      "title",
      "Shortened by delete",
    );
    await expect(page.locator(".studio-measure__facts")).not.toContainText(
      "abandoned",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("jcpe-disi.2 the x handle is findable without hover and deletes in one step", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    // Dim-ghost law: the handle cluster is visible at rest in the editing
    // view — no hover required to learn the card is editable.
    const deleteHandle = cards(page).nth(3).getByTestId("chord-card-delete");
    const restOpacity = await deleteHandle.evaluate(
      (element) => Number(getComputedStyle(element).opacity),
    );
    expect(restOpacity).toBeGreaterThanOrEqual(0.4);

    // One activation, one undoable command, the landed auto-declare policy.
    await deleteHandle.click();
    await expect(page.getByTestId("incomplete-reason-field")).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
    const badge = page.getByTestId("measure-completion-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("title", "Shortened by delete");

    // One Undo restores the chord — the x never costs a second step.
    await page.locator("#studio-undo").click();
    await expect(cards(page)).toHaveCount(4);
    expectCleanDiagnostics(diagnostics);
  });
});
