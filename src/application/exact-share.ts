import type { ValidatedDocument } from "../domain";
import { serializeCanonicalDocument } from "../export";
import { decodeShareFragment, MAX_SHARE_FRAGMENT_CHARS, type SharePayload, type ShareResult } from "./studio-share";

export const EXACT_SHARE_PREFIX = "#zdoc=2.";
export const MAX_EXACT_SHARE_BYTES = 6_138;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const encodingRefusal = (): ShareResult<never> => ({ ok: false, code: "share.encoding_invalid",
  message: "The link is not canonical base64url UTF-8. Ask for a fresh link or the exact JSON file." });
const limitRefusal = (): ShareResult<never> => ({ ok: false, code: "share.limit_exceeded",
  message: "This chart is too large for an exact link. Download exact JSON to share every note and setting." });

/** Whitespace-only compaction of trusted E0 output: preserve escapes and -0.
 * JSON.parse/stringify would silently turn the valid persisted token -0 into 0. */
export function compactCanonicalShareDocument(document: ValidatedDocument): string {
  const source = serializeCanonicalDocument(document);
  let quoted = false, escaped = false, result = "";
  for (const char of source) {
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') { quoted = true; result += char; }
    else if (char !== " " && char !== "\n" && char !== "\r" && char !== "\t") result += char;
  }
  return result;
}

/** Transport codec only; decoded text is not a document until E0/F2/F3 accept it. */
export function encodeExactShareText(text: string): ShareResult<string> {
  if (text.length > MAX_EXACT_SHARE_BYTES) return limitRefusal();
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_EXACT_SHARE_BYTES) return limitRefusal();
  if (bytes.length === 0) return encodingRefusal();
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { ok: true, value: EXACT_SHARE_PREFIX + btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "") };
}

export function encodeExactShareDocument(document: ValidatedDocument): ShareResult<string> {
  return encodeExactShareText(compactCanonicalShareDocument(document));
}

export function decodeExactShareText(fragment: string): ShareResult<string> {
  if (fragment.length > MAX_SHARE_FRAGMENT_CHARS) return limitRefusal();
  if (!fragment.startsWith(EXACT_SHARE_PREFIX)) return { ok: false, code: "share.version_unsupported",
    message: "This link uses a version this app cannot open. Ask for the exact JSON file." };
  const encoded = fragment.slice(EXACT_SHARE_PREFIX.length), remainder = encoded.length % 4;
  const byteLength = Math.floor(encoded.length * 3 / 4);
  if (byteLength > MAX_EXACT_SHARE_BYTES) return limitRefusal();
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || remainder === 1) return encodingRefusal();
  const last = ALPHABET.indexOf(encoded.charAt(encoded.length - 1));
  if ((remainder === 2 && (last & 15) !== 0) || (remainder === 3 && (last & 3) !== 0)) return encodingRefusal();
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - remainder) % 4));
    const bytes = new Uint8Array(byteLength);
    for (let index = 0; index < byteLength; index++) bytes[index] = binary.charCodeAt(index);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return encodingRefusal();
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch { return encodingRefusal(); }
}

export type SharedStartupPayload = Readonly<{ version: 1; payload: SharePayload }> | Readonly<{ version: 2; text: string }>;
export function decodeSharedStartup(fragment: string): ShareResult<SharedStartupPayload> {
  // Both decoders check the full length before slicing or decoding.
  if (fragment.startsWith(EXACT_SHARE_PREFIX)) {
    const result = decodeExactShareText(fragment);
    return result.ok ? { ok: true, value: { version: 2, text: result.value } } : result;
  }
  const result = decodeShareFragment(fragment);
  return result.ok ? { ok: true, value: { version: 1, payload: result.value } } : result;
}

/** URL data is injected by the root. Constructing a URL does not make a request. */
export function exactShareUrl(location: string, fragment: string): string | null {
  try {
    const url = new URL(location);
    if (url.protocol === "file:") return `https://jazzchords.org/${fragment}`;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname}${fragment}`;
  } catch { return null; }
}
