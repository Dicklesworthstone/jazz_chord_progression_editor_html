import { KeyValueList, StatusPill, UiIcon } from "../primitives";
import type { StudioHarmonyView } from "./studio-contract";

export type HarmonyLensContentProps = Readonly<{
  headingId: string;
  context: "rail" | "sheet";
  view: StudioHarmonyView;
}>;

export function HarmonyLensContent({
  headingId,
  context,
  view,
}: HarmonyLensContentProps) {
  const factsHeadingId = `${headingId}-facts`;

  return (
    <section
      class="studio-panel-content studio-harmony-content"
      data-panel-context={context}
      aria-labelledby={headingId}
    >
      {context === "rail" ? (
        <header class="studio-panel-heading">
          <div>
            <p class="studio-kicker">Literal first</p>
            <h2 id={headingId}>Harmony Lens</h2>
          </div>
          <span class="studio-panel-heading__index" aria-hidden="true">
            03
          </span>
        </header>
      ) : (
        <p class="studio-kicker">Literal first</p>
      )}

      <div class="studio-panel-intro">
        <StatusPill
          iconId="status"
          label={view.selectionStatusLabel}
          tone="info"
        />
      </div>

      <div class="studio-harmony-empty">
        <span class="studio-harmony-empty__mark" aria-hidden="true">
          <UiIcon iconId="harmony" />
        </span>
        <div>
          <h3>{view.emptyTitle}</h3>
          <p>{view.emptyDescription}</p>
          <p class="studio-harmony-empty__next-step">
            Select a chord when chord editing becomes available.
          </p>
        </div>
      </div>

      <section
        class="studio-document-facts"
        aria-labelledby={factsHeadingId}
      >
        <header>
          <p class="studio-kicker">Current document</p>
          <h3 id={factsHeadingId}>Document facts</h3>
        </header>
        <KeyValueList
          accessibleName={null}
          items={view.documentFacts.map((fact) => ({
            description: null,
            id: fact.id,
            key: fact.label,
            value: fact.value,
          }))}
        />
        <p class="studio-truth-note">
          These are literal selector values. No harmonic reading is inferred.
        </p>
      </section>
    </section>
  );
}

export type HarmonyLensProps = Readonly<{
  collapsed: boolean;
  view: StudioHarmonyView;
  onCollapsedChange: (collapsed: boolean) => void;
}>;

export function HarmonyLens({
  collapsed,
  view,
  onCollapsedChange,
}: HarmonyLensProps) {
  const headingId = "studio-harmony-heading";

  return (
    <aside
      class="studio-rail studio-rail--harmony"
      id="harmony-lens-rail"
      data-collapsed={collapsed ? "true" : "false"}
      aria-labelledby={headingId}
    >
      <div
        class="studio-rail__contents"
        data-collapsed={collapsed ? "true" : "false"}
      >
        {collapsed ? (
          <h2 id={headingId} class="studio-visually-hidden">
            Harmony Lens
          </h2>
        ) : (
          <HarmonyLensContent headingId={headingId} context="rail" view={view} />
        )}
        <button
          aria-expanded={collapsed ? "false" : "true"}
          aria-label={
            collapsed ? "Expand Harmony Lens" : "Collapse Harmony Lens"
          }
          class="studio-icon-button studio-rail__collapse-button"
          id="studio-harmony-rail-toggle"
          key="studio-harmony-rail-toggle"
          onClick={() => {
            onCollapsedChange(!collapsed);
          }}
          type="button"
        >
          <UiIcon iconId={collapsed ? "chevron-left" : "chevron-right"} />
        </button>
        {collapsed ? (
          <span class="studio-rail__vertical-label" aria-hidden="true">
            Harmony Lens
          </span>
        ) : null}
      </div>
    </aside>
  );
}
