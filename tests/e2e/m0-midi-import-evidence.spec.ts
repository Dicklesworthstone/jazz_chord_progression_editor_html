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
 * M0 wasm-boundary evidence for bead jcpe-v3c2.3, in three real engines.
 *
 * The build leaf's own spec (`m0-midi-import.spec.ts`) drives the surface with
 * the SPEC PACKET's fixtures. This one is the independent proof: every byte
 * here comes from `tests/fixtures/m0-verify/authored-corpus.json`, a corpus
 * produced OUTSIDE this repository's writer — format 0, multi-channel running
 * status, mid-track tempo and meter changes, velocity-zero note-offs, alien
 * chunks — and every hostile expectation is an offset known by construction
 * rather than one observed from production.
 *
 * What the browser has to prove that a headless process cannot: that the
 * embedded WebAssembly decoder instantiates and decodes inside Chromium,
 * Firefox, and WebKit under the artifact's own hash-based CSP, reached through
 * the artifact's own `<input type="file">` with real bytes, with the preview,
 * the one-undo commit, and the honest refusal all rendered from that decode.
 */

type AcceptedCase = Readonly<{
  id: string;
  title: string;
  traits: readonly string[];
  bytesHex: string;
}>;

type HostileCase = Readonly<{
  id: string;
  title: string;
  bytesHex?: string;
  expected: Readonly<{
    code: string;
    byteOffset: number | null;
    trackIndex: number | null;
  }>;
}>;

type AuthoredCorpus = Readonly<{
  acceptedFiles: readonly AcceptedCase[];
  hostileFiles: readonly HostileCase[];
}>;

/*
 * Playwright runs under a real Node process, where a JSON module import needs
 * an import attribute; reading the reviewed corpus directly keeps the spec
 * portable and keeps the bytes exactly the ones the evidence gate sweeps.
 */
const CORPUS = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests", "fixtures", "m0-verify", "authored-corpus.json"),
    "utf8",
  ),
) as AuthoredCorpus;

function requireAccepted(id: string): AcceptedCase {
  const found = CORPUS.acceptedFiles.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing authored file ${id}`);
  return found;
}

function requireHostile(id: string): HostileCase {
  const found = CORPUS.hostileFiles.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing hostile file ${id}`);
  return found;
}

async function chooseFile(
  page: Page,
  name: string,
  hex: string,
): Promise<void> {
  await page.getByTestId("midi-import-file").setInputFiles({
    name,
    mimeType: "audio/midi",
    buffer: Buffer.from(hex, "hex"),
  });
}

test.describe("M0 wasm boundary over the real artifact, independent corpus", () => {
  test("M0-VER-B01 a format-0 file with running status and velocity-zero offs previews its sonorities", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const authored = requireAccepted("M0-VER-A01");
    expect(authored.traits).toContain("format-0");
    expect(authored.traits).toContain("velocity-zero-note-off");
    await chooseFile(page, "authored-format-0.mid", authored.bytesHex);

    await expect(page.getByTestId("midi-import-auto")).toBeVisible();
    /* The preview is a statement: nothing has entered the document yet. */
    await expect(cards(page)).toHaveCount(0);

    await page.getByTestId("midi-import-advanced-summary").click();
    await expect(page.getByTestId("midi-import-summary")).toBeVisible();
    const sonorities = page.getByTestId("midi-import-sonority");
    await expect(sonorities).toHaveCount(2);
    await expect(sonorities.nth(0)).toContainText("C");
    await expect(sonorities.nth(1)).toContainText("Dm7");
    /* The m7 / 6 duality is shown rather than silently collapsed. */
    await expect(sonorities.nth(1)).toContainText("F6/D");
    expectCleanDiagnostics(diagnostics);
  });

  test("M0-VER-B02 committing an authored file states its undo count truthfully", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await chooseFile(
      page,
      "authored-format-0.mid",
      requireAccepted("M0-VER-A01").bytesHex,
    );
    await expect(page.getByTestId("midi-import-auto")).toBeVisible();

    await page.locator("#studio-midi-import-commit-rail").click();
    await expect(cards(page)).toHaveCount(2);

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

  test("M0-VER-B03 a mid-track tempo and meter change survives the browser decode", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const authored = requireAccepted("M0-VER-A02");
    expect(authored.traits).toContain("mid-track-tempo");
    expect(authored.traits).toContain("mid-track-meter");
    await chooseFile(page, "authored-tempo-change.mid", authored.bytesHex);

    await expect(page.getByTestId("midi-import-auto")).toBeVisible();
    await page.getByTestId("midi-import-advanced-summary").click();
    await expect(page.getByTestId("midi-import-summary")).toBeVisible();
    const sonorities = page.getByTestId("midi-import-sonority");
    await expect(sonorities).toHaveCount(2);
    await expect(sonorities.nth(0)).toContainText("Dm");
    await expect(sonorities.nth(1)).toContainText("G");
    expectCleanDiagnostics(diagnostics);
  });

  test("M0-VER-B04 an unnameable cluster is stated literally and blocks the commit", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await chooseFile(
      page,
      "authored-cluster.mid",
      requireAccepted("M0-VER-A04").bytesHex,
    );

    await page.getByTestId("midi-import-advanced-summary").click();
    const custom = page.getByTestId("midi-import-custom");
    await expect(custom).toBeVisible();
    await expect(custom).toContainText("Db");
    await expect(page.getByTestId("midi-import-blocked")).toBeVisible();
    await expect(
      page.locator("#studio-midi-import-commit-rail"),
    ).toBeDisabled();
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("M0-VER-B05 a hostile file refuses in the browser with its frozen code and constructed offset", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    /* Two data bytes where a note-on's key belongs: an in-track event fault. */
    const hostile = requireHostile("M0-VER-H21");
    expect(hostile.expected.code).toBe("smf.event_invalid");
    await chooseFile(page, "authored-hostile.mid", hostile.bytesHex ?? "");

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

  test("M0-VER-B06 a truncated header refuses without the decoder ever trapping", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const hostile = requireHostile("M0-VER-H04");
    expect(hostile.expected.code).toBe("smf.header_invalid");
    await chooseFile(page, "authored-short.mid", hostile.bytesHex ?? "");

    const refusal = page.getByTestId("midi-import-refusal");
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(hostile.expected.code);

    /* The surface stays usable: a good file after a bad one still previews. */
    await chooseFile(
      page,
      "authored-format-0.mid",
      requireAccepted("M0-VER-A01").bytesHex,
    );
    await expect(page.getByTestId("midi-import-auto")).toBeVisible();
    await expect(page.getByTestId("midi-import-refusal")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });
});
