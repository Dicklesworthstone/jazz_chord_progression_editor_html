const foundationFacts = [
  {
    label: "Runtime",
    value: "Offline",
  },
  {
    label: "Method",
    value: "Deterministic",
  },
  {
    label: "Workspace",
    value: "Local-first",
  },
] as const;

const readinessChecks = [
  "The source-driven standalone shell is active.",
  "Preact is rendering without a remote dependency.",
  "No account, analytics, or cloud service is connected.",
] as const;

export function App() {
  return (
    <div class="app-shell" data-app-ready="true">
      <a class="skip-link" href="#workspace">
        Skip to workspace
      </a>

      <header class="site-header">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">
            C
          </span>
          <div>
            <p class="eyebrow">Offline composition workspace</p>
            <h1>Changes</h1>
            <p class="subtitle">Jazz Progression Studio</p>
          </div>
        </div>

        <p class="ready-status" role="status" aria-label="Application status">
          <span class="status-light" aria-hidden="true" />
          Foundation ready
        </p>
      </header>

      <main class="workspace" id="workspace" tabIndex={-1}>
        <section class="welcome-panel" aria-labelledby="welcome-title">
          <p class="section-kicker">A new foundation</p>
          <h2 id="welcome-title">
            Shape the harmony. Keep every choice explainable.
          </h2>
          <p class="welcome-copy">
            Changes is being rebuilt as a focused place to write, hear, and
            understand jazz progressions. This shell is already local and
            self-contained; editing, playback, and harmonic discovery will
            appear only as their tested engines are completed.
          </p>

          <dl class="foundation-facts" aria-label="Foundation properties">
            {foundationFacts.map((fact) => (
              <div class="fact" key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside class="readiness-panel" aria-labelledby="readiness-title">
          <div>
            <p class="section-kicker">Current build</p>
            <h2 id="readiness-title">Studio foundation</h2>
          </div>

          <ul class="readiness-list">
            {readinessChecks.map((check) => (
              <li key={check}>
                <span aria-hidden="true">✓</span>
                {check}
              </li>
            ))}
          </ul>

          <p class="next-step">
            Next foundation gate: a trustworthy chord and document model.
          </p>
        </aside>
      </main>

      <footer class="site-footer">
        <p>Deterministic by design. Your musical work stays on your device.</p>
      </footer>
    </div>
  );
}
