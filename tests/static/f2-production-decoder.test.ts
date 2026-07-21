import { describe, expect, test } from "bun:test";

import {
  analyzeF2DecoderSourcePolicy,
  F2_DECODER_SOURCE_POLICY_CODES,
  inspectF2DecoderSourcePolicy,
  type F2DecoderSourcePolicyCode,
  type F2DecoderSourcePolicyFinding,
} from "../../scripts/f2-decoder-source-policy";

const BASE_INDEX = `
export {
  preflightDocumentImportBytes,
  decodeDocumentShape,
  documentDecodeOperations,
} from "./document-decoder";
export type {
  DecodeDocumentShape,
  DocumentDecodeOperations,
  DocumentDecoderIssue,
  DocumentImportBytePreflightResult,
  DocumentShapeDecodeResult,
  PreflightDocumentImportBytes,
} from "./document-decoder-contract";
`;

const BASE_DECODER = `
type Evidence = {
  maxDepthObserved: number;
  candidateObjectsAllocated: number;
  candidateArraysAllocated: number;
};

function snapshotContainer(input: unknown): void {
  if (typeof input !== "object" || input === null) return;
  const keys = Reflect.ownKeys(input);
  for (const key of keys) {
    Object.getOwnPropertyDescriptor(input, key);
  }
}

function depthPreflight(input: unknown, evidence: Evidence): void {
  const worklist: unknown[] = [input];
  while (worklist.length > 0) {
    evidence.maxDepthObserved += 1;
    snapshotContainer(input);
    worklist.pop();
  }
  if (evidence.maxDepthObserved > MAX_JSON_NESTING_DEPTH) return;
}

function allocateCandidateObject<Value extends object>(
  evidence: Evidence,
  value: Value,
): Value {
  evidence.candidateObjectsAllocated += 1;
  return value;
}

function allocateCandidateArray<Value>(
  evidence: Evidence,
  value: Value[],
): Value[] {
  evidence.candidateArraysAllocated += 1;
  return value;
}

function byteCore(utf8ByteLength: number): unknown {
  return { result: { ok: true, value: { utf8ByteLength }, warnings: [] }, evidence: {} };
}

function shapeCore(input: unknown): unknown {
  const evidence: Evidence = {
    maxDepthObserved: 0,
    candidateObjectsAllocated: 0,
    candidateArraysAllocated: 0,
  };
  depthPreflight(input, evidence);
  // SHAPE_CORE_HOOK
  return { result: { ok: false, errors: [] }, evidence };
}

export function preflightDocumentImportBytesWithEvidence(utf8ByteLength: number): unknown {
  return byteCore(utf8ByteLength);
}

export function preflightDocumentImportBytes(utf8ByteLength: number): unknown {
  return byteCore(utf8ByteLength).result;
}

export function decodeDocumentShapeWithEvidence(input: unknown): unknown {
  return shapeCore(input);
}

export function decodeDocumentShape(input: unknown): unknown {
  return shapeCore(input).result;
}

export const documentDecodeOperations = Object.freeze({
  preflightDocumentImportBytes,
  decodeDocumentShape,
});

void allocateCandidateObject;
void allocateCandidateArray;
`;

function findings(
  decoderSource = BASE_DECODER,
  domainIndexSource = BASE_INDEX,
): F2DecoderSourcePolicyFinding[] {
  return analyzeF2DecoderSourcePolicy({ decoderSource, domainIndexSource });
}

function codes(
  decoderSource = BASE_DECODER,
  domainIndexSource = BASE_INDEX,
): F2DecoderSourcePolicyCode[] {
  return [...new Set(findings(decoderSource, domainIndexSource).map((item) => item.code))].sort();
}

function withShapeCoreHook(source: string): string {
  return BASE_DECODER.replace("// SHAPE_CORE_HOOK", source);
}

describe("F2 production decoder AST policy controls", () => {
  test("accepts the independently authored mechanics witness", () => {
    expect(findings()).toEqual([]);
  });

  test("rejects forbidden imports and extra implementation exports", () => {
    expect(
      codes(`import { analyze } from "../theory";\n${BASE_DECODER}`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.importForbidden);
    expect(codes(`${BASE_DECODER}\nexport function extraSurface(): void {}`)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.exportSurface,
    );
  });

  test("keeps private evidence seams and types out of the Domain index", () => {
    expect(
      codes(
        BASE_DECODER,
        `${BASE_INDEX}\nexport { decodeDocumentShapeWithEvidence } from "./document-decoder";`,
      ),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.privateEvidencePublished);
    expect(
      codes(
        BASE_DECODER,
        `${BASE_INDEX}\nexport * from "./document-decoder-contract";`,
      ),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.privateEvidencePublished);
  });

  test("requires exact frozen operation keys and function identity", () => {
    const reversed = BASE_DECODER.replace(
      "preflightDocumentImportBytes,\n  decodeDocumentShape,\n});",
      "decodeDocumentShape,\n  preflightDocumentImportBytes,\n});",
    );
    expect(codes(reversed)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.operationsSurface,
    );
  });

  test("rejects module let/var and unfrozen nested reference constants", () => {
    expect(codes(`let retained: unknown;\n${BASE_DECODER}`)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.moduleMutableBinding,
    );
    expect(
      codes(`const LOOKUP = Object.freeze({ nested: ["x"] });\n${BASE_DECODER}`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.moduleReferenceNotFrozen);
  });

  test("rejects frozen wrappers around mutable built-ins and functions", () => {
    expect(
      codes(`const CACHE = Object.freeze({ values: new Map() });\n${BASE_DECODER}`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.moduleMutableBuiltIn);
    expect(
      codes(`const CALLBACK = Object.freeze({ run: () => 1 });\n${BASE_DECODER}`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.moduleMutableBuiltIn);
  });

  test("rejects writes to module bindings and named function properties", () => {
    const source = withShapeCoreHook("decodeDocumentShape.cache = input;");
    expect(codes(source)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.moduleBindingWrite,
    );
  });

  test("rejects global, browser, process, and storage state writes", () => {
    for (const statement of [
      "globalThis.decoderCache = input;",
      "window.name = \"decoder\";",
      "document.title = \"decoder\";",
      "process.env.DECODER_MODE = \"unsafe\";",
      "localStorage.setItem(\"decoder\", \"unsafe\");",
      "Reflect.set(sessionStorage, \"decoder\", \"unsafe\");",
    ]) {
      expect(codes(withShapeCoreHook(statement))).toContain(
        F2_DECODER_SOURCE_POLICY_CODES.externalStateWrite,
      );
    }
  });

  test("tracks external aliases and imported application state through helpers", () => {
    const source = `import { applicationState } from "./application-state";\n${withShapeCoreHook(`
  const externalAlias = globalThis;
  retainExternal(externalAlias);
  updateApplicationState(applicationState);
`)}
function retainExternal(target: unknown): void { target.decoderCache = "unsafe"; }
function updateApplicationState(target: unknown): void { target.commit(); }
`;
    expect(codes(source)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.externalStateWrite,
    );
  });

  test("allows mutation of invocation-local state and shadowed global names", () => {
    const source = withShapeCoreHook(`
  const local = { count: 0 };
  const queue: number[] = [];
  const window = { name: "local" };
  const process = { env: { DECODER_MODE: "local" } };
  local.count += 1;
  queue.push(1);
  window.name = "still-local";
  process.env.DECODER_MODE = "still-local";
`);
    expect(codes(source)).not.toContain(
      F2_DECODER_SOURCE_POLICY_CODES.externalStateWrite,
    );
  });

  test("requires exactly one own-key and descriptor snapshot routine", () => {
    const secondRoutine = `${BASE_DECODER}\nfunction secondSnapshot(input: object): void {\n  for (const key of Reflect.ownKeys(input)) Object.getOwnPropertyDescriptor(input, key);\n}`;
    const actual = codes(secondRoutine);
    expect(actual).toContain(F2_DECODER_SOURCE_POLICY_CODES.reflectionRoutine);
    expect(actual).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.reflectionOutsideRoutine,
    );
  });

  test("rejects direct reads, destructuring, Reflect.get, and input helpers", () => {
    expect(
      codes(withShapeCoreHook("readTitle(input);" ) + `\nfunction readTitle(value: unknown): void { void value.title; }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.taintedContainerRead);
    expect(
      codes(withShapeCoreHook("readTitle(input);" ) + `\nfunction readTitle(value: unknown): void { const { title } = value; void title; }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.taintedContainerRead);
    expect(
      codes(withShapeCoreHook("readTitle(input);" ) + `\nfunction readTitle(value: unknown): void { Reflect.get(value, "title"); }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.taintedContainerRead);
    expect(
      codes(withShapeCoreHook("readTitle(input);" ) + `\nfunction readTitle(value: unknown): void { value.map(() => 1); }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.taintedHelperCall);
  });

  test("rejects every syntactic family of tainted writes", () => {
    expect(
      codes(withShapeCoreHook("mutate(input);" ) + `\nfunction mutate(value: unknown): void { value.title = "x"; }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.taintedContainerWrite);
    expect(
      codes(withShapeCoreHook("mutate(input);" ) + `\nfunction mutate(value: unknown): void { Object.defineProperty(value, "title", { value: "x" }); }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.taintedContainerWrite);
    expect(
      codes(withShapeCoreHook("mutate(input);" ) + `\nfunction mutate(value: unknown): void { value.push("x"); }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.taintedContainerWrite);
  });

  test("rejects Object.assign, JSON.stringify, and tainted spread", () => {
    expect(codes(withShapeCoreHook("Object.assign({}, input);"))).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.objectAssign,
    );
    expect(codes(withShapeCoreHook("JSON.stringify(input);"))).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.jsonStringify,
    );
    expect(codes(withShapeCoreHook("consume([...input]);"))).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.untrustedSpread,
    );
  });

  test("requires an explicit local depth worklist loop", () => {
    const noLoop = BASE_DECODER.replace(
      "while (worklist.length > 0) {",
      "if (worklist.length > 0) {",
    );
    expect(codes(noLoop)).toContain(F2_DECODER_SOURCE_POLICY_CODES.depthWorklist);
  });

  test("rejects direct and indirect recursion reachable from depth preflight", () => {
    const recursive = BASE_DECODER.replace(
      "snapshotContainer(input);",
      "snapshotContainer(input);\n    depthPreflight(input, evidence);",
    );
    expect(codes(recursive)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.depthRecursion,
    );
  });

  test("requires both named counter-incrementing candidate factories", () => {
    const missing = BASE_DECODER.replace(
      "function allocateCandidateArray<Value>",
      "function renamedCandidateArray<Value>",
    );
    expect(codes(missing)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.candidateFactory,
    );
    const noCounter = BASE_DECODER.replace(
      "evidence.candidateObjectsAllocated += 1;",
      "void evidence.candidateObjectsAllocated;",
    );
    expect(codes(noCounter)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.candidateFactory,
    );
  });

  test("rejects candidate literals outside factories and F1 result attachment", () => {
    expect(
      codes(`${BASE_DECODER}\nfunction bypass(): void { const candidate: ProgressionDocumentShapeV2 = { schema: "changes.progression.v2" }; void candidate; }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.candidateOutsideFactory);
    expect(
      codes(`${BASE_DECODER}\nfunction attach(evidence: Evidence): void { const result = makeSpelledPitch({}); if (result.ok) allocateCandidateObject(evidence, { pitch: result.value }); }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.f1ContainerAttached);
  });

  test("forbids makeChordEvent even when its result is discarded", () => {
    expect(
      codes(`${BASE_DECODER}\nfunction bypass(): void { makeChordEvent({}); }`),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.makeChordEvent);
  });

  test("rejects clocks, timers, any, double casts, and candidate assertions", () => {
    expect(codes(withShapeCoreHook("if (Date.now() > 0) return {};"))).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.wallClock,
    );
    expect(codes(withShapeCoreHook("setTimeout(() => {}, 1);"))).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.wallClock,
    );
    expect(codes(withShapeCoreHook("const escaped = input as any; void escaped;"))).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.uncheckedAssertion,
    );
    expect(
      codes(withShapeCoreHook("const escaped = input as unknown as ProgressionDocumentShapeV2; void escaped;")),
    ).toContain(F2_DECODER_SOURCE_POLICY_CODES.uncheckedAssertion);
  });

  test("requires public/private wrappers to share one branch-free core", () => {
    const divergent = BASE_DECODER
      .replace(
        "function shapeCore(input: unknown): unknown {",
        "function otherShapeCore(input: unknown): unknown { return shapeCore(input); }\n\nfunction shapeCore(input: unknown): unknown {",
      )
      .replace(
        "export function decodeDocumentShapeWithEvidence(input: unknown): unknown {\n  return shapeCore(input);",
        "export function decodeDocumentShapeWithEvidence(input: unknown): unknown {\n  return otherShapeCore(input);",
      );
    expect(codes(divergent)).toContain(F2_DECODER_SOURCE_POLICY_CODES.sharedCore);

    const branch = BASE_DECODER.replace(
      "export function decodeDocumentShape(input: unknown): unknown {\n  return shapeCore(input).result;",
      "export function decodeDocumentShape(input: unknown): unknown {\n  if (input === null) return { ok: false };\n  return shapeCore(input).result;",
    );
    expect(codes(branch)).toContain(
      F2_DECODER_SOURCE_POLICY_CODES.publicWrapperBranch,
    );
  });

  test("finding order and source ranges are deterministic", () => {
    const source = `let retained: unknown;\n${BASE_DECODER}\nfunction bypass(): void { makeChordEvent({}); }`;
    const first = findings(source);
    const second = findings(source);
    expect(second).toEqual(first);
    expect(first.map((item) => item.start)).toEqual(
      [...first.map((item) => item.start)].sort((left, right) => left - right),
    );
    expect(first.every((item) => item.line > 0 && item.column > 0)).toBe(true);
  });
});

test("the real F2 decoder satisfies every settled production-source law", async () => {
  const report = await inspectF2DecoderSourcePolicy();
  expect(report).toEqual({
    schema: "changes.validation.f2-decoder-source-policy.v1",
    outcome: "pass",
    findings: [],
  });
});
