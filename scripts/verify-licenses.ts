import {
  CONCERT_GRAND_WASM_BYTE_LENGTH,
  CONCERT_GRAND_WASM_SHA256,
} from "../src/audio/wasm/concert-grand-wasm";
import {
  PIANO_ATTACK_SAMPLES_ATTRIBUTION,
  PIANO_ATTACK_SAMPLES_BYTE_LENGTH,
  PIANO_ATTACK_SAMPLES_LICENSE,
  PIANO_ATTACK_SAMPLES_SHA256,
  PIANO_ATTACK_SAMPLE_RATE_HZ,
} from "../src/audio/wasm/piano-attack-samples";
import { sha256Hex } from "./foundation-io";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

type Ledger = {
  records: Array<{
    name: string;
    version: string;
    class: string;
    bundledInArtifact: boolean;
    license: string;
    source: string;
  }>;
};

type LicenseReport = {
  schemaVersion: number;
  packages: Array<{
    name: string;
    version: string;
    license: string;
    source: string;
    bundledInArtifact: boolean;
    noticeEmbedded: boolean;
    licenseTextSha256: string;
  }>;
  wasmCompiled: Array<{
    name: string;
    version: string;
    license: string;
    source: string;
    bundledInArtifact: boolean;
    embedding: string;
    description: string;
  }>;
  assets: Array<{
    id: string;
    mime: string;
    bytes: number;
    sha256: string;
    source: string;
    license: string;
    embedding: string;
    generator?: string;
    attribution?: string;
  }>;
};

const expectedOwnedAsset = {
  id: "changes-empty-favicon",
  mime: "image/svg+xml",
  source: "src/index.html#favicon",
  license: "LicenseRef-Project",
  embedding: "data-url",
  payload: '<svg xmlns="http://www.w3.org/2000/svg"/>',
};

const expectedWasmAsset = {
  id: "concert-grand-dsp-wasm",
  mime: "application/wasm",
  source: "dsp/concert-grand",
  generator: "scripts/build-dsp.ts",
  license: "MIT (project) + libm MIT OR Apache-2.0",
  embedding: "inline-script-base64",
};

/*
 * The recorded piano attack payload is third-party content under an
 * attribution license, so the inventory must carry the credit line verbatim
 * as well as the digest, and both are pinned to the generated module rather
 * than restated here.
 */
const expectedPianoAsset = {
  id: "salamander-piano-attack-pcm",
  mime: `audio/L16;rate=${String(PIANO_ATTACK_SAMPLE_RATE_HZ)};channels=1`,
  source: "SalamanderGrandPianoV3_44.1khz16bit",
  generator: "scripts/build-piano-samples.ts",
  license: PIANO_ATTACK_SAMPLES_LICENSE,
  embedding: "inline-script-base64",
  attribution: PIANO_ATTACK_SAMPLES_ATTRIBUTION,
};

/*
 * The sampled upright-bass and vibraphone payloads were replaced by physical
 * models (jcpe-sample-elimination-physical-qzgo) and no longer ship in the
 * artifact, so the inventory carries no sampled-asset rows. The recordings
 * remain in the repository as the replacement gate's reference corpora.
 */

export async function verifyLicenses(): Promise<{
  schema: "jcpe.verify-licenses.v1";
  outcome: "pass";
  packages: number;
  assets: number;
}> {
  const ledger = await Bun.file(
    "tests/fixtures/foundation/toolchain-ledger.json",
  ).json() as Ledger;
  const report = await Bun.file("dist/licenses.json").json() as LicenseReport;
  const expected = ledger.records.filter(
    (record) => record.class === "production" && record.bundledInArtifact,
  );
  if (report.schemaVersion !== 1 || report.packages.length !== expected.length) {
    throw new Error("LICENSE_REPORT_SHAPE: production package count mismatch.");
  }

  for (const record of expected) {
    const actual = report.packages.find((item) => item.name === record.name);
    if (
      !actual ||
      actual.version !== record.version ||
      actual.license !== record.license ||
      actual.source !== record.source ||
      !actual.bundledInArtifact ||
      !actual.noticeEmbedded
    ) {
      throw new Error(`LICENSE_REPORT_MISMATCH: ${record.name}`);
    }
    const licensePath = `node_modules/${record.name}/LICENSE`;
    if (!(await Bun.file(licensePath).exists())) {
      throw new Error(`LICENSE_FILE_MISSING: ${licensePath}`);
    }
    const digest = await sha256Hex(await Bun.file(licensePath).text());
    if (actual.licenseTextSha256 !== digest) {
      throw new Error(`LICENSE_DIGEST_MISMATCH: ${record.name}`);
    }
  }

  const expectedWasmCompiled = ledger.records.filter(
    (record) => record.class === "compiled-into-wasm" && record.bundledInArtifact,
  );
  if (report.wasmCompiled.length !== expectedWasmCompiled.length) {
    throw new Error("LICENSE_WASM_PROVENANCE_COUNT: wasm-compiled crate count mismatch.");
  }
  for (const record of expectedWasmCompiled) {
    const actual = report.wasmCompiled.find((item) => item.name === record.name);
    if (
      !actual ||
      actual.version !== record.version ||
      actual.license !== record.license ||
      actual.source !== record.source ||
      !actual.bundledInArtifact ||
      actual.embedding !== "compiled-into-wasm" ||
      typeof actual.description !== "string" ||
      !actual.description.includes("not a JavaScript dependency")
    ) {
      throw new Error(`LICENSE_WASM_PROVENANCE_MISMATCH: ${record.name}`);
    }
  }

  if (report.assets.length !== 6) {
    throw new Error(
      "LICENSE_ASSET_COUNT: expected the source-owned favicon, the " +
        "concert-grand wasm payload, the recorded piano attack payload, " +
        "and the three OFL variable-font payloads (the CC0 sampled " +
        "payloads retired with their physical replacements).",
    );
  }

  /*
   * The v2 identity's embedded OFL fonts (build-fonts.ts data-url payloads).
   * Each must declare its OFL license with the checked-in license text path
   * and carry a woff2 MIME and a css-data-url embedding; the digests are
   * pinned by the build against the generated fonts.css, so here the
   * inventory's shape and licensing claims are what is verified.
   */
  const expectedFontAssets = [
    { id: "archivo-variable-latin", licenseText: "assets/fonts/OFL-archivo.txt" },
    { id: "literata-variable-latin", licenseText: "assets/fonts/OFL-literata.txt" },
    {
      id: "literata-variable-latin-italic",
      licenseText: "assets/fonts/OFL-literata.txt",
    },
  ];
  for (const expectedFont of expectedFontAssets) {
    const fontAsset = report.assets.find(
      (item) => item.id === expectedFont.id,
    );
    if (fontAsset === undefined) {
      throw new Error(
        `LICENSE_ASSET_MISSING: ${expectedFont.id} provenance is absent.`,
      );
    }
    if (
      fontAsset.mime !== "font/woff2" ||
      fontAsset.embedding !== "css-data-url" ||
      fontAsset.license !== `OFL-1.1 (${expectedFont.licenseText})` ||
      !SHA256_HEX.test(fontAsset.sha256) ||
      fontAsset.bytes <= 0
    ) {
      throw new Error(
        `LICENSE_ASSET_MISMATCH: ${expectedFont.id} provenance is malformed.`,
      );
    }
    if (!(await Bun.file(expectedFont.licenseText).exists())) {
      throw new Error(
        `LICENSE_FILE_MISSING: ${expectedFont.licenseText}`,
      );
    }
  }
  const asset = report.assets.find((item) => item.id === expectedOwnedAsset.id);
  if (asset === undefined) {
    throw new Error("LICENSE_ASSET_MISSING: favicon provenance is absent.");
  }
  const payload = new TextEncoder().encode(expectedOwnedAsset.payload);
  if (
    asset.mime !== expectedOwnedAsset.mime ||
    asset.source !== expectedOwnedAsset.source ||
    asset.license !== expectedOwnedAsset.license ||
    asset.embedding !== expectedOwnedAsset.embedding ||
    asset.bytes !== payload.byteLength ||
    asset.sha256 !== (await sha256Hex(payload))
  ) {
    throw new Error("LICENSE_ASSET_MISMATCH: favicon provenance is stale.");
  }

  const wasmAsset = report.assets.find(
    (item) => item.id === expectedWasmAsset.id,
  );
  if (wasmAsset === undefined) {
    throw new Error("LICENSE_ASSET_MISSING: wasm payload provenance is absent.");
  }
  if (
    wasmAsset.mime !== expectedWasmAsset.mime ||
    wasmAsset.source !== expectedWasmAsset.source ||
    wasmAsset.generator !== expectedWasmAsset.generator ||
    wasmAsset.license !== expectedWasmAsset.license ||
    wasmAsset.embedding !== expectedWasmAsset.embedding ||
    wasmAsset.bytes !== CONCERT_GRAND_WASM_BYTE_LENGTH ||
    wasmAsset.sha256 !== CONCERT_GRAND_WASM_SHA256
  ) {
    throw new Error(
      "LICENSE_ASSET_MISMATCH: wasm payload provenance does not match the generated module pins.",
    );
  }

  const pianoAsset = report.assets.find(
    (item) => item.id === expectedPianoAsset.id,
  );
  if (pianoAsset === undefined) {
    throw new Error(
      "LICENSE_ASSET_MISSING: piano attack payload provenance is absent.",
    );
  }
  if (
    pianoAsset.mime !== expectedPianoAsset.mime ||
    pianoAsset.source !== expectedPianoAsset.source ||
    pianoAsset.generator !== expectedPianoAsset.generator ||
    pianoAsset.license !== expectedPianoAsset.license ||
    pianoAsset.embedding !== expectedPianoAsset.embedding ||
    pianoAsset.attribution !== expectedPianoAsset.attribution ||
    pianoAsset.bytes !== PIANO_ATTACK_SAMPLES_BYTE_LENGTH ||
    pianoAsset.sha256 !== PIANO_ATTACK_SAMPLES_SHA256
  ) {
    throw new Error(
      "LICENSE_ASSET_MISMATCH: piano attack payload provenance does not match the generated module pins.",
    );
  }
  if (!pianoAsset.attribution.includes("CC-BY-3.0")) {
    throw new Error(
      "LICENSE_ASSET_ATTRIBUTION: the recorded piano payload must carry its CC-BY credit.",
    );
  }

  for (const retiredSampledId of [
    "vsco2-contrabass-pizz-pcm",
    "vcsl-vibraphone-soft-pcm",
  ] as const) {
    if (report.assets.some((item) => item.id === retiredSampledId)) {
      throw new Error(
        `LICENSE_ASSET_RETIRED: ${retiredSampledId} must not ship after its physical replacement.`,
      );
    }
  }

  return {
    schema: "jcpe.verify-licenses.v1",
    outcome: "pass",
    packages: report.packages.length,
    assets: report.assets.length,
  };
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await verifyLicenses(), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.verify-licenses.v1",
          outcome: "fail",
          message: error instanceof Error ? error.message : "Unknown license failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
