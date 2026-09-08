// Independently specified command vectors; cache location is never ownership.
export const PROCESS_CASES = [
  { label: "idle Rod uses Playwright cache", argv: ["/home/u/.cache/ms-playwright/chromium-1234/chrome", "--user-data-dir=/data/rod/user-data/a"], active: false },
  { label: "crash reporter in browser cache", argv: ["/home/u/.cache/ms-playwright/chromium-1234/chrome_crashpad_handler", "--monitor-self"], active: false },
  { label: "plain Node runs foreign checkout suite", argv: ["/usr/bin/node", "/other project/node_modules/@playwright/test/cli.js", "test", "--workers=1"], active: true },
  { label: "playwright CLI package", argv: ["/opt/node26/bin/node", "/foreign/node_modules/playwright/cli.js", "test"], active: true },
  { label: "browser installation is not a suite", argv: ["/usr/bin/node", "/r/node_modules/@playwright/test/cli.js", "install", "chromium"], active: false },
  { label: "MCP latest is not test", argv: ["node", "/node_modules/@playwright/mcp/cli.js", "--browser", "chromium"], active: false },
  { label: "Bun launcher awaits its admitted Node child", argv: ["/tool/bun", "/r/scripts/run-playwright.ts", "test"], active: false },
  { label: "predeploy adapter", argv: ["/opt/node", "/r/scripts/check-predeploy-playback.ts", "dist/index.html"], active: true },
  { label: "shell quotation is not execution", argv: ["zsh", "-c", "node /r/node_modules/playwright/cli.js test"], active: false },
  { label: "grep diagnostic is not execution", argv: ["rg", "playwright/cli.js", "test"], active: false },
  { label: "reparented Playwright worker", argv: ["/usr/bin/node", "/r/node_modules/playwright/lib/common/process.js"], active: true },
  // Actual Playwright 1.61.1 worker program observed during the native M0 gate.
  { label: "modern Playwright worker before opening a browser", argv: ["/home/ubuntu/.nvm/versions/node/v26.0.0/bin/node", "/data/projects/jazz_chord_progression_editor_html/node_modules/playwright/lib/worker/workerProcessEntry.js"], active: true },
  { label: "modern worker path passed as data is not execution", argv: ["node", "/r/diagnostic.mjs", "/r/node_modules/playwright/lib/worker/workerProcessEntry.js"], active: false },
  { label: "orphan Chromium from real Playwright", argv: ["/browser/chrome", "--user-data-dir=/tmp/playwright_chromiumdev_profile-AbC", "--remote-debugging-pipe"], active: true },
  { label: "ordinary Chrome pipe not sufficient", argv: ["/browser/chrome", "--user-data-dir=/data/rod/user-data/a", "--remote-debugging-pipe"], active: false },
  { label: "Firefox automation child", argv: ["/browser/firefox", "-profile", "/tmp/playwright_firefoxdev_profile-AbC", "-juggler-pipe"], active: true },
  { label: "WebKit automation child", argv: ["/browser/MiniBrowser", "--inspector-pipe", "--headless"], active: true },
] as const;
