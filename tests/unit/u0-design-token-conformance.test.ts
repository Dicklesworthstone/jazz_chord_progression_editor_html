import { describe, expect, test } from "bun:test";

/**
 * Independently transcribed from the frozen U0 token contract. Deliberately do
 * not import UI_TOKEN_DEFINITIONS: production data must not certify its CSS.
 * The 2026-07-28 owner-directed overhaul (jcpe-yngr) introduced the warm Stage
 * dark base, the Paper light overrides, the brass accent family, elevation
 * shadows, and the chord type scale. The 2026-07-29 owner-directed redesign
 * (jcpe-z4h1) replaced the Stage base with the Blue Note ink-blue identity
 * (brass structure, cyan focus/analysis, coral error), retuned both themes'
 * contrast pairs, and enlarged the chord/display type scale; both
 * transcriptions below were re-read against docs and fixture at that landing.
 */
const EXPECTED_BASE_TOKENS = Object.freeze({
  "--background": "#07090e",
  "--surface-app": "#07090e",
  "--surface-header": "#0a0f16",
  "--surface-rail": "#0c121b",
  "--surface-chart": "#101725",
  "--surface-panel": "#121a29",
  "--surface-elevated": "#1a2434",
  "--surface-sunken": "#04060a",
  "--surface-overlay": "rgb(4 7 12 / 0.74)",
  "--text-primary": "#f5f0e2",
  "--text-muted": "#b3bdcc",
  "--text-subtle": "#93a0b3",
  "--text-inverse": "#131007",
  "--border-default": "#243143",
  "--border-strong": "#677990",
  "--action-primary": "#d9a63f",
  "--action-primary-hover": "#efc25e",
  "--action-secondary": "#1c2737",
  "--state-info": "#63c9de",
  "--state-success": "#5fd39c",
  "--state-warning": "#e5b95c",
  "--state-error": "#ff7d6d",
  "--state-selected": "#1d3a54",
  "--focus-ring": "#7fd4e6",
  "--accent": "#e0b04a",
  "--accent-strong": "#f2cd77",
  "--accent-soft": "#3c3319",
  "--on-accent": "#171204",
  "--shadow-1": "0 1px 2px rgb(2 4 9 / 0.55)",
  "--shadow-2": "0 3px 12px rgb(2 4 9 / 0.5)",
  "--shadow-3": "0 14px 36px rgb(2 4 9 / 0.6)",
  "--glow-accent":
    "0 0 0 1px rgb(224 176 74 / 0.6), 0 0 22px rgb(224 176 74 / 0.28)",
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
  "--text-chord": "1.5rem",
  "--text-chord-super": "0.66em",
  "--text-display": "2rem",
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
  "--background": "#f4eee1",
  "--surface-app": "#f4eee1",
  "--surface-header": "#ece3d0",
  "--surface-rail": "#efe8d7",
  "--surface-chart": "#faf6eb",
  "--surface-panel": "#fbf8f0",
  "--surface-elevated": "#ffffff",
  "--surface-sunken": "#e6dcc3",
  "--surface-overlay": "rgb(46 40 24 / 0.44)",
  "--text-primary": "#1f2530",
  "--text-muted": "#4a5262",
  "--text-subtle": "#57606c",
  "--text-inverse": "#fdfaf2",
  "--border-default": "#d3c8ab",
  "--border-strong": "#7e7256",
  "--action-primary": "#7a5a10",
  "--action-primary-hover": "#63490b",
  "--action-secondary": "#e8ddc2",
  "--state-info": "#0b6577",
  "--state-success": "#136b40",
  "--state-warning": "#7b5a0d",
  "--state-error": "#a93425",
  "--state-selected": "#d7e6f2",
  "--focus-ring": "#10657c",
  "--accent": "#8a6412",
  "--accent-strong": "#6c4d0c",
  "--accent-soft": "#e9dbb0",
  "--on-accent": "#fdfaf2",
  "--shadow-1": "0 1px 2px rgb(80 66 36 / 0.16)",
  "--shadow-2": "0 3px 12px rgb(80 66 36 / 0.18)",
  "--shadow-3": "0 14px 36px rgb(80 66 36 / 0.22)",
  "--glow-accent":
    "0 0 0 1px rgb(138 100 18 / 0.55), 0 0 20px rgb(138 100 18 / 0.22)",
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
