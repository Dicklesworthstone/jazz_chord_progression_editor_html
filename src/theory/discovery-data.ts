import { DISCOVERY_EXECUTION_LIMITS as L, type DiscoveryAllocation, type DiscoveryArena,
  type DiscoveryRefusal, type DiscoveryValue } from "./discovery-execution-contract";

type Scan = { nodes: number; bytes: number; units: number; charge: number;
  maximum: number; ancestors: object[]; refusal: DiscoveryRefusal | null };
const failed = (scan: Scan, code: DiscoveryRefusal["code"], path: readonly (string | number)[]): false => {
  scan.refusal ??= Object.freeze({ code, path: Object.freeze([...path]) });
  return false;
};
function textSize(value: string): { bytes: number; units: number } | null {
  if (value.length > L.textCodeUnits) return null;
  let bytes = 2, units = 2;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = value.charCodeAt(i + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return null;
      bytes += 4; units += 2; i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) return null;
    else if (c === 34 || c === 92 || [8, 9, 10, 12, 13].includes(c)) { bytes += 2; units += 2; }
    else if (c < 32) { bytes += 6; units += 6; }
    else { bytes += c < 128 ? 1 : c < 2048 ? 2 : 3; units += 1; }
  }
  return { bytes, units };
}
function token(scan: Scan, bytes: number, units = bytes): boolean {
  if (bytes > scan.maximum - scan.bytes) return false;
  scan.bytes += bytes; scan.units += units;
  return true;
}
function scanValue(value: unknown, scan: Scan, path: readonly (string | number)[]): value is DiscoveryValue {
  if (++scan.nodes > L.valueNodes || path.length > L.valueDepth) return failed(scan, "discovery.input-limit", path);
  if (typeof value === "string") {
    if (value.length > L.textCodeUnits) return failed(scan, "discovery.input-limit", path);
    const size = textSize(value);
    if (size === null) return failed(scan, "discovery.invalid-request", path);
    scan.charge += 8 + value.length * 2;
    return token(scan, size.bytes, size.units) || failed(scan, "discovery.input-limit", path);
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) return failed(scan, "discovery.invalid-request", path);
    scan.charge += 8;
    return token(scan, JSON.stringify(value).length) || failed(scan, "discovery.input-limit", path);
  }
  if (typeof value !== "object" || scan.ancestors.includes(value)) return failed(scan, "discovery.invalid-request", path);
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if ((array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) || Object.getOwnPropertySymbols(value).length !== 0) {
    return failed(scan, "discovery.invalid-request", path);
  }
  const names = Object.getOwnPropertyNames(value);
  if (names.length > L.valueNodes - scan.nodes + (array ? 1 : 0)) return failed(scan, "discovery.input-limit", path);
  const lengthDescriptor = array ? Object.getOwnPropertyDescriptor(value, "length") : undefined;
  const length: unknown = lengthDescriptor?.value;
  if (array && (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 ||
    length > L.valueNodes || names.length !== length + 1)) return failed(scan, "discovery.invalid-request", path);
  scan.charge += 32;
  if (!token(scan, 2)) return failed(scan, "discovery.input-limit", path);
  scan.ancestors.push(value);
  let entries = 0;
  for (const name of names) {
    if (array && name === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) ||
      (array && (typeof length !== "number" || !/^(0|[1-9][0-9]*)$/u.test(name) || Number(name) >= length))) {
      return failed(scan, "discovery.invalid-request", [...path, name]);
    }
    if (entries > 0 && !token(scan, 1)) return failed(scan, "discovery.input-limit", path);
    if (!array) {
      if (name.length > L.textCodeUnits) return failed(scan, "discovery.input-limit", [...path, name]);
      const size = textSize(name);
      if (size === null) return failed(scan, "discovery.invalid-request", [...path, name]);
      scan.charge += 8 + name.length * 2;
      if (!token(scan, size.bytes + 1, size.units + 1)) return failed(scan, "discovery.input-limit", path);
    }
    const child: unknown = descriptor.value;
    if (child !== null && typeof child === "object") scan.charge += 8;
    if (!scanValue(child, scan, [...path, array ? Number(name) : name])) return false;
    entries += 1;
  }
  scan.ancestors.pop();
  return true;
}
function isArray(value: DiscoveryValue): value is readonly DiscoveryValue[] { return Array.isArray(value); }
function scanPassiveData(value: unknown, scan: Scan): value is DiscoveryValue {
  try { return scanValue(value, scan, []); }
  catch { return failed(scan, "discovery.invalid-request", []); }
}
function copy(value: DiscoveryValue): DiscoveryValue {
  if (value === null || typeof value !== "object") return Object.is(value, -0) ? 0 : value;
  if (isArray(value)) return Object.freeze(value.map(copy));
  const result: Record<string, DiscoveryValue> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) throw new Error("Admitted discovery data changed during synchronous copy");
    Object.defineProperty(result, key, { value: copy(child), enumerable: true });
  }
  return Object.freeze(result);
}
function encode(value: DiscoveryValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (isArray(value)) return `[${value.map(encode).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => {
    const child = value[key];
    if (child === undefined) throw new Error("Immutable discovery data lost a field");
    return `${JSON.stringify(key)}:${encode(child)}`;
  }).join(",")}}`;
}

export type CapturedDiscoveryValue = Readonly<{
  value: DiscoveryValue;
  canonical: string;
  bytes: number;
  graphCharge: number;
  reservation: DiscoveryAllocation;
}>;
/** Capture/result records, ownership-set entries and queue/option wrappers. */
export const DISCOVERY_CAPTURE_BOOKKEEPING_BYTES = 1024;
export function captureDiscoveryValue(input: unknown, arena: DiscoveryArena, maximumBytes: number = L.requestBytes,
  maximumGraphBytes: number = L.trackedBytes):
  Readonly<{ ok: true; value: CapturedDiscoveryValue }> | Readonly<{ ok: false; refusal: DiscoveryRefusal }> {
  const scan: Scan = { nodes: 0, bytes: 0, units: 0, charge: 0, maximum: maximumBytes, ancestors: [], refusal: null };
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || maximumBytes > L.resultBytes || !scanPassiveData(input, scan)) {
    return Object.freeze({ ok: false, refusal: scan.refusal ?? Object.freeze({ code: "discovery.invalid-request", path: [] }) });
  }
  if (!Number.isSafeInteger(maximumGraphBytes) || maximumGraphBytes < 0 ||
    maximumGraphBytes > L.trackedBytes || scan.charge > maximumGraphBytes) {
    return Object.freeze({ ok: false, refusal: Object.freeze({ code: "discovery.input-limit", path: Object.freeze(["graphBytes"]) }) });
  }
  // Frozen graph, canonical UTF-16 string, return record and bounded copy/encode
  // workspace all reserve before the retained objects are materialized.
  const reservation = arena.reserve(scan.charge + 8 + scan.units * 2 + DISCOVERY_CAPTURE_BOOKKEEPING_BYTES + scan.charge + scan.units * 2);
  if (reservation === null) return Object.freeze({ ok: false,
    refusal: Object.freeze({ code: "discovery.input-limit", path: Object.freeze(["trackedBytes"]) }) });
  try {
    const value = copy(input);
    const canonical = encode(value);
    if (canonical.length !== scan.units) throw new Error("Discovery data changed during admission");
    return Object.freeze({ ok: true, value: Object.freeze({ value, canonical, bytes: scan.bytes,
      graphCharge: scan.charge, reservation }) });
  } catch {
    arena.release(reservation);
    return Object.freeze({ ok: false, refusal: Object.freeze({ code: "discovery.invalid-request", path: [] }) });
  }
}
