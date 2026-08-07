import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  generateRustParameterTable,
  parameterPackContentSha256,
  validateParameterPack,
} from "../../scripts/physical-foundry";
import {
  CLARINET_V2_PARAMETER_PACK_SHA256,
  physicalParameterPackSha256,
} from "../../src/audio";
import clarinetPack from "../../physical/parameter-packs/clarinet-v2.json";
import provenanceLedger from "../fixtures/physical-foundry/provenance-ledger.json";

const GENERATED_RUST = new URL(
  "../../dsp/concert-grand/src/clarinet_v2_parameters.rs",
  import.meta.url,
);

describe("clarinet-v2 reviewed parameter pack", () => {
  test("canonical JSON, application identity, and generated Rust are byte-locked", () => {
    expect(validateParameterPack(clarinetPack, provenanceLedger)).toEqual({
      outcome: "accept",
      findings: [],
    });
    expect(parameterPackContentSha256(clarinetPack)).toBe(
      CLARINET_V2_PARAMETER_PACK_SHA256,
    );
    expect(clarinetPack.contentSha256).toBe(
      CLARINET_V2_PARAMETER_PACK_SHA256,
    );
    expect(physicalParameterPackSha256("clarinet")).toBe(
      CLARINET_V2_PARAMETER_PACK_SHA256,
    );

    const generated = generateRustParameterTable(
      clarinetPack,
      provenanceLedger,
    );
    if (generated === null) throw new Error("CLARINET_V2_PACK_REFUSED");
    expect(readFileSync(GENERATED_RUST, "utf8")).toBe(generated);
  });

  test("other families retain distinct deterministic pre-pack identities", () => {
    expect(physicalParameterPackSha256("flute")).toHaveLength(64);
    expect(physicalParameterPackSha256("flute")).not.toBe(
      CLARINET_V2_PARAMETER_PACK_SHA256,
    );
    expect(physicalParameterPackSha256("guitar")).not.toBe(
      physicalParameterPackSha256("flute"),
    );
  });
});
