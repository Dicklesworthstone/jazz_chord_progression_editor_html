type JsonObject = Record<string, unknown>;

type Finding = {
  code: string;
  path: string;
  message: string;
};

const contractUrl = new URL(
  "../tests/fixtures/foundation/foundation-contract.json",
  import.meta.url,
);
const casesUrl = new URL(
  "../tests/fixtures/foundation/static-cases.json",
  import.meta.url,
);
const ledgerUrl = new URL(
  "../tests/fixtures/foundation/toolchain-ledger.json",
  import.meta.url,
);

const findings: Finding[] = [];

function add(code: string, path: string, message: string): void {
  findings.push({ code, path, message });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(parent: JsonObject, key: string, path: string): JsonObject {
  const value = parent[key];
  if (!isObject(value)) {
    add("F0_SPEC_SHAPE", path, "Expected an object.");
    return {};
  }
  return value;
}

function arrayAt(parent: JsonObject, key: string, path: string): unknown[] {
  const value = parent[key];
  if (!Array.isArray(value)) {
    add("F0_SPEC_SHAPE", path, "Expected an array.");
    return [];
  }
  return value;
}

function exactVersion(value: unknown): boolean {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}

function requireUniqueStrings(
  values: unknown[],
  path: string,
): string[] {
  const strings: string[] = [];
  const seen = new Set<string>();

  values.forEach((value, index) => {
    if (typeof value !== "string" || value.length === 0) {
      add(
        "F0_SPEC_STRING",
        `${path}[${String(index)}]`,
        "Expected a non-empty string.",
      );
      return;
    }
    if (seen.has(value)) {
      add(
        "F0_SPEC_DUPLICATE",
        `${path}[${String(index)}]`,
        `Duplicate value: ${value}`,
      );
      return;
    }
    seen.add(value);
    strings.push(value);
  });

  return strings;
}

function requireSorted(values: string[], path: string): void {
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(values) !== JSON.stringify(sorted)) {
    add("F0_SPEC_ORDER", path, "Values must use stable lexical ordering.");
  }
}

function validateVersionMap(value: JsonObject, path: string): void {
  for (const [name, version] of Object.entries(value)) {
    if (!exactVersion(version)) {
      add(
        "F0_SPEC_VERSION",
        `${path}.${name}`,
        "Dependency versions must be exact x.y.z values.",
      );
    }
  }
}

function validateLayerGraph(contract: JsonObject): number {
  const rawLayers = arrayAt(contract, "layers", "$.layers");
  const edges = new Map<string, string[]>();

  rawLayers.forEach((raw, index) => {
    const path = `$.layers[${String(index)}]`;
    if (!isObject(raw) || typeof raw["name"] !== "string") {
      add("F0_SPEC_LAYER", path, "Layer requires a string name.");
      return;
    }
    if (edges.has(raw["name"])) {
      add("F0_SPEC_DUPLICATE", `${path}.name`, `Duplicate layer: ${raw["name"]}`);
      return;
    }
    const targets = requireUniqueStrings(
      Array.isArray(raw["mayImport"]) ? raw["mayImport"] : [],
      `${path}.mayImport`,
    );
    requireSorted(targets, `${path}.mayImport`);
    edges.set(raw["name"], targets);
  });

  for (const [from, targets] of edges) {
    for (const target of targets) {
      if (!edges.has(target)) {
        add(
          "F0_SPEC_LAYER_TARGET",
          `$.layers.${from}`,
          `Unknown import target: ${target}`,
        );
      }
      if (from === target) {
        add(
          "F0_SPEC_LAYER_SELF_EDGE",
          `$.layers.${from}`,
          "Same-layer imports are implicit and must not be graph edges.",
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(name: string, trail: string[]): void {
    if (visiting.has(name)) {
      add(
        "F0_SPEC_LAYER_CYCLE",
        "$.layers",
        `Layer cycle: ${[...trail, name].join(" -> ")}`,
      );
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const target of edges.get(name) ?? []) {
      visit(target, [...trail, name]);
    }
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of edges.keys()) visit(name, []);
  return edges.size;
}

function validateTraceability(contract: JsonObject): number {
  const rows = arrayAt(contract, "traceability", "$.traceability");
  const ids: string[] = [];

  rows.forEach((raw, index) => {
    const path = `$.traceability[${String(index)}]`;
    if (
      !isObject(raw) ||
      typeof raw["id"] !== "string" ||
      typeof raw["kind"] !== "string"
    ) {
      add("F0_SPEC_TRACE", path, "Trace row requires string id and kind.");
      return;
    }
    ids.push(raw["id"]);
  });

  requireUniqueStrings(ids, "$.traceability.ids");
  const required = [
    "F0-ARTIFACT-01",
    "F0-BOUNDARY-01",
    "F0-CSP-01",
    "F0-DUPLICATE-01",
    "F0-LICENSE-01",
    "F0-NETWORK-01",
    "F0-NETWORK-02",
    "F0-NODE-01",
    "F0-REPRO-01",
    "F0-SIZE-01",
    "F0-TOOLCHAIN-01",
    "L-OFFLINE-01",
    "L-SOURCE-01",
  ];
  for (const id of required) {
    if (!ids.includes(id)) {
      add("F0_SPEC_TRACE_MISSING", "$.traceability", `Missing trace: ${id}`);
    }
  }
  return ids.length;
}

function validateCaseGroup(
  root: JsonObject,
  key: string,
  allIds: Set<string>,
): number {
  const rows = arrayAt(root, key, `$.${key}`);
  rows.forEach((raw, index) => {
    const path = `$.${key}[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") {
      add("F0_SPEC_CASE", path, "Case requires a string id.");
      return;
    }
    if (allIds.has(raw["id"])) {
      add(
        "F0_SPEC_DUPLICATE",
        `${path}.id`,
        `Duplicate case id: ${raw["id"]}`,
      );
    }
    allIds.add(raw["id"]);

    if (
      raw["expected"] === "allow" &&
      Array.isArray(raw["codes"]) &&
      raw["codes"].length > 0
    ) {
      add("F0_SPEC_CASE", `${path}.codes`, "Allowed case cannot expect findings.");
    }
    if (
      raw["expected"] === "reject" &&
      (!Array.isArray(raw["codes"]) || raw["codes"].length === 0)
    ) {
      add("F0_SPEC_CASE", `${path}.codes`, "Rejected case requires finding codes.");
    }
  });
  return rows.length;
}

async function parseJson(url: URL, path: string): Promise<JsonObject> {
  try {
    const value: unknown = await Bun.file(url).json();
    if (!isObject(value)) {
      add("F0_SPEC_SHAPE", path, "Root must be an object.");
      return {};
    }
    return value;
  } catch (error) {
    add(
      "F0_SPEC_JSON",
      path,
      error instanceof Error ? error.message : "Unable to parse JSON.",
    );
    return {};
  }
}

async function main(): Promise<void> {
  const contract = await parseJson(contractUrl, "foundation-contract.json");
  const cases = await parseJson(casesUrl, "static-cases.json");
  const ledger = await parseJson(ledgerUrl, "toolchain-ledger.json");

  if (contract["schemaVersion"] !== 1 || contract["contractId"] !== "F0") {
    add(
      "F0_SPEC_IDENTITY",
      "$",
      "Expected schemaVersion 1 and contractId F0.",
    );
  }

  const toolchain = objectAt(contract, "toolchain", "$.toolchain");
  if (
    typeof toolchain["packageManager"] !== "string" ||
    !/^bun@\d+\.\d+\.\d+$/.test(toolchain["packageManager"])
  ) {
    add(
      "F0_SPEC_PACKAGE_MANAGER",
      "$.toolchain.packageManager",
      "Expected an exact bun@x.y.z package manager.",
    );
  }

  const runtime = objectAt(
    toolchain,
    "runtimeDependencies",
    "$.toolchain.runtimeDependencies",
  );
  const runtimeNames = Object.keys(runtime);
  if (
    runtimeNames.length !== 1 ||
    runtimeNames[0] !== "preact" ||
    !exactVersion(runtime["preact"])
  ) {
    add(
      "F0_SPEC_RUNTIME_DEPENDENCIES",
      "$.toolchain.runtimeDependencies",
      "Preact at an exact version must be the sole production dependency.",
    );
  }

  const wasmCompiled = objectAt(
    toolchain,
    "wasmCompiledDependencies",
    "$.toolchain.wasmCompiledDependencies",
  );
  validateVersionMap(wasmCompiled, "$.toolchain.wasmCompiledDependencies");

  validateVersionMap(
    objectAt(
      toolchain,
      "developmentDependencies",
      "$.toolchain.developmentDependencies",
    ),
    "$.toolchain.developmentDependencies",
  );
  const scripts = requireUniqueStrings(
    arrayAt(toolchain, "requiredScripts", "$.toolchain.requiredScripts"),
    "$.toolchain.requiredScripts",
  );
  requireSorted(scripts, "$.toolchain.requiredScripts");

  const declaredVersions = new Map<string, string>();
  if (typeof toolchain["packageManager"] === "string") {
    const [name, version] = toolchain["packageManager"].split("@");
    if (name && version) declaredVersions.set(name, version);
  }
  for (const [name, version] of Object.entries(runtime)) {
    if (typeof version === "string") declaredVersions.set(name, version);
  }
  // Rust crates compiled into the checked-in wasm payload; declared so the
  // ledger's compiled-into-wasm provenance rows reconcile like package rows.
  for (const [name, version] of Object.entries(wasmCompiled)) {
    if (typeof version === "string") declaredVersions.set(name, version);
  }
  const development = objectAt(
    toolchain,
    "developmentDependencies",
    "$.toolchain.developmentDependencies",
  );
  for (const [name, version] of Object.entries(development)) {
    if (typeof version === "string") declaredVersions.set(name, version);
  }
  if (typeof toolchain["preferredNodeVersion"] === "string") {
    declaredVersions.set("node", toolchain["preferredNodeVersion"]);
  }

  const ledgerRows = arrayAt(ledger, "records", "$ledger.records");
  const ledgerNames = new Set<string>();
  ledgerRows.forEach((raw, index) => {
    const path = `$ledger.records[${String(index)}]`;
    if (!isObject(raw)) {
      add("F0_SPEC_LEDGER", path, "Ledger record must be an object.");
      return;
    }
    const { name, version, license, source } = raw;
    if (
      typeof name !== "string" ||
      typeof version !== "string" ||
      typeof license !== "string" ||
      typeof source !== "string"
    ) {
      add(
        "F0_SPEC_LEDGER",
        path,
        "Ledger record requires string name, version, license, and source.",
      );
      return;
    }
    if (ledgerNames.has(name)) {
      add("F0_SPEC_DUPLICATE", `${path}.name`, `Duplicate ledger name: ${name}`);
    }
    ledgerNames.add(name);
    if (declaredVersions.get(name) !== version) {
      add(
        "F0_SPEC_LEDGER_VERSION",
        `${path}.version`,
        `Ledger version does not match contract for ${name}.`,
      );
    }
    if (!/^https:\/\/github\.com\//.test(source)) {
      add(
        "F0_SPEC_LEDGER_SOURCE",
        `${path}.source`,
        "Ledger source must be a primary HTTPS repository.",
      );
    }
    if (!/^[A-Za-z0-9.-]+(?: (?:OR|AND) [A-Za-z0-9.-]+)*$/.test(license)) {
      add(
        "F0_SPEC_LEDGER_LICENSE",
        `${path}.license`,
        "Ledger license must be a compact SPDX expression.",
      );
    }
  });
  for (const name of declaredVersions.keys()) {
    if (!ledgerNames.has(name)) {
      add("F0_SPEC_LEDGER_MISSING", "$ledger.records", `Missing ledger: ${name}`);
    }
  }
  for (const name of ledgerNames) {
    if (!declaredVersions.has(name)) {
      add("F0_SPEC_LEDGER_EXTRA", "$ledger.records", `Undeclared ledger: ${name}`);
    }
  }

  const artifact = objectAt(contract, "artifact", "$.artifact");
  const max = artifact["maxUncompressedBytes"];
  const shell = artifact["foundationShellMaxBytes"];
  const atlas = artifact["reservedAtlasBytes"];
  const legacy = objectAt(
    artifact,
    "legacyCutoverBaseline",
    "$.artifact.legacyCutoverBaseline",
  );
  if (
    !Number.isSafeInteger(max) ||
    !Number.isSafeInteger(shell) ||
    !Number.isSafeInteger(atlas) ||
    Number(max) !== 8_388_608 ||
    Number(shell) <= 0 ||
    Number(atlas) < 0 ||
    Number(shell) + Number(atlas) > Number(max)
  ) {
    add(
      "F0_SPEC_BUDGET",
      "$.artifact",
      "Artifact, shell, and reserved Atlas budgets are inconsistent.",
    );
  }
  if (
    typeof legacy["commit"] !== "string" ||
    !/^[0-9a-f]{40}$/.test(legacy["commit"]) ||
    typeof legacy["sha256"] !== "string" ||
    !/^[0-9a-f]{64}$/.test(legacy["sha256"]) ||
    !Number.isSafeInteger(legacy["bytes"]) ||
    Number(legacy["bytes"]) <= 0
  ) {
    add(
      "F0_SPEC_LEGACY_BASELINE",
      "$.artifact.legacyCutoverBaseline",
      "Legacy cutover baseline requires commit, SHA-256, and positive byte size.",
    );
  }

  const nodeMajors = requireUniqueStrings(
    arrayAt(toolchain, "playwrightNodeMajors", "$.toolchain.playwrightNodeMajors").map(
      String,
    ),
    "$.toolchain.playwrightNodeMajors",
  );
  if (JSON.stringify(nodeMajors) !== JSON.stringify(["22", "24", "26"])) {
    add(
      "F0_SPEC_NODE",
      "$.toolchain.playwrightNodeMajors",
      "Playwright Node majors must be 22, 24, and 26.",
    );
  }

  const layerCount = validateLayerGraph(contract);
  const traceCount = validateTraceability(contract);
  const allIds = new Set<string>();
  const caseCounts = {
    artifact: validateCaseGroup(cases, "artifactCases", allIds),
    dependency: validateCaseGroup(cases, "dependencyCases", allIds),
    duplicate: validateCaseGroup(cases, "duplicateCases", allIds),
    runtime: validateCaseGroup(cases, "runtimeCases", allIds),
    size: validateCaseGroup(cases, "sizeCases", allIds),
  };

  const sizeCases = arrayAt(cases, "sizeCases", "$.sizeCases");
  const sizeValues = sizeCases
    .filter(isObject)
    .map((row) => row["bytes"])
    .filter((value): value is number => typeof value === "number");
  if (!sizeValues.includes(Number(max)) || !sizeValues.includes(Number(max) + 1)) {
    add(
      "F0_SPEC_SIZE_FIXTURE",
      "$.sizeCases",
      "Size cases must cover the exact limit and limit plus one.",
    );
  }

  findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );

  const report = {
    schema: "jcpe.foundation-spec-validation.v1",
    contractId: "F0",
    outcome: findings.length === 0 ? "pass" : "fail",
    checks: {
      cases: caseCounts,
      layers: layerCount,
      ledgerRecords: ledgerRows.length,
      scripts: scripts.length,
      traces: traceCount,
    },
    findings,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = findings.length === 0 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        schema: "jcpe.foundation-spec-validation.v1",
        contractId: "F0",
        outcome: "tool-failure",
        message: error instanceof Error ? error.message : "Unknown tool failure.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 2;
}
