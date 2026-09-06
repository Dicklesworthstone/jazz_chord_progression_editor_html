import type { Page } from "@playwright/test";
import { encodeShareFragment } from "../../src/application/studio-share";

/** A real explicit session conflict selects A1-START-004 without corrupting
 * recovery or relying on the old bug that seeded a demo before every probe. */
export async function reopenWithConflictingChart(page: Page, artifact: string): Promise<void> {
  const encoded = encodeShareFragment({ title: "Explicit current chart", chartText: "| Cmaj7:4/1 |",
    tempoBpm: 132, grooveStyleId: "straight-eighths@1" });
  if (!encoded.ok) throw new Error(encoded.message);
  await page.goto(`${artifact}${encoded.value}`);
  // A fragment-only navigation does not recreate the application.
  await page.reload({ waitUntil: "load" });
}
