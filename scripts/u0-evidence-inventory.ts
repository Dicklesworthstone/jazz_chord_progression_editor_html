import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

export type U0EvidenceInventoryFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type U0BrowserProject = "chromium" | "firefox" | "webkit";

export type U0EvidenceBinding = Readonly<{
  caseId: string;
  traceIds: readonly string[];
}>;

export type U0BunCaseIdentity = Readonly<{
  file: string;
  title: string;
}>;

export type U0PlaywrightIdentity = Readonly<{
  file: string;
  project: U0BrowserProject;
  title: string;
}>;

export type U0BrowserCellIdentity = Readonly<{
  bindings: readonly U0EvidenceBinding[];
  cellId: string;
  producer: Readonly<{
    file: string;
    title: string;
  }>;
  project: U0BrowserProject;
  screenshots: readonly string[];
}>;

export type U0EvidenceInventory = Readonly<{
  schema: "changes.ui.u0-evidence-inventory.v1";
  fixtureVersion: 1;
  expectedValuesGenerated: true;
  runtimeReportUsedAsOracle: false;
  productionOutputUsed: false;
  authorship: Readonly<{
    candidateEnumeration: "mechanical";
    independentlyReviewed: true;
    reviewBasis: readonly string[];
    runtimeReportsConsultedAsDraftingAid: true;
  }>;
  projects: readonly U0BrowserProject[];
  expectedCounts: Readonly<{
    browserCells: number;
    browserCellTemplates: number;
    bunCases: number;
    playwrightSpecifications: number;
    playwrightTests: number;
    reviewedSources: number;
    screenshots: number;
  }>;
  reviewedSources: readonly Readonly<{
    path: string;
    sha256: string;
  }>[];
  bunSuites: readonly Readonly<{
    file: string;
    titles: readonly string[];
  }>[];
  playwrightSuites: readonly Readonly<{
    file: string;
    titles: readonly string[];
  }>[];
  browserCells: readonly Readonly<{
    bindings: readonly U0EvidenceBinding[];
    cellId: string;
    producer: Readonly<{
      file: string;
      title: string;
    }>;
    screenshots: Readonly<Record<U0BrowserProject, readonly string[]>>;
  }>[];
}>;

export type U0EvidenceInventoryLoadResult = Readonly<{
  findings: readonly U0EvidenceInventoryFinding[];
  inventory: U0EvidenceInventory | null;
}>;

export const U0_EVIDENCE_INVENTORY_PATH =
  "tests/fixtures/u0-evidence/u0-evidence-inventory.json";

const PROJECTS = Object.freeze([
  "chromium",
  "firefox",
  "webkit",
] as const);

const ROOT_KEYS = Object.freeze([
  "authorship",
  "browserCells",
  "bunSuites",
  "expectedCounts",
  "expectedValuesGenerated",
  "fixtureVersion",
  "playwrightSuites",
  "productionOutputUsed",
  "projects",
  "reviewedSources",
  "runtimeReportUsedAsOracle",
  "schema",
]);

const REQUIRED_SUPPORT_SOURCES = Object.freeze([
  "playwright.config.ts",
  "tests/e2e/u0-browser-test-kit.ts",
  "tests/fixtures/ui/primitive-state-matrix.json",
  "tests/fixtures/ui/trace-ledger.json",
]);

function finding(
  code: string,
  path: string,
  message: string,
): U0EvidenceInventoryFinding {
  return Object.freeze({ code, path, message });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function exactKeys(value: JsonRecord, expected: readonly string[], path: string): void {
  const observed = Object.keys(value).sort(compare);
  const required = [...expected].sort(compare);
  if (JSON.stringify(observed) !== JSON.stringify(required)) {
    throw new Error(`${path} keys must be exactly ${required.join(", ")}`);
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a nonempty string`);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${path} must be a nonnegative safe integer`);
  }
  return value;
}

function strings(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of nonempty strings`);
  }
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) {
      throw new Error(`${path} must be an array of nonempty strings`);
    }
    output.push(item);
  }
  return Object.freeze(output);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSorted(values: readonly string[]): boolean {
  return JSON.stringify(values) === JSON.stringify([...values].sort(compare));
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function safeRepositoryPath(value: unknown, path: string): string {
  const candidate = string(value, path);
  if (
    isAbsolute(candidate) ||
    candidate.includes("\\") ||
    candidate.includes("\0") ||
    candidate.startsWith("./") ||
    candidate.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw new Error(`${path} must be a normalized repository-relative path`);
  }
  return candidate;
}

function sha256(value: unknown, path: string): string {
  const candidate = string(value, path);
  if (!/^[a-f0-9]{64}$/u.test(candidate)) {
    throw new Error(`${path} must be a lowercase SHA-256`);
  }
  return candidate;
}

function browserProject(value: unknown, path: string): U0BrowserProject {
  if (!PROJECTS.includes(value as U0BrowserProject)) {
    throw new Error(`${path} must be chromium, firefox, or webkit`);
  }
  return value as U0BrowserProject;
}

function binding(value: unknown, path: string): U0EvidenceBinding {
  const row = record(value, path);
  exactKeys(row, ["caseId", "traceIds"], path);
  const traceIds = strings(row["traceIds"], `${path}.traceIds`);
  if (traceIds.length === 0 || hasDuplicates(traceIds) || !isSorted(traceIds)) {
    throw new Error(`${path}.traceIds must be nonempty, unique, and sorted`);
  }
  return Object.freeze({
    caseId: string(row["caseId"], `${path}.caseId`),
    traceIds,
  });
}

function bindings(value: unknown, path: string): readonly U0EvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a nonempty binding array`);
  }
  const parsed = value.map((item, index) =>
    binding(item, `${path}[${String(index)}]`)
  );
  const identities = parsed.map(bindingIdentity);
  if (hasDuplicates(identities)) {
    throw new Error(`${path} contains a duplicate case/trace binding`);
  }
  return Object.freeze(parsed);
}

function bindingIdentity(value: U0EvidenceBinding): string {
  return `${value.caseId}\0${value.traceIds.join("\0")}`;
}

function bunIdentity(value: U0BunCaseIdentity): string {
  return `${value.file}\0${value.title}`;
}

function playwrightIdentity(value: U0PlaywrightIdentity): string {
  return `${value.file}\0${value.title}\0${value.project}`;
}

function cellIdentity(value: U0BrowserCellIdentity): string {
  return [
    value.producer.file,
    value.producer.title,
    value.project,
    value.cellId,
  ].join("\0");
}

function cellTemplateIdentity(value: Readonly<{
  cellId: string;
  producer: Readonly<{ file: string; title: string }>;
}>): string {
  return `${value.producer.file}\0${value.producer.title}\0${value.cellId}`;
}

function parseInventory(value: unknown): U0EvidenceInventory {
  const root = record(value, "inventory");
  exactKeys(root, ROOT_KEYS, "inventory");
  if (
    root["schema"] !== "changes.ui.u0-evidence-inventory.v1" ||
    root["fixtureVersion"] !== 1 ||
    root["expectedValuesGenerated"] !== true ||
    root["runtimeReportUsedAsOracle"] !== false ||
    root["productionOutputUsed"] !== false
  ) {
    throw new Error(
      "inventory authority flags must declare generated candidates, non-oracular runtime reports, and no production-output authorship",
    );
  }
  const authorshipValue = record(root["authorship"], "inventory.authorship");
  exactKeys(authorshipValue, [
    "candidateEnumeration",
    "independentlyReviewed",
    "reviewBasis",
    "runtimeReportsConsultedAsDraftingAid",
  ], "inventory.authorship");
  const reviewBasis = strings(
    authorshipValue["reviewBasis"],
    "inventory.authorship.reviewBasis",
  );
  if (
    authorshipValue["candidateEnumeration"] !== "mechanical" ||
    authorshipValue["independentlyReviewed"] !== true ||
    authorshipValue["runtimeReportsConsultedAsDraftingAid"] !== true ||
    reviewBasis.length !== 4
  ) {
    throw new Error(
      "inventory.authorship must disclose mechanical enumeration, runtime-report drafting aids, and four independent review surfaces",
    );
  }
  const authorship = Object.freeze({
    candidateEnumeration: "mechanical" as const,
    independentlyReviewed: true as const,
    reviewBasis,
    runtimeReportsConsultedAsDraftingAid: true as const,
  });

  const projects = strings(root["projects"], "inventory.projects").map(
    (project, index) => browserProject(project, `inventory.projects[${String(index)}]`),
  );
  if (JSON.stringify(projects) !== JSON.stringify(PROJECTS)) {
    throw new Error("inventory.projects must be the exact pinned browser order");
  }

  const expectedCountsValue = record(
    root["expectedCounts"],
    "inventory.expectedCounts",
  );
  exactKeys(expectedCountsValue, [
    "browserCells",
    "browserCellTemplates",
    "bunCases",
    "playwrightSpecifications",
    "playwrightTests",
    "reviewedSources",
    "screenshots",
  ], "inventory.expectedCounts");
  const expectedCounts = Object.freeze({
    browserCells: integer(
      expectedCountsValue["browserCells"],
      "inventory.expectedCounts.browserCells",
    ),
    browserCellTemplates: integer(
      expectedCountsValue["browserCellTemplates"],
      "inventory.expectedCounts.browserCellTemplates",
    ),
    bunCases: integer(
      expectedCountsValue["bunCases"],
      "inventory.expectedCounts.bunCases",
    ),
    playwrightSpecifications: integer(
      expectedCountsValue["playwrightSpecifications"],
      "inventory.expectedCounts.playwrightSpecifications",
    ),
    playwrightTests: integer(
      expectedCountsValue["playwrightTests"],
      "inventory.expectedCounts.playwrightTests",
    ),
    reviewedSources: integer(
      expectedCountsValue["reviewedSources"],
      "inventory.expectedCounts.reviewedSources",
    ),
    screenshots: integer(
      expectedCountsValue["screenshots"],
      "inventory.expectedCounts.screenshots",
    ),
  });

  if (!Array.isArray(root["reviewedSources"])) {
    throw new Error("inventory.reviewedSources must be an array");
  }
  const reviewedSources = root["reviewedSources"].map((item, index) => {
    const path = `inventory.reviewedSources[${String(index)}]`;
    const row = record(item, path);
    exactKeys(row, ["path", "sha256"], path);
    return Object.freeze({
      path: safeRepositoryPath(row["path"], `${path}.path`),
      sha256: sha256(row["sha256"], `${path}.sha256`),
    });
  });
  const reviewedSourcePaths = reviewedSources.map(({ path }) => path);
  if (
    hasDuplicates(reviewedSourcePaths) ||
    !isSorted(reviewedSourcePaths)
  ) {
    throw new Error("inventory.reviewedSources must be unique and path-sorted");
  }

  if (!Array.isArray(root["bunSuites"])) {
    throw new Error("inventory.bunSuites must be an array");
  }
  const bunSuites = root["bunSuites"].map((item, index) => {
    const path = `inventory.bunSuites[${String(index)}]`;
    const row = record(item, path);
    exactKeys(row, ["file", "titles"], path);
    const titles = strings(row["titles"], `${path}.titles`);
    if (titles.length === 0 || hasDuplicates(titles) || !isSorted(titles)) {
      throw new Error(`${path}.titles must be nonempty, unique, and sorted`);
    }
    return Object.freeze({
      file: safeRepositoryPath(row["file"], `${path}.file`),
      titles,
    });
  });
  const bunSuiteFiles = bunSuites.map(({ file }) => file);
  if (hasDuplicates(bunSuiteFiles) || !isSorted(bunSuiteFiles)) {
    throw new Error("inventory.bunSuites must be unique and file-sorted");
  }

  if (!Array.isArray(root["playwrightSuites"])) {
    throw new Error("inventory.playwrightSuites must be an array");
  }
  const playwrightSuites = root["playwrightSuites"].map((item, index) => {
    const path = `inventory.playwrightSuites[${String(index)}]`;
    const row = record(item, path);
    exactKeys(row, ["file", "titles"], path);
    const titles = strings(row["titles"], `${path}.titles`);
    if (titles.length === 0 || hasDuplicates(titles) || !isSorted(titles)) {
      throw new Error(`${path}.titles must be nonempty, unique, and sorted`);
    }
    return Object.freeze({
      file: safeRepositoryPath(row["file"], `${path}.file`),
      titles,
    });
  });
  const playwrightSuiteFiles = playwrightSuites.map(({ file }) => file);
  if (hasDuplicates(playwrightSuiteFiles) || !isSorted(playwrightSuiteFiles)) {
    throw new Error(
      "inventory.playwrightSuites must be unique and file-sorted",
    );
  }

  if (!Array.isArray(root["browserCells"])) {
    throw new Error("inventory.browserCells must be an array");
  }
  const browserCells = root["browserCells"].map((item, index) => {
    const path = `inventory.browserCells[${String(index)}]`;
    const row = record(item, path);
    exactKeys(row, ["bindings", "cellId", "producer", "screenshots"], path);
    const producerValue = record(row["producer"], `${path}.producer`);
    exactKeys(producerValue, ["file", "title"], `${path}.producer`);
    const screenshotsValue = record(row["screenshots"], `${path}.screenshots`);
    exactKeys(screenshotsValue, PROJECTS, `${path}.screenshots`);
    const screenshotInventory = Object.fromEntries(PROJECTS.map((project) => {
      const filenames = strings(
        screenshotsValue[project],
        `${path}.screenshots.${project}`,
      );
      if (
        hasDuplicates(filenames) ||
        filenames.some((filename) =>
          filename.includes("/") ||
          filename.includes("\\") ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/u.test(filename)
        )
      ) {
        throw new Error(
          `${path}.screenshots.${project} must contain unique PNG basenames`,
        );
      }
      return [project, filenames];
    })) as Record<U0BrowserProject, readonly string[]>;
    return Object.freeze({
      bindings: bindings(row["bindings"], `${path}.bindings`),
      cellId: string(row["cellId"], `${path}.cellId`),
      producer: Object.freeze({
        file: safeRepositoryPath(
          producerValue["file"],
          `${path}.producer.file`,
        ),
        title: string(producerValue["title"], `${path}.producer.title`),
      }),
      screenshots: Object.freeze(screenshotInventory),
    });
  });
  const browserCellIdentities = browserCells.map(cellTemplateIdentity);
  if (hasDuplicates(browserCellIdentities) || !isSorted(browserCellIdentities)) {
    throw new Error(
      "inventory.browserCells must be unique and producer/file/title/cell-sorted",
    );
  }

  const sourceSet = new Set(reviewedSourcePaths);
  for (const required of [
    ...REQUIRED_SUPPORT_SOURCES,
    ...bunSuiteFiles,
    ...playwrightSuiteFiles,
  ]) {
    if (!sourceSet.has(required)) {
      throw new Error(`inventory.reviewedSources does not pin ${required}`);
    }
  }
  const playwrightSpecificationSet = new Set(
    playwrightSuites.flatMap(({ file, titles }) =>
      titles.map((title) => `${file}\0${title}`)
    ),
  );
  for (const cell of browserCells) {
    if (
      !playwrightSpecificationSet.has(
        `${cell.producer.file}\0${cell.producer.title}`,
      )
    ) {
      throw new Error(
        `inventory.browserCells producer is not a reviewed Playwright specification: ${cellTemplateIdentity(cell)}`,
      );
    }
  }

  const allScreenshotFilenames = browserCells.flatMap(({ screenshots }) =>
    PROJECTS.flatMap((project) => screenshots[project])
  );
  if (hasDuplicates(allScreenshotFilenames)) {
    throw new Error(
      "inventory.browserCells screenshot filenames must be globally unique",
    );
  }

  const observedCounts = {
    browserCells: browserCells.length * PROJECTS.length,
    browserCellTemplates: browserCells.length,
    bunCases: bunSuites.reduce(
      (total, suite) => total + suite.titles.length,
      0,
    ),
    playwrightSpecifications: playwrightSuites.reduce(
      (total, suite) => total + suite.titles.length,
      0,
    ),
    playwrightTests: playwrightSuites.reduce(
      (total, suite) => total + suite.titles.length * PROJECTS.length,
      0,
    ),
    reviewedSources: reviewedSources.length,
    screenshots: allScreenshotFilenames.length,
  };
  if (JSON.stringify(observedCounts) !== JSON.stringify(expectedCounts)) {
    throw new Error(
      `inventory.expectedCounts does not match reviewed rows: ${JSON.stringify(observedCounts)}`,
    );
  }

  return Object.freeze({
    schema: "changes.ui.u0-evidence-inventory.v1",
    fixtureVersion: 1,
    expectedValuesGenerated: true,
    runtimeReportUsedAsOracle: false,
    productionOutputUsed: false,
    authorship,
    projects: Object.freeze([...projects]),
    expectedCounts,
    reviewedSources: Object.freeze(reviewedSources),
    bunSuites: Object.freeze(bunSuites),
    playwrightSuites: Object.freeze(playwrightSuites),
    browserCells: Object.freeze(browserCells),
  });
}

export function inspectU0EvidenceInventory(
  value: unknown,
): U0EvidenceInventoryLoadResult {
  try {
    return Object.freeze({
      findings: Object.freeze([]),
      inventory: parseInventory(value),
    });
  } catch (error) {
    return Object.freeze({
      findings: Object.freeze([finding(
        "U0_EVIDENCE_INVENTORY_INVALID",
        U0_EVIDENCE_INVENTORY_PATH,
        error instanceof Error ? error.message : "Inventory is invalid.",
      )]),
      inventory: null,
    });
  }
}

export async function loadU0EvidenceInventory(
  root = process.cwd(),
): Promise<U0EvidenceInventoryLoadResult> {
  const path = resolve(root, U0_EVIDENCE_INVENTORY_PATH);
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return inspectU0EvidenceInventory(value);
  } catch (error) {
    return Object.freeze({
      findings: Object.freeze([finding(
        "U0_EVIDENCE_INVENTORY_UNREADABLE",
        U0_EVIDENCE_INVENTORY_PATH,
        error instanceof Error ? error.message : "Inventory is unreadable.",
      )]),
      inventory: null,
    });
  }
}

export function expectedU0BunCases(
  inventory: U0EvidenceInventory,
): readonly U0BunCaseIdentity[] {
  return Object.freeze(
    inventory.bunSuites.flatMap(({ file, titles }) =>
      titles.map((title) => Object.freeze({ file, title }))
    ),
  );
}

export function expectedU0PlaywrightTests(
  inventory: U0EvidenceInventory,
): readonly U0PlaywrightIdentity[] {
  return Object.freeze(
    inventory.playwrightSuites.flatMap(({ file, titles }) =>
      titles.flatMap((title) =>
        inventory.projects.map((project) =>
          Object.freeze({ file, project, title })
        )
      )
    ),
  );
}

export function expectedU0BrowserCells(
  inventory: U0EvidenceInventory,
): readonly U0BrowserCellIdentity[] {
  return Object.freeze(
    inventory.browserCells.flatMap((cell) =>
      inventory.projects.map((project) =>
        Object.freeze({
          bindings: cell.bindings,
          cellId: cell.cellId,
          producer: cell.producer,
          project,
          screenshots: cell.screenshots[project],
        })
      )
    ),
  );
}

function compareExactInventory(
  input: Readonly<{
    codePrefix: string;
    expected: readonly string[];
    observed: readonly string[];
    path: string;
  }>,
): readonly U0EvidenceInventoryFinding[] {
  const findings: U0EvidenceInventoryFinding[] = [];
  const counts = new Map<string, number>();
  for (const identity of input.observed) {
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  for (const [identity, count] of counts) {
    if (count > 1) {
      findings.push(finding(
        `${input.codePrefix}_DUPLICATE`,
        input.path,
        `Observed identity occurs ${String(count)} times: ${identity}`,
      ));
    }
  }
  const expected = new Set(input.expected);
  const observed = new Set(input.observed);
  for (const identity of [...expected].sort(compare)) {
    if (!observed.has(identity)) {
      findings.push(finding(
        `${input.codePrefix}_MISSING`,
        input.path,
        `Reviewed identity is missing: ${identity}`,
      ));
    }
  }
  for (const identity of [...observed].sort(compare)) {
    if (!expected.has(identity)) {
      findings.push(finding(
        `${input.codePrefix}_EXTRA`,
        input.path,
        `Unreviewed identity was observed: ${identity}`,
      ));
    }
  }
  return Object.freeze(findings);
}

export function compareU0BunJUnitInventory(
  inventory: U0EvidenceInventory,
  observedCases: readonly Readonly<{ file: string; name: string }>[],
): readonly U0EvidenceInventoryFinding[] {
  return compareExactInventory({
    codePrefix: "U0_EVIDENCE_INVENTORY_BUN",
    expected: expectedU0BunCases(inventory).map(bunIdentity),
    observed: observedCases.map(({ file, name }) =>
      bunIdentity({ file: normalizePlaywrightFile(file), title: name })
    ),
    path: "bun.junit.testcases",
  });
}

function normalizePlaywrightFile(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  return normalized.startsWith("tests/") ? normalized : `tests/${normalized}`;
}

function observedPlaywrightTests(value: unknown): readonly U0PlaywrightIdentity[] {
  const identities: U0PlaywrightIdentity[] = [];
  if (!isRecord(value)) return identities;
  const walk = (suites: unknown): void => {
    if (!Array.isArray(suites)) return;
    for (const suiteValue of suites) {
      if (!isRecord(suiteValue)) continue;
      const suiteFile = suiteValue["file"];
      const specs = suiteValue["specs"];
      if (Array.isArray(specs)) {
        for (const specValue of specs) {
          if (!isRecord(specValue)) continue;
          const file = normalizePlaywrightFile(
            specValue["file"] ?? suiteFile,
          );
          const title = typeof specValue["title"] === "string"
            ? specValue["title"]
            : "";
          const tests = specValue["tests"];
          if (!Array.isArray(tests)) continue;
          for (const testValue of tests) {
            if (!isRecord(testValue)) continue;
            const project = testValue["projectName"];
            if (!file || !title || !PROJECTS.includes(project as U0BrowserProject)) {
              continue;
            }
            identities.push(Object.freeze({
              file,
              project: project as U0BrowserProject,
              title,
            }));
          }
        }
      }
      walk(suiteValue["suites"]);
    }
  };
  walk(value["suites"]);
  return Object.freeze(identities);
}

export function compareU0PlaywrightInventory(
  inventory: U0EvidenceInventory,
  report: unknown,
): readonly U0EvidenceInventoryFinding[] {
  return compareExactInventory({
    codePrefix: "U0_EVIDENCE_INVENTORY_PLAYWRIGHT",
    expected: expectedU0PlaywrightTests(inventory).map(playwrightIdentity),
    observed: observedPlaywrightTests(report).map(playwrightIdentity),
    path: "browser.report.specifications",
  });
}

function observedCell(value: unknown): U0BrowserCellIdentity | null {
  const wrapper = isRecord(value) && isRecord(value["value"])
    ? value["value"]
    : value;
  if (!isRecord(wrapper)) return null;
  const producer = isRecord(wrapper["producer"]) ? wrapper["producer"] : {};
  const browser = isRecord(wrapper["browser"]) ? wrapper["browser"] : {};
  const project = browser["name"];
  if (
    typeof wrapper["cellId"] !== "string" ||
    typeof producer["file"] !== "string" ||
    typeof producer["title"] !== "string" ||
    !PROJECTS.includes(project as U0BrowserProject) ||
    !Array.isArray(wrapper["bindings"]) ||
    !Array.isArray(wrapper["screenshots"])
  ) return null;
  const bindingValues: readonly unknown[] = wrapper["bindings"];
  const screenshotValues: readonly unknown[] = wrapper["screenshots"];
  const observedBindings: U0EvidenceBinding[] = [];
  for (const item of bindingValues) {
    if (
      !isRecord(item) ||
      typeof item["caseId"] !== "string" ||
      !Array.isArray(item["traceIds"])
    ) return null;
    const traceIdValues: readonly unknown[] = item["traceIds"];
    const traceIds: string[] = [];
    for (const traceId of traceIdValues) {
      if (typeof traceId !== "string") return null;
      traceIds.push(traceId);
    }
    observedBindings.push(Object.freeze({
      caseId: item["caseId"],
      traceIds: Object.freeze(traceIds),
    }));
  }
  const screenshots: string[] = [];
  for (const item of screenshotValues) {
    if (!isRecord(item) || typeof item["filename"] !== "string") return null;
    screenshots.push(item["filename"]);
  }
  return Object.freeze({
    bindings: Object.freeze(observedBindings),
    cellId: wrapper["cellId"],
    producer: Object.freeze({
      file: normalizePlaywrightFile(producer["file"]),
      title: producer["title"],
    }),
    project: project as U0BrowserProject,
    screenshots: Object.freeze(screenshots),
  });
}

export function compareU0BrowserCellInventory(
  inventory: U0EvidenceInventory,
  cells: readonly unknown[],
): readonly U0EvidenceInventoryFinding[] {
  const findings: U0EvidenceInventoryFinding[] = [];
  const observed: U0BrowserCellIdentity[] = [];
  for (const [index, cell] of cells.entries()) {
    const parsed = observedCell(cell);
    if (parsed === null) {
      findings.push(finding(
        "U0_EVIDENCE_INVENTORY_CELL_SHAPE",
        `browser.cells[${String(index)}]`,
        "Cell identity, producer, browser project, bindings, or screenshots are malformed.",
      ));
    } else {
      observed.push(parsed);
    }
  }
  const expected = expectedU0BrowserCells(inventory);
  findings.push(...compareExactInventory({
    codePrefix: "U0_EVIDENCE_INVENTORY_CELL",
    expected: expected.map(cellIdentity),
    observed: observed.map(cellIdentity),
    path: "browser.cells",
  }));

  const expectedByIdentity = new Map(
    expected.map((cell) => [cellIdentity(cell), cell]),
  );
  for (const cell of observed) {
    const identity = cellIdentity(cell);
    const reviewed = expectedByIdentity.get(identity);
    if (reviewed === undefined) continue;
    if (
      JSON.stringify(cell.bindings) !== JSON.stringify(reviewed.bindings)
    ) {
      findings.push(finding(
        "U0_EVIDENCE_INVENTORY_CELL_BINDINGS",
        `browser.cells.${identity}`,
        "Cell bindings do not equal the reviewed case/trace order.",
      ));
    }
    if (
      JSON.stringify(cell.screenshots) !== JSON.stringify(reviewed.screenshots)
    ) {
      findings.push(finding(
        "U0_EVIDENCE_INVENTORY_CELL_SCREENSHOTS",
        `browser.cells.${identity}`,
        "Cell screenshot filenames do not equal the reviewed inventory.",
      ));
    }
  }
  return Object.freeze(findings);
}

function withinRoot(root: string, target: string): boolean {
  const path = relative(root, target).replaceAll("\\", "/");
  return path === "" || (path !== ".." && !path.startsWith("../"));
}

export async function verifyU0EvidenceInventorySourceHashes(
  inventory: U0EvidenceInventory,
  root = process.cwd(),
): Promise<readonly U0EvidenceInventoryFinding[]> {
  const findings: U0EvidenceInventoryFinding[] = [];
  const rootReal = await realpath(root);
  for (const source of inventory.reviewedSources) {
    const path = resolve(root, source.path);
    try {
      const status = await lstat(path);
      const target = await realpath(path);
      if (!status.isFile() || status.isSymbolicLink() || !withinRoot(rootReal, target)) {
        throw new Error("reviewed source must be a regular in-repository file");
      }
      const bytes = await readFile(path);
      const observed = createHash("sha256").update(bytes).digest("hex");
      if (observed !== source.sha256) {
        findings.push(finding(
          "U0_EVIDENCE_INVENTORY_SOURCE_HASH",
          source.path,
          `Reviewed SHA-256 ${source.sha256} does not match ${observed}.`,
        ));
      }
    } catch (error) {
      findings.push(finding(
        "U0_EVIDENCE_INVENTORY_SOURCE_UNREADABLE",
        source.path,
        error instanceof Error ? error.message : "Reviewed source is unreadable.",
      ));
    }
  }
  return Object.freeze(findings);
}
