import { mkdir, rename } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export async function sha256Hex(
  value: string | Uint8Array,
): Promise<string> {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : Uint8Array.from(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Buffer.from(digest).toString("base64");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => lexicalCompare(left, right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export async function atomicWrite(
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp`;
  await Bun.write(temporary, content);
  await rename(temporary, absolute);
}

export async function hashSourceTree(root: string): Promise<string> {
  const absoluteRoot = resolve(root);
  const files: string[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const file of glob.scan({
    cwd: absoluteRoot,
    dot: true,
    onlyFiles: true,
  })) {
    files.push(file);
  }
  files.sort(lexicalCompare);

  const hasher = new Bun.CryptoHasher("sha256");
  for (const file of files) {
    const bytes = new Uint8Array(await Bun.file(resolve(absoluteRoot, file)).arrayBuffer());
    const name = relative(absoluteRoot, resolve(absoluteRoot, file)).replaceAll("\\", "/");
    hasher.update(`${String(name.length)}:${name}:${String(bytes.length)}:`);
    hasher.update(bytes);
  }
  return hasher.digest("hex");
}

export async function assertByteEqual(
  leftPath: string,
  rightPath: string,
): Promise<void> {
  const [left, right] = await Promise.all([
    Bun.file(leftPath).arrayBuffer(),
    Bun.file(rightPath).arrayBuffer(),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  if (
    leftBytes.length !== rightBytes.length ||
    leftBytes.some((byte, index) => byte !== rightBytes[index])
  ) {
    throw new Error(
      `ARTIFACT_STALE: ${leftPath} and ${rightPath} are not byte-identical.`,
    );
  }
}
