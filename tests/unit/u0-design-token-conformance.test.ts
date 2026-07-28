import { describe, expect, test } from "bun:test";

/**
 * Independently transcribed from the frozen U0 token contract. Deliberately do
 * not import UI_TOKEN_DEFINITIONS: production data must not certify its CSS.
 * The 2026-07-28 owner-directed overhaul (jcpe-yngr) introduced the warm Stage
 * dark base, the Paper light overrides, the brass accent family, elevation
 * shadows, and the chord type scale; both transcriptions below were re-read
 * against docs and fixture at that landing.
 */
const EXPECTED_BASE_TOKENS = Object.freeze({
  "--background": "#0e0c09",
  "--surface-app": "#0e0c09",
  "--surface-header": "#14110d",
  "--surface-rail": "#16130e",
  "--surface-chart": "#1a1611",
  "--surface-panel": "#1d1913",
  "--surface-elevated": "#262019",
  "--surface-sunken": "#0a0806",
  "--surface-overlay": "rgb(8 6 3 / 0.76)",
  "--text-primary": "#f6f2e9",
  "--text-muted": "#c2b9a8",
  "--text-subtle": "#a89e8b",
  "--text-inverse": "#14110d",
  "--border-default": "#3b342a",
  "--border-strong": "#83765f",
  "--action-primary": "#d6b15f",
  "--action-primary-hover": "#e5c67d",
  "--action-secondary": "#2b2418",
  "--state-info": "#7db8ff",
  "--state-success": "#74d69e",
  "--state-warning": "#edc26a",
  "--state-error": "#ff9090",
  "--state-selected": "#4a3d21",
  "--focus-ring": "#ffd48a",
  "--accent": "#e8b45a",
  "--accent-strong": "#f4cd85",
  "--accent-soft": "#5c4a24",
  "--on-accent": "#14110d",
  "--shadow-1": "0 1px 2px rgb(0 0 0 / 0.4)",
  "--shadow-2": "0 2px 8px rgb(0 0 0 / 0.45)",
  "--shadow-3": "0 8px 28px rgb(0 0 0 / 0.5)",
  "--glow-accent":
    "0 0 0 1px rgb(232 180 90 / 0.55), 0 0 18px rgb(232 180 90 / 0.25)",
  "--font-ui":
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  "--font-mono":
    "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  "--font-chord":
    "'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-md": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.5rem",
  "--text-chord": "1.375rem",
  "--text-chord-super": "0.66em",
  "--text-display": "1.875rem",
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

const EXPECTED_LIGHT_TOKENS = Object.freeze({
  "--background": "#f3ecdd",
  "--surface-app": "#f3ecdd",
  "--surface-header": "#ece3d0",
  "--surface-rail": "#efe7d6",
  "--surface-chart": "#f8f3e8",
  "--surface-panel": "#faf6ee",
  "--surface-elevated": "#ffffff",
  "--surface-sunken": "#e5dbc6",
  "--surface-overlay": "rgb(58 48 28 / 0.45)",
  "--text-primary": "#262015",
  "--text-muted": "#544a36",
  "--text-subtle": "#665b44",
  "--text-inverse": "#fdfaf3",
  "--border-default": "#cbbfa4",
  "--border-strong": "#7d7052",
  "--action-primary": "#7d5c14",
  "--action-primary-hover": "#65490e",
  "--action-secondary": "#e6dcc4",
  "--state-info": "#155a9e",
  "--state-success": "#136b3f",
  "--state-warning": "#7a5a10",
  "--state-error": "#a52f2f",
  "--state-selected": "#dcc99b",
  "--focus-ring": "#7a5510",
  "--accent": "#8a6314",
  "--accent-strong": "#6b4c0e",
  "--accent-soft": "#e9d9b4",
  "--on-accent": "#fdfaf3",
  "--shadow-1": "0 1px 2px rgb(90 74 40 / 0.18)",
  "--shadow-2": "0 2px 8px rgb(90 74 40 / 0.2)",
  "--shadow-3": "0 8px 28px rgb(90 74 40 / 0.24)",
  "--glow-accent":
    "0 0 0 1px rgb(138 99 20 / 0.55), 0 0 18px rgb(138 99 20 / 0.2)",
} as const);

const TOKEN_NAME_PATTERN = /--[a-z][a-z0-9-]*/gu;
const TOKEN_DECLARATION_PATTERN =
  /^\s*(--[a-z][a-z0-9-]*)\s*:\s*([^;\r\n]+)\s*;\s*$/gmu;
const LIGHT_THEME_MARKER = "@media (prefers-color-scheme: light)";

function themeScopes(source: string): { base: string; light: string } {
  const lightStart = source.indexOf(LIGHT_THEME_MARKER);
  if (lightStart < 0) {
    throw new Error("tokens.css must contain the light-theme media block");
  }
  return { base: source.slice(0, lightStart), light: source.slice(lightStart) };
}

function rootBody(source: string): string {
  const match = /:root\s*\{(?<body>[\s\S]*?)\}/u.exec(source);
  const body = match?.groups?.["body"];
  if (body === undefined) throw new Error("theme scope must contain one :root block");
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
  test("publishes every frozen token with its exact serialized value in both themes", async () => {
    const source = await Bun.file(
      new URL("../../src/styles/tokens.css", import.meta.url),
    ).text();
    const scopes = themeScopes(source);

    const baseEntries = tokenEntries(rootBody(scopes.base));
    const baseNames = baseEntries.map(([name]) => name);
    expect(baseEntries).toHaveLength(Object.keys(EXPECTED_BASE_TOKENS).length);
    expect(new Set(baseNames).size).toBe(baseNames.length);
    expect(baseNames).toEqual(Object.keys(EXPECTED_BASE_TOKENS));
    expect(Object.fromEntries(baseEntries)).toEqual(EXPECTED_BASE_TOKENS);

    const lightEntries = tokenEntries(rootBody(scopes.light));
    const lightNames = lightEntries.map(([name]) => name);
    expect(lightEntries).toHaveLength(Object.keys(EXPECTED_LIGHT_TOKENS).length);
    expect(new Set(lightNames).size).toBe(lightNames.length);
    expect(lightNames).toEqual(Object.keys(EXPECTED_LIGHT_TOKENS));
    expect(Object.fromEntries(lightEntries)).toEqual(EXPECTED_LIGHT_TOKENS);
  });

  test("declares contracted tokens exactly once per theme scope and only inside :root", async () => {
    const source = await Bun.file(
      new URL("../../src/styles/tokens.css", import.meta.url),
    ).text();
    const scopes = themeScopes(source);
    expect(source.match(/:root\s*\{/gu)).toHaveLength(2);

    for (const [scope, expected] of [
      [scopes.base, EXPECTED_BASE_TOKENS],
      [scopes.light, EXPECTED_LIGHT_TOKENS],
    ] as const) {
      const body = rootBody(scope);
      const allNames = Array.from(scope.matchAll(TOKEN_NAME_PATTERN), (match) =>
        match[0],
      );
      const rootNames = tokenEntries(body).map(([name]) => name);
      expect(allNames).toEqual(rootNames);
      expect(new Set(allNames)).toEqual(new Set(Object.keys(expected)));
    }
  });

  test("every light override names a base token so the themes never diverge structurally", () => {
    const baseNames = new Set(Object.keys(EXPECTED_BASE_TOKENS));
    const orphans = Object.keys(EXPECTED_LIGHT_TOKENS).filter(
      (name) => !baseNames.has(name),
    );
    expect(orphans).toEqual([]);
  });
});
