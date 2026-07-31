import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const typedSourceRules = {
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      disallowTypeAnnotations: false,
      fixStyle: "separate-type-imports",
      prefer: "type-imports",
    },
  ],
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/only-throw-error": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "no-console": "error",
  "no-duplicate-imports": "error",
  "no-restricted-globals": [
    "error",
    {
      name: "EventSource",
      message: "Production is offline and cannot open event streams.",
    },
    {
      name: "SharedWorker",
      message: "Workers are outside the release contract.",
    },
    {
      name: "WebSocket",
      message: "Production is offline and cannot open sockets.",
    },
    {
      name: "Worker",
      message: "Workers are outside the release contract.",
    },
    {
      name: "XMLHttpRequest",
      message: "Production is offline and cannot issue requests.",
    },
    {
      name: "fetch",
      message: "Production is offline and cannot issue requests.",
    },
  ],
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: [
            "@axe-core/*",
            "@playwright/*",
            "bun:*",
            "node:*",
            "preact/compat",
            "react",
            "react/*",
            "react-dom",
            "react-dom/*",
          ],
          message: "This dependency is forbidden from production source.",
        },
      ],
    },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "ImportExpression",
      message: "Dynamic imports are forbidden from the standalone artifact.",
    },
    {
      selector: "CallExpression[callee.property.name='sendBeacon']",
      message: "Telemetry and background requests are forbidden.",
    },
    {
      selector: "CallExpression[callee.property.name='register'][callee.object.property.name='serviceWorker']",
      message: "Service-worker registration is forbidden.",
    },
    {
      selector: "CallExpression[callee.property.name='addModule']",
      message: "Runtime worklet module loading is forbidden.",
    },
  ],
  "no-warning-comments": [
    "error",
    {
      location: "anywhere",
      terms: [
        "fixme",
        "todo"
      ],
    },
  ],
};

const project = (path) => ({
  parserOptions: {
    project: path,
    tsconfigRootDir: import.meta.dirname,
  },
});

export default tseslint.config(
  {
    ignores: [
      ".beads/**",
      ".bv/**",
      /* Agent worktrees are transient checkouts of this same repo; linting
         them double-reports every finding against a tree nobody releases. */
      ".claude/**",
      ".tmp/**",
      "blob-report/**",
      "coverage/**",
      "dist/**",
      "eslint.config.mjs",
      "jazz_chord_progression_editor.html",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "tests/fixtures/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: project("./tsconfig.app.json"),
    rules: typedSourceRules,
  },
  {
    files: ["scripts/**/*.ts"],
    languageOptions: project("./tsconfig.tools.json"),
  },
  {
    files: [
      "src/test-support/**/*.{ts,tsx}",
      "tests/support/**/*.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    languageOptions: project("./tsconfig.tests.json"),
  },
  {
    files: [
      "playwright.config.ts",
      "playwright.studio-audible.config.ts",
      "playwright.x0.config.ts",
      "playwright.x1.config.ts",
      "tests/integration/audio-offline-render.test.ts",
      "tests/integration/studio-audible-browser-evidence.test.ts",
      "tests/integration/transport-browser-evidence.test.ts",
      "tests/e2e/**/*.{ts,tsx}",
      "tests/visual/**/*.{ts,tsx}",
    ],
    languageOptions: project("./tsconfig.e2e.json"),
  },
);
