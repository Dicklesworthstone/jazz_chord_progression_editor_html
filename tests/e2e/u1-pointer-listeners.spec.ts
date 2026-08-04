import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cards,
  captureDiagnostics,
  chordIds,
  expectCleanDiagnostics,
  focusCard,
  installListenerProbe,
  listenerCounts,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Declared evidence owner for `U1-TRACE-POINTER` in
 * `tests/fixtures/editing/trace-ledger.json`.
 *
 * The reviewed pointer policy is exact: an 8 CSS-pixel threshold decides
 * whether a gesture is a tap or a drag, `preventDefault` is called only after
 * that threshold so taps and page scrolling survive, capture is released on
 * cancel and on unmount, and listener counts are component-scoped and constant.
 * Every assertion below drives the real generated artifact through real pointer
 * events; none of it inspects component internals.
 */

/**
 * The reviewed numbers come from the fixture packet, not from a literal here.
 *
 * Reading them makes this browser proof mutation-sensitive: `U1-MUT-021`
 * changes the drag threshold and `U1-MUT-024` changes the per-card listener
 * budget, and a copy of those numbers in this file would let the production
 * surface keep passing against a packet that no longer says what it says.
 */
const CONTRACT = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/editing/u1-editing-contract.json"),
    "utf8",
  ),
) as Readonly<{
  limits: Readonly<Record<string, number>>;
  pointerPolicy: Readonly<Record<string, unknown>>;
}>;

const INTERACTION = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/editing/interaction-state-matrix.json"),
    "utf8",
  ),
) as Readonly<{ listenerPolicy: Readonly<Record<string, number | boolean>> }>;

const DRAG_THRESHOLD_CSS_PX = Number(
  CONTRACT.pointerPolicy["dragThresholdCssPx"],
);
const TRANSIENT_DRAG_LISTENERS = Number(
  INTERACTION.listenerPolicy["transientDragListenersPerSession"],
);
const MAX_CONCURRENT_DRAG_SESSIONS = Number(
  INTERACTION.listenerPolicy["maxConcurrentDragSessions"],
);

type MoveRecord = Readonly<{ defaultPrevented: boolean }>;

/**
 * Record whether the surface called `preventDefault` on each `pointermove`.
 *
 * This is the mechanism the contract names, so it is what gets measured: a
 * move whose default is prevented cannot scroll the page, and a move whose
 * default survives can. Listening at the document in the bubble phase sees the
 * flag exactly as the browser's scrolling logic would.
 */
async function recordPointerMoves(page: Page): Promise<void> {
  await page.evaluate(() => {
    const records: { defaultPrevented: boolean }[] = [];
    document.addEventListener(
      "pointermove",
      (event) => {
        records.push({ defaultPrevented: event.defaultPrevented });
      },
      { capture: false },
    );
    Object.defineProperty(window, "__pointerMoves", { value: records });
  });
}

async function pointerMoves(page: Page): Promise<readonly MoveRecord[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __pointerMoves: MoveRecord[] }).__pointerMoves,
  );
}

async function handleBox(page: Page, index: number) {
  const handle = cards(page).nth(index).getByTestId("chord-drag-handle");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (box === null) throw new Error("U1_E2E_NO_HANDLE_BOX");
  return { handle, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Author `bars` complete measures the way a user does: append an empty measure,
 * aim quick entry at it through its own visible control, then publish. A draft
 * only fits an empty measure, so re-aiming is the product's real path rather
 * than a shortcut around it.
 */
async function seedBars(page: Page, bars: number, text: string): Promise<void> {
  await typeAndInsert(page, text);
  for (let bar = 1; bar < bars; bar += 1) {
    const appended = page.locator('[id^="studio-append-measure-"]').first();
    await appended.click();
    const target = page
      .locator('[id^="studio-target-measure-"]')
      .filter({ hasNotText: "Quick entry aims here" })
      .last();
    await target.click();
    await typeAndInsert(page, text);
  }
}

test.describe("U1-TRACE-POINTER drag is optional and threshold-gated", () => {
  test("U1-OPC-057 a release after 7 CSS pixels stays a tap", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");
    const before = await chordIds(page);
    expect(before).toHaveLength(2);

    const { x, y } = await handleBox(page, 0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + DRAG_THRESHOLD_CSS_PX - 1, y);
    // Below the threshold no drag session is visible on the card.
    await expect(cards(page).nth(0).getByTestId("chord-drag-handle")).toHaveAttribute("data-dragging", "false");
    await page.mouse.up();

    // Nothing was published: the chart is byte-identical and no refusal shown.
    expect(await chordIds(page)).toEqual(before);
    await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-017 a movement of exactly 8 CSS pixels starts the drag", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");

    const { x, y } = await handleBox(page, 0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + DRAG_THRESHOLD_CSS_PX, y);
    await expect(cards(page).nth(0).getByTestId("chord-drag-handle")).toHaveAttribute("data-dragging", "true");
    await page.mouse.up();
    await expect(cards(page).nth(0).getByTestId("chord-drag-handle")).toHaveAttribute("data-dragging", "false");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-018 preventDefault waits for the threshold so scrolling survives", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");
    await recordPointerMoves(page);

    const { x, y } = await handleBox(page, 0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Two sub-threshold moves, then one that crosses it.
    await page.mouse.move(x, y + 3);
    await page.mouse.move(x, y + 6);
    const belowThreshold = await pointerMoves(page);
    expect(belowThreshold.length).toBeGreaterThanOrEqual(2);
    // A vertical touch that has not yet become a drag must remain scrollable.
    expect(belowThreshold.every((record) => !record.defaultPrevented)).toBe(
      true,
    );

    await page.mouse.move(x, y + 6 + DRAG_THRESHOLD_CSS_PX);
    const all = await pointerMoves(page);
    const last = all[all.length - 1];
    expect(last?.defaultPrevented).toBe(true);
    await page.mouse.up();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-056 losing pointer capture cancels the drag and publishes nothing", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");
    const before = await chordIds(page);

    const { handle, x, y } = await handleBox(page, 0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24, y);
    await expect(cards(page).nth(0).getByTestId("chord-drag-handle")).toHaveAttribute("data-dragging", "true");

    // The browser takes the capture away, exactly as it does when a system
    // gesture or a context menu interrupts a drag.
    await handle.dispatchEvent("pointercancel");
    await expect(cards(page).nth(0).getByTestId("chord-drag-handle")).toHaveAttribute("data-dragging", "false");
    await page.mouse.up();

    expect(await chordIds(page)).toEqual(before);
    await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-020 a card unmounted mid-drag releases its session", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await installListenerProbe(page);
    await openStudio(page);
    await seedBars(page, 2, "| Dm9:2 G13:2 |");
    expect(await chordIds(page)).toHaveLength(4);

    // The drag is opened with dispatched pointer events rather than the mouse,
    // so the mouse stays free to press Undo while the session is still live —
    // which is exactly the scenario: an out-of-band command unmounts the card
    // a drag is holding.
    const dragged = cards(page).nth(3).getByTestId("chord-drag-handle");
    const box = await dragged.boundingBox();
    if (box === null) throw new Error("U1_E2E_NO_HANDLE_BOX");
    const originX = box.x + box.width / 2;
    const originY = box.y + box.height / 2;
    await dragged.dispatchEvent("pointerdown", {
      clientX: originX,
      clientY: originY,
      isPrimary: true,
      pointerId: 7,
      pointerType: "mouse",
    });
    await dragged.dispatchEvent("pointermove", {
      clientX: originX + 24,
      clientY: originY,
      isPrimary: true,
      pointerId: 7,
      pointerType: "mouse",
    });
    await expect(dragged).toHaveAttribute("data-dragging", "true");

    await page.locator("#studio-undo").click();
    await expect(cards(page)).toHaveCount(2);

    // No transient drag listener survives on a node the document still holds.
    const counts = await listenerCounts(page, "#chart-workspace");
    expect(counts["pointermove"] ?? 0).toBe(0);
    expect(counts["pointercancel"] ?? 0).toBe(0);

    // And the surface is not wedged: a fresh drag still starts.
    const next = await handleBox(page, 0);
    await page.mouse.move(next.x, next.y);
    await page.mouse.down();
    await page.mouse.move(next.x + 24, next.y);
    await expect(cards(page).nth(0).getByTestId("chord-drag-handle")).toHaveAttribute("data-dragging", "true");
    await page.mouse.up();
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("U1-TRACE-POINTER listener counts stay constant", () => {
  test("U1-INT-025 one drag session adds at most three transient listeners", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await installListenerProbe(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");

    const idle = await listenerCounts(page, "#chart-workspace");
    const { x, y } = await handleBox(page, 0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24, y);
    await expect(cards(page).nth(0).getByTestId("chord-drag-handle")).toHaveAttribute("data-dragging", "true");

    const dragging = await listenerCounts(page, "#chart-workspace");
    const added = Object.keys(dragging).reduce(
      (total, type) => total + (dragging[type] ?? 0) - (idle[type] ?? 0),
      0,
    );
    // Exactly the number the policy declares: pointermove, pointerup, pointercancel.
    expect(added).toBe(TRANSIENT_DRAG_LISTENERS);
    expect((dragging["pointermove"] ?? 0) - (idle["pointermove"] ?? 0)).toBe(1);
    expect((dragging["pointerup"] ?? 0) - (idle["pointerup"] ?? 0)).toBe(1);
    expect((dragging["pointercancel"] ?? 0) - (idle["pointercancel"] ?? 0)).toBe(
      1,
    );

    // At most the declared number of concurrent sessions: moving onto another
    // handle while this one is live opens nothing new.
    expect(MAX_CONCURRENT_DRAG_SESSIONS).toBe(1);
    const second = await handleBox(page, 1);
    await page.mouse.move(second.x, second.y);
    const stillOne = await listenerCounts(page, "#chart-workspace");
    expect(stillOne["pointermove"] ?? 0).toBe(dragging["pointermove"] ?? 0);

    await page.mouse.up();
    const settled = await listenerCounts(page, "#chart-workspace");
    expect(settled["pointermove"] ?? 0).toBe(idle["pointermove"] ?? 0);
    expect(settled["pointerup"] ?? 0).toBe(idle["pointerup"] ?? 0);
    expect(settled["pointercancel"] ?? 0).toBe(idle["pointercancel"] ?? 0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-023 ten reorders of twenty cards do not multiply listeners", async ({
    page,
  }) => {
    test.slow();
    const diagnostics = captureDiagnostics(page);
    await installListenerProbe(page);
    await openStudio(page);
    await seedBars(page, 5, "| Dm9:1 G13:1 C6:1 A7:1 |");
    await expect(cards(page)).toHaveCount(20);

    const identitiesBefore = [...(await chordIds(page))].sort();
    // Per-card totals are the measurement the legacy failure calls for:
    // L-TOUCH-01 was listeners multiplying on cards that survived a re-render,
    // so the budget is counted inside each surviving card rather than over the
    // whole region, whose transient dialogs and notices come and go legitimately.
    const cardTotals = async (): Promise<readonly number[]> => {
      const ids = await chordIds(page);
      const totals: number[] = [];
      for (const id of ids) {
        const counts = await listenerCounts(page, `[data-chord-id="${id}"]`);
        totals.push(
          Object.values(counts).reduce((sum, value) => sum + value, 0),
        );
      }
      return totals;
    };
    const before = await cardTotals();
    expect(before).toHaveLength(20);
    const perCard = before[0];
    expect(perCard).toBeGreaterThan(0);
    expect(before.every((total) => total === perCard)).toBe(true);

    // Ten move commands over the same twenty cards, each through the declared
    // keyboard binding rather than a drag.
    for (let move = 0; move < 10; move += 1) {
      await focusCard(page, 4);
      await page.keyboard.press("Enter");
      await page.keyboard.press(
        move % 2 === 0 ? "Alt+ArrowRight" : "Alt+ArrowLeft",
      );
    }

    await expect(cards(page)).toHaveCount(20);
    const after = await cardTotals();
    expect(after).toEqual(before);
    // Reordering preserves identity: the same twenty stable ids remain.
    expect([...(await chordIds(page))].sort()).toEqual(identitiesBefore);
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("U1-TRACE-FOCUS editors take the caret and give the card back", () => {
  /**
   * Found by running WebKit for the first time. `autoFocus` on a dynamically
   * inserted input is not portable: Chromium and Firefox ignored it, so F2
   * opened an editor the caret never entered and every keystroke went to the
   * card underneath; WebKit honoured it and then dropped focus to the document
   * body when the input unmounted, so every key after a cancelled edit went
   * nowhere at all. Both halves are asserted here, in all three engines, so
   * neither can regress to its own old behaviour.
   */
  test("U1-INT-011 F2 focuses the editor and Escape returns the tab stop", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    await focusCard(page, 1);
    const cardId = (await chordIds(page))[1];
    if (cardId === undefined) throw new Error("U1_E2E_NO_CHORD");

    await page.keyboard.press("F2");
    await expect(page.getByTestId("inline-symbol-editor")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("inline-symbol-editor")).toHaveCount(0);
    await expect(cards(page).nth(1)).toBeFocused();
    await expect(cards(page).nth(1)).toHaveAttribute("data-chord-id", cardId);
    // Exactly one tab stop survives the round trip.
    await expect(page.locator('.studio-chord-card[tabindex="0"]')).toHaveCount(
      1,
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-011 a command never leaves focus on the document body", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    await focusCard(page, 1);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Alt+ArrowRight");

    // The A0 focus request is rendered before the browser is free to deliver
    // the next key, so the keystroke a user makes immediately after a command
    // still reaches a chart control.
    const active = await page.evaluate(
      () => document.activeElement?.tagName ?? "null",
    );
    expect(active).not.toBe("BODY");
    await page.keyboard.press("Delete");
    // jcpe-yvni: the Delete key acts immediately — the card count dropping is
    // the proof the keystroke reached a chart control, and no dialog
    // interrogates the user for the routine reason.
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByTestId("incomplete-reason-field")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("U1-TRACE-POINTER authoring never requires a pointer", () => {
  test("U1-INT-021 a whole edit session runs on the keyboard alone", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    // Quick entry: type and publish with Enter, never clicking Insert.
    const field = page
      .getByTestId("quick-entry-field")
      .filter({ visible: true })
      .first();
    await field.focus();
    await field.fill("| Dm9:1 G13:1 C6:1 A7:1 |");
    // Wait for the surface to have classified the draft before publishing it.
    // Pressing Enter into an unclassified draft is a race, not a keyboard
    // proof: the Insert control becoming enabled is the observable signal that
    // the plan is committable, and it is the same signal a user waits for.
    await expect(
      page.locator("#studio-quick-entry-insert").filter({ visible: true }).first(),
    ).toBeEnabled();
    await page.keyboard.press("Enter");
    await expect(cards(page)).toHaveCount(4);
    const authored = await chordIds(page);

    // Select, extend, duplicate, move, and delete — all through the declared
    // chord-card bindings, with no pointer event of any kind.
    await focusCard(page, 1);
    await page.keyboard.press("Enter");
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("chart-selection-status")).toContainText("2");

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chart-selection-status")).toContainText("1");
    await page.keyboard.press("Alt+ArrowRight");
    await expect
      .poll(async () => (await chordIds(page)).join(","))
      .not.toBe(authored.join(","));

    // The card's own menu opens from the keyboard too, so an operation with no
    // key of its own is still reachable without a pointer. The move above
    // re-rendered the cards, so the tab stop is re-established first — engines
    // restore focus after a re-render on their own schedule, and this test is
    // about reachability, not about that timing (U1-INT-011 owns it).
    await focusCard(page, 1);
    await page.keyboard.press("Shift+F10");
    await expect(page.getByTestId("chord-card-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("chord-card-menu")).toHaveCount(0);
    // Each key waits for the surface to settle before the next one is sent.
    // A keystroke delivered into a half-applied state is dropped, and a
    // dropped keystroke is a flake rather than a finding.
    await expect(cards(page).nth(1)).toBeFocused();

    // F2 opens the inline symbol editor; Escape restores the exact prior text.
    await page.keyboard.press("F2");
    await expect(page.getByTestId("inline-symbol-editor")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("inline-symbol-editor")).toHaveCount(0);
    await expect(cards(page).nth(1)).toBeFocused();
    await expect(page.getByTestId("chart-selection-status")).toContainText("1");

    await page.keyboard.press("Delete");
    // jcpe-yvni: the routine delete lands at once with its auto-declared
    // reason; no dialog interrupts the keyboard session.
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByTestId("incomplete-reason-field")).toHaveCount(0);

    // The deliberate declaration path stays keyboard-reachable: the card
    // menu's "Declare this measure's completion" opens U1-CMP-019, and the
    // typed custom reason replaces the auto-declared one.
    await focusCard(page, 0);
    await page.keyboard.press("Shift+F10");
    await expect(page.getByTestId("chord-card-menu")).toBeVisible();
    // Tab enters the menu's first item; End reaches its last item, which is
    // the declaration; Enter activates it.
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const reason = page.getByTestId("incomplete-reason-field");
    await expect(reason).toBeVisible();
    await reason.fill("Removed by the keyboard-only proof");
    const confirm = page.locator("#studio-confirm-incomplete");
    await expect(confirm).toBeEnabled();
    await confirm.press("Enter");
    await expect(reason).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
    expectCleanDiagnostics(diagnostics);
  });
});
