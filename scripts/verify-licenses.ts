import { sha256Hex } from "./foundation-io";

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
  assets: Array<{
    id: string;
    mime: string;
    bytes: number;
    sha256: string;
    source: string;
    license: string;
  }>;
};

const expectedOwnedAsset = {
  id: "changes-empty-favicon",
  mime: "image/svg+xml",
  source: "src/index.html#favicon",
  license: "LicenseRef-Project",
  payload: '<svg xmlns="http://www.w3.org/2000/svg"/>',
};

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

  if (report.assets.length !== 1) {
    throw new Error("LICENSE_ASSET_COUNT: expected the one source-owned favicon.");
  }
  const asset = report.assets[0];
  if (asset === undefined) {
    throw new Error("LICENSE_ASSET_MISSING: favicon provenance is absent.");
  }
  const payload = new TextEncoder().encode(expectedOwnedAsset.payload);
  if (
    asset.id !== expectedOwnedAsset.id ||
    asset.mime !== expectedOwnedAsset.mime ||
    asset.source !== expectedOwnedAsset.source ||
    asset.license !== expectedOwnedAsset.license ||
    asset.bytes !== payload.byteLength ||
    asset.sha256 !== (await sha256Hex(payload))
  ) {
    throw new Error("LICENSE_ASSET_MISMATCH: favicon provenance is stale.");
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
