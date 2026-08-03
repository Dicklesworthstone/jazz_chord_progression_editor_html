import { Button, KeyValueList, StatusPill, UiIcon } from "../primitives";
import type { StudioHarmonyView } from "./studio-contract";

export type HarmonyLensContentProps = Readonly<{
  headingId: string;
  context: "rail" | "sheet";
  view: StudioHarmonyView;
  onAddSuggestedChord: (symbolText: string) => void;
}>;

export function HarmonyLensContent({
  headingId,
  context,
  view,
  onAddSuggestedChord,
}: HarmonyLensContentProps) {
  const factsHeadingId = `${headingId}-facts`;
  const continuationHeadingId = `${headingId}-continuation`;

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

      {view.selected === null ? (
        <div class="studio-harmony-empty">
          <span class="studio-harmony-empty__mark" aria-hidden="true">
            <UiIcon iconId="harmony" />
          </span>
          <div>
            <h3>{view.emptyTitle}</h3>
            <p>{view.emptyDescription}</p>
            <p class="studio-harmony-empty__next-step">
              Click any chord in the chart to inspect it here.
            </p>
          </div>
        </div>
      ) : (
        <section
          class="studio-harmony-selected"
          aria-label={view.selected.accessibleName}
        >
          <header>
            <p class="studio-kicker">Selected chord</p>
            <h3 class="studio-harmony-selected__symbol">
              {view.selected.symbolText}
            </h3>
          </header>
          <KeyValueList
            accessibleName={null}
            items={view.selected.facts.map((fact) => ({
              description: null,
              id: fact.id,
              key: fact.label,
              value: fact.value,
            }))}
          />
          <p class="studio-truth-note">
            Literal stored values. No harmonic reading is inferred.
          </p>
        </section>
      )}

      {/*
        Plural continuation options from the session engine: each row is one
        option with its own explanation, never a verdict. Add travels the
        same staged quick-entry path as typing, so every insertion law —
        pristine fill, derived-target retarget, refusal surfacing — applies
        unchanged (jcpe-73h1, U1-EDIT-004).
      */}
      {view.continuation === null ? null : (
        <section
          class="studio-continuation"
          data-testid={`lens-continuation-${context}`}
          aria-labelledby={continuationHeadingId}
        >
          <header>
            <p class="studio-kicker">Plural options, never verdicts</p>
            <h3 id={continuationHeadingId}>What could come next</h3>
          </header>
          <p class="studio-continuation__after">
            After <strong>{view.continuation.afterLabel}</strong>:
          </p>
          <ul class="studio-continuation__list">
            {view.continuation.suggestions.map((suggestion) => (
              <li class="studio-continuation__row" key={suggestion.id}>
                <div class="studio-continuation__head">
                  <span class="studio-continuation__symbol">
                    {suggestion.symbolText}
                  </span>
                  <span class="studio-continuation__category">
                    {suggestion.categoryLabel}
                  </span>
                  <Button
                    busy={false}
                    density="dense"
                    describedBy={[]}
                    disabled={false}
                    id={`studio-add-suggestion-${context}-${suggestion.id.replace(/[^a-zA-Z0-9-]/g, "-")}`}
                    invalid={false}
                    label={`Add ${suggestion.symbolText}`}
                    onAction={() => {
                      onAddSuggestedChord(suggestion.symbolText);
                    }}
                    type="button"
                    variant="secondary"
                  />
                </div>
                <p class="studio-continuation__why">{suggestion.sentence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

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
  /**
   * True while the harmony sheet renders its own HarmonyLensContent copy.
   * The rail must not mount a second copy then: every static id inside the
   * content would be duplicated document-wide, breaking label/for and
   * aria references. The sheet is modal and every width that can open it
   * hides this rail, so nothing visible is lost.
   */
  sheetOpen: boolean;
  view: StudioHarmonyView;
  onCollapsedChange: (collapsed: boolean) => void;
  onAddSuggestedChord: (symbolText: string) => void;
}>;

export function HarmonyLens({
  collapsed,
  sheetOpen,
  view,
  onCollapsedChange,
  onAddSuggestedChord,
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
        {collapsed || sheetOpen ? (
          <h2 id={headingId} class="studio-visually-hidden">
            Harmony Lens
          </h2>
        ) : (
          <HarmonyLensContent
            headingId={headingId}
            context="rail"
            view={view}
            onAddSuggestedChord={onAddSuggestedChord}
          />
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
