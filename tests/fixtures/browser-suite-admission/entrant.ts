// Real process and browser fixture. No production music or fake browser adapter.
import { access, watch } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { acquireBrowserSuite } from "../../../scripts/browser-suite-admission";

const [portText, mode, root, releasePath] = process.argv.slice(2);
if (!releasePath) throw new Error("Missing independent release signal");
const waitForRelease = (): Promise<void> => new Promise((done, fail) => {
  const check = () => access(releasePath, error => {
    if (error === null) { watcher.close(); done(); }
    else if (error.code !== "ENOENT") { watcher.close(); fail(error); }
  });
  const watcher = watch(dirname(releasePath), check);
  check();
});
const lines = createInterface({ input: process.stdin });
const commands = lines[Symbol.asyncIterator]();
const emit = (event: string, extra: Record<string, unknown> = {}) => {
  process.stdout.write(`${JSON.stringify({ event, pid: process.pid, parentPid: process.ppid, ...extra })}\n`);
};
emit("ready");
await commands.next();
try {
  const lease = await acquireBrowserSuite(Number(portText));
  emit("admitted", { port: lease.port });
  if (mode === "error") throw new Error("independent deliberate fixture failure");
  if (mode === "browser") {
    if (!root) throw new Error("Missing repository root");
    const require = createRequire(`${root}/package.json`);
    // The fixture runs under Node; Playwright itself is the installed real package.
    const { chromium } = require("playwright") as {
      chromium: { launch(): Promise<{
        newPage(options: { userAgent: string }): Promise<{
          goto(url: string): Promise<unknown>; title(): Promise<string>;
        }>;
        close(): Promise<void>;
      }>; };
    };
    const browser = await chromium.launch();
    const page = await browser.newPage({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
    await page.goto("data:text/html,<title>Real admission fixture</title>");
    emit("browser", { title: await page.title() });
    await waitForRelease();
    await browser.close();
  } else {
    await waitForRelease();
  }
  await lease.release();
  emit("released");
} catch (error) {
  emit("refused", { message: String(error) });
  process.exitCode = mode === "error" ? 7 : 2;
} finally {
  lines.close();
}
