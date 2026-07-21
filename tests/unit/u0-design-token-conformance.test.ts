import { describe, expect, test } from "bun:test";

/**
 * Independently transcribed from the frozen U0 token contract. Deliberately do
 * not import UI_TOKEN_DEFINITIONS: production data must not certify its CSS.
 */
const EXPECTED_TOKENS = Object.freeze({
  "--background": "#0b0d10",
  "--surface-app": "#0b0d10",
  "--surface-header": "#101318",
  "--surface-rail": "#11151b",
  "--surface-chart": "#151a21",
  "--surface-panel": "#191f27",
  "--surface-elevated": "#202832",
  "--surface-sunken": "#080a0d",
  "--surface-overlay": "rgb(3 5 8 / 0.72)",
  "--text-primary": "#f4f6f8",
  "--text-muted": "#aab3bf",
  "--text-subtle": "#8793a2",
  "--text-inverse": "#0b0d10",
  "--border-default": "#303946",
  "--border-strong": "#657487",
  "--action-primary": "#d6b15f",
  "--action-primary-hover": "#e3c477",
  "--action-secondary": "#26313d",
  "--state-info": "#75b7ff",
  "--state-success": "#70d69b",
  "--state-warning": "#f3c66c",
  "--state-error": "#ff8c8c",
  "--state-selected": "#375a72",
  "--focus-ring": "#8bc7ff",
  "--font-ui":
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  "--font-mono":
    "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-md": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.5rem",
  "--line-tight": "1.25",
  "--line-normal": "1.5",
  "--space-0": "0",
  "--space-1": "0.25rem",
  "--space-2": "0.5rem",
  "--space-3": "0.75rem",
  "--space-4": "1rem",
  "--space-5": "1.25rem",
  "--space-6": "1.5rem",
  "--space-8": "2rem",
  "--space-10": "2.5rem",
  "--space-12": "3rem",
  "--radius-xs": "0.25rem",
  "--radius-sm": "0.5rem",
  "--radius-md": "0.625rem",
  "--radius-lg": "0.9375rem",
  "--border-width": "1px",
  "--focus-width": "2px",
  "--focus-offset": "2px",
  "--motion-fast": "120ms",
  "--motion-deliberate": "180ms",
  "--motion-reduced": "0ms",
  "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
  "--rail-library-inline": "17rem",
  "--rail-harmony-inline": "20rem",
  "--transport-min-block": "4.5rem",
  "--sheet-context-reveal": "3rem",
  "--control-min-block": "2.25rem",
  "--touch-target": "2.75rem",
} as const);

const TOKEN_NAME_PATTERN = /--[a-z][a-z0-9-]*/gu;
const TOKEN_DECLARATION_PATTERN =
  /^\s*(--[a-z][a-z0-9-]*)\s*:\s*([^;\r\n]+)\s*;\s*$/gmu;

function rootBody(source: string): string {
  const match = /:root\s*\{(?<body>[\s\S]*?)\}/u.exec(source);
  const body = match?.groups?.["body"];
  if (body === undefined) throw new Error("tokens.css must contain one :root block");
  return body;
}

function tokenEntries(source: string): readonly (readonly [string, string])[] {
  const entries: Array<readonly [string, string]> = [];
  for (const match of source.matchAll(TOKEN_DECLARATION_PATTERN)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) {
      throw new Error("token declaration parser produced an incomplete match");
    }
    entries.push([name, value.trim()]);
  }
  return entries;
}

describe("U0 design-token CSS conformance", () => {
  test("publishes every frozen token with its exact serialized value", async () => {
    const source = await Bun.file(
      new URL("../../src/styles/tokens.css", import.meta.url),
    ).text();
    const body = rootBody(source);
    const entries = tokenEntries(body);
    const names = entries.map(([name]) => name);
    const expectedNames = Object.keys(EXPECTED_TOKENS);

    expect(entries).toHaveLength(expectedNames.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expectedNames);
    expect(Object.fromEntries(entries)).toEqual(EXPECTED_TOKENS);
  });

  test("declares contracted tokens exactly once and only inside :root", async () => {
    const source = await Bun.file(
      new URL("../../src/styles/tokens.css", import.meta.url),
    ).text();
    const body = rootBody(source);
    const allNames = Array.from(source.matchAll(TOKEN_NAME_PATTERN), (match) =>
      match[0],
    );
    const rootNames = tokenEntries(body).map(([name]) => name);

    expect(source.match(/:root\s*\{/gu)).toHaveLength(1);
    expect(allNames).toEqual(rootNames);
    expect(new Set(allNames)).toEqual(new Set(Object.keys(EXPECTED_TOKENS)));
  });
});
