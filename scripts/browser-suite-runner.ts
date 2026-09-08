import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { acquireBrowserSuite } from "./browser-suite-admission";

// Compiled by Bun, executed by supported real Node. Import the CLI in THIS
// process so its lifetime owns admission even if the outer Bun wrapper is reaped.
if (process.versions.bun !== undefined) throw new Error("BROWSER_SUITE_NODE: use a real supported Node runtime");
const [entrypoint, ...args] = process.argv.slice(2);
if (!entrypoint) throw new Error("BROWSER_SUITE_ENTRYPOINT: missing tool");
await acquireBrowserSuite();
const target = resolve(entrypoint);
process.argv = [process.execPath, target, ...args];
await import(pathToFileURL(target).href);
