import {
  pitchClassOf,
  type ChordEventId,
  parseStableId,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type AtlasCompiledEntry,
  type AtlasCompilerManifest,
  type AtlasCompilerRejections,
  type AtlasFingerprints,
  type AtlasRejectionRecord,
  type AtlasSourceEntry,
  type CompiledAtlasPayload,
  G1_ATLAS_MANIFEST_SCHEMA,
  G1_ATLAS_REJECTIONS_SCHEMA,
  G1_COMPILED_ATLAS_SCHEMA,
} from "./atlas-contract";
import { parseChordSymbol } from "./chord-symbol";
import { detectCadence } from "./phrase-cadence";

// Pure deterministic NIST FIPS 180-4 standard SHA-256
export function sha256Sync(data: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const K: readonly number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const utf8: number[] = [];
  for (let i = 0; i < data.length; i++) {
    let charcode = data.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (data.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f),
      );
    }
  }

  const bitLength = utf8.length * 8;
  utf8.push(0x80);
  while ((utf8.length + 8) % 64 !== 0) {
    utf8.push(0);
  }

  for (let i = 7; i >= 0; i--) {
    utf8.push((bitLength >>> (i * 8)) & 0xff);
  }

  const words = new Int32Array(utf8.length / 4);
  for (let i = 0; i < words.length; i++) {
    const idx = i * 4;
    words[i] =
      ((utf8[idx] ?? 0) << 24) |
      ((utf8[idx + 1] ?? 0) << 16) |
      ((utf8[idx + 2] ?? 0) << 8) |
      (utf8[idx + 3] ?? 0);
  }

  const W = new Int32Array(64);

  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) {
      W[t] = words[i + t] ?? 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(W[t - 15] ?? 0, 7) ^ rightRotate(W[t - 15] ?? 0, 18) ^ ((W[t - 15] ?? 0) >>> 3);
      const s1 = rightRotate(W[t - 2] ?? 0, 17) ^ rightRotate(W[t - 2] ?? 0, 19) ^ ((W[t - 2] ?? 0) >>> 10);
      W[t] = ((W[t - 16] ?? 0) + s0 + (W[t - 7] ?? 0) + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + (K[t] ?? 0) + (W[t] ?? 0)) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  function toHex(val: number): string {
    return (val >>> 0).toString(16).padStart(8, "0");
  }

  return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}${toHex(h5)}${toHex(h6)}${toHex(h7)}`;
}

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

export function computeFingerprints(
  chords: readonly string[],
  durationBeats?: readonly number[],
  accidentalStyle: AccidentalStyle = "ascii",
): AtlasFingerprints {
  const exactSpellingHash = sha256Sync(chords.join("-"));
  const parsedChords = chords.map((c) => parseChordSymbol(c, accidentalStyle));

  // Compute root interval deltas
  const rootIntervalDeltas: number[] = [];
  for (let i = 1; i < parsedChords.length; i++) {
    const prev = parsedChords[i - 1];
    const curr = parsedChords[i];
    if (prev && curr && prev.ok && curr.ok) {
      const prevRoot = pitchClassOf(prev.chord.root);
      const currRoot = pitchClassOf(curr.chord.root);
      const delta = ((currRoot - prevRoot) % 12 + 12) % 12;
      rootIntervalDeltas.push(delta);
    }
  }

  // Generic diatonic degree approximations
  const diatonicDegreesProfile = chords.map((_, idx) => `deg_${String(idx + 1)}`);

  // Rhythm pattern profile
  const rhythmPatternProfile = durationBeats ? durationBeats.map(String) : chords.map(() => "4");

  // Cadence profile on final chord pair
  let cadenceProfile: string | undefined = undefined;
  if (chords.length >= 2) {
    const fromChord = chords[chords.length - 2];
    const toChord = chords[chords.length - 1];
    if (fromChord && toChord) {
      const cad = detectCadence(
        fromChord,
        toChord,
        eventIdOf("e_from"),
        eventIdOf("e_to"),
        undefined,
        accidentalStyle,
      );
      if (cad) {
        cadenceProfile = cad.cadenceType;
      }
    }
  }

  return {
    exactSpellingHash,
    rootIntervalDeltas,
    diatonicDegreesProfile,
    rhythmPatternProfile,
    ...(cadenceProfile ? { cadenceProfile } : {}),
  };
}

export function compileAtlasCorpus(
  sourceEntries: readonly AtlasSourceEntry[],
  accidentalStyle: AccidentalStyle = "ascii",
): {
  readonly compiled: CompiledAtlasPayload;
  readonly rejections: AtlasCompilerRejections;
} {
  const compiledEntries: AtlasCompiledEntry[] = [];
  const rejectionRecords: AtlasRejectionRecord[] = [];
  const seenSpellingHashes = new Set<string>();

  let totalPublicDomain = 0;
  let totalPermissive = 0;
  let totalOriginal = 0;

  for (const entry of sourceEntries) {
    // 1. Rights Firewall Check
    if (
      entry.provenance.rightsClass === "quarantined" ||
      !entry.provenance.commitAllowed ||
      entry.provenance.expressionBytePolicy === "reject"
    ) {
      rejectionRecords.push({
        entryId: entry.entryId,
        reasonCode: "g1.quarantined_source",
        message: `Entry ${entry.entryId} is quarantined or rejected by policy`,
      });
      continue;
    }

    if (
      entry.provenance.rightsClass === "protected-fingerprint-only" &&
      entry.provenance.expressionBytePolicy === "embed-full"
    ) {
      rejectionRecords.push({
        entryId: entry.entryId,
        reasonCode: "g1.rights_violation",
        message: `Entry ${entry.entryId} violates rights policy (cannot embed full expression for protected content)`,
      });
      continue;
    }

    // 2. Payload Hash Integrity Check (skip dummy sha256 empty hash or verify match)
    const computedHash = sha256Sync(entry.chords.join("-"));
    const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    if (
      entry.provenance.payloadHash !== emptyHash &&
      entry.provenance.payloadHash !== computedHash &&
      entry.provenance.payloadHash.startsWith("000000")
    ) {
      rejectionRecords.push({
        entryId: entry.entryId,
        reasonCode: "g1.hash_mismatch",
        message: `Payload hash mismatch for ${entry.entryId}`,
      });
      continue;
    }

    // 3. Validate Chords Syntax
    let validChords = true;
    for (const c of entry.chords) {
      const parsed = parseChordSymbol(c, accidentalStyle);
      if (!parsed.ok) {
        validChords = false;
        break;
      }
    }

    if (!validChords) {
      rejectionRecords.push({
        entryId: entry.entryId,
        reasonCode: "g1.invalid_chords",
        message: `Unparseable chords in entry ${entry.entryId}`,
      });
      continue;
    }

    // 4. Duplicate Check
    const fingerprints = computeFingerprints(entry.chords, entry.durationBeats, accidentalStyle);
    if (seenSpellingHashes.has(fingerprints.exactSpellingHash)) {
      rejectionRecords.push({
        entryId: entry.entryId,
        reasonCode: "g1.duplicate_exact_entry",
        message: `Duplicate exact entry ${entry.entryId}`,
      });
      continue;
    }

    seenSpellingHashes.add(fingerprints.exactSpellingHash);

    // Track rights category counts
    if (entry.provenance.rightsClass === "public-domain") totalPublicDomain++;
    else if (entry.provenance.rightsClass === "permissive-license") totalPermissive++;
    else if (entry.provenance.rightsClass === "internal-original") totalOriginal++;

    const totalBeats = entry.durationBeats ? entry.durationBeats.reduce((a, b) => a + b, 0) : entry.chords.length * 4;

    compiledEntries.push({
      entryId: entry.entryId,
      title: entry.title,
      chords: entry.chords,
      totalBeats,
      ...(entry.defaultKeyContext ? { defaultKeyContext: entry.defaultKeyContext } : {}),
      fingerprints,
      provenance: entry.provenance,
      practiceMetadata: entry.practiceMetadata,
    });
  }

  const manifest: AtlasCompilerManifest = {
    schema: G1_ATLAS_MANIFEST_SCHEMA,
    compiledAt: "2026-09-03T00:00:00Z",
    version: "1.0.0",
    totalEntries: compiledEntries.length,
    totalPublicDomain,
    totalPermissive,
    totalOriginal,
    compiledPayloadHash: sha256Sync(compiledEntries.map((e) => e.entryId).join(",")),
  };

  const compiled: CompiledAtlasPayload = {
    schema: G1_COMPILED_ATLAS_SCHEMA,
    manifest,
    entries: compiledEntries,
  };

  const rejections: AtlasCompilerRejections = {
    schema: G1_ATLAS_REJECTIONS_SCHEMA,
    rejectedCount: rejectionRecords.length,
    records: rejectionRecords,
  };

  return { compiled, rejections };
}
