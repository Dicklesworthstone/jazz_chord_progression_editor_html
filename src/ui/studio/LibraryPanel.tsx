import { Badge, Button, UiIcon } from "../primitives";
import type { StudioQuickEntryView } from "./studio-contract";

const stagedLibraryAreas = [
  {
    name: "Chord palette",
    description:
      "Spelling-aware chord choices arrive after real document insertion is wired.",
  },
  {
    name: "Lessons",
    description:
      "Guided progressions remain staged until loading them is an undoable action.",
  },
] as const;

export type LibraryPanelContentProps = Readonly<{
  headingId: string;
  context: "rail" | "sheet";
  quickEntry: StudioQuickEntryView;
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
}>;

/** Raw chart text stays caller-owned: the field never rewrites what was typed. */
function QuickEntryPanel({
  view,
  onDraftChange,
  onInsert,
  onClear,
}: Readonly<{
  view: StudioQuickEntryView;
  onDraftChange: (value: string) => void;
  onInsert: () => void;
  onClear: () => void;
}>) {
  return (
    <section class="studio-quick-entry" aria-labelledby="studio-quick-entry-heading">
      <h3 id="studio-quick-entry-heading">Quick entry</h3>
      <label class="studio-quick-entry__label" for="studio-quick-entry-field">
        Chart text
      </label>
      <textarea
        id="studio-quick-entry-field"
        class="studio-quick-entry__field"
        data-testid="quick-entry-field"
        rows={3}
        spellcheck={false}
        value={view.draftText}
        aria-describedby="studio-quick-entry-status"
        onInput={(event) => {
          onDraftChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onInsert();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClear();
          }
        }}
      />
      <p
        id="studio-quick-entry-status"
        class="studio-quick-entry__status"
        data-testid="quick-entry-status"
        role="status"
      >
        <span>{view.statusLabel}</span>
        <span class="studio-quick-entry__target">{view.targetLabel}</span>
        <span class="studio-quick-entry__count">
          {String(view.codePointCount)} / {String(view.maxCodePoints)}
        </span>
      </p>
      {view.issueCodes.length === 0 ? null : (
        <ul class="studio-quick-entry__issues" data-testid="quick-entry-issues">
          {view.issueCodes.map((code) => (
            <li key={code}>
              <Badge label={code} tone="warning" />
            </li>
          ))}
        </ul>
      )}
      {view.refusalMessage === null ? null : (
        <p class="studio-quick-entry__refusal" data-testid="quick-entry-refusal">
          {view.refusalMessage}
        </p>
      )}
      <div class="studio-quick-entry__actions">
        <Button
          busy={false}
          density="comfortable"
          describedBy={["studio-quick-entry-status"]}
          disabled={!view.canInsert}
          id="studio-quick-entry-insert"
          invalid={false}
          label="Insert chart text"
          onAction={onInsert}
          type="button"
          variant="primary"
        />
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={!view.canClear}
          id="studio-quick-entry-clear"
          invalid={false}
          label="Clear"
          onAction={onClear}
          type="button"
          variant="secondary"
        />
      </div>
    </section>
  );
}

export function LibraryPanelContent({
  headingId,
  context,
  quickEntry,
  onQuickEntryDraftChange,
  onQuickEntryInsert,
  onQuickEntryClear,
}: LibraryPanelContentProps) {
  return (
    <section
      class="studio-panel-content studio-library-content"
      data-panel-context={context}
      aria-labelledby={headingId}
    >
      {context === "rail" ? (
        <header class="studio-panel-heading">
          <div>
            <p class="studio-kicker">Write and discover</p>
            <h2 id={headingId}>Library</h2>
          </div>
        </header>
      ) : (
        <p class="studio-kicker">Write and discover</p>
      )}

      <QuickEntryPanel
        onClear={onQuickEntryClear}
        onDraftChange={onQuickEntryDraftChange}
        onInsert={onQuickEntryInsert}
        view={quickEntry}
      />

      <p class="studio-panel-intro">
        The remaining entry tools appear here only when they can create real,
        validated chart changes.
      </p>

      <ul class="studio-staged-list" aria-label="Library roadmap">
        {stagedLibraryAreas.map((area) => (
          <li key={area.name}>
            <div class="studio-staged-list__heading">
              <h3>{area.name}</h3>
              <Badge label="Staged" tone="neutral" />
            </div>
            <p>{area.description}</p>
          </li>
        ))}
      </ul>

      <p class="studio-truth-note">
        No example chords are inserted into this new document.
      </p>
    </section>
  );
}

export type LibraryPanelProps = Readonly<{
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  quickEntry: StudioQuickEntryView;
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
}>;

export function LibraryPanel({
  collapsed,
  onCollapsedChange,
  quickEntry,
  onQuickEntryDraftChange,
  onQuickEntryInsert,
  onQuickEntryClear,
}: LibraryPanelProps) {
  const headingId = "studio-library-heading";

  return (
    <aside
      class="studio-rail studio-rail--library"
      id="library-rail"
      data-collapsed={collapsed ? "true" : "false"}
      aria-labelledby={headingId}
    >
      <div
        class="studio-rail__contents"
        data-collapsed={collapsed ? "true" : "false"}
      >
        {collapsed ? (
          <h2 id={headingId} class="studio-visually-hidden">
            Library
          </h2>
        ) : (
          <LibraryPanelContent
            context="rail"
            headingId={headingId}
            onQuickEntryClear={onQuickEntryClear}
            onQuickEntryDraftChange={onQuickEntryDraftChange}
            onQuickEntryInsert={onQuickEntryInsert}
            quickEntry={quickEntry}
          />
        )}
        <button
          aria-expanded={collapsed ? "false" : "true"}
          aria-label={collapsed ? "Expand Library" : "Collapse Library"}
          class="studio-icon-button studio-rail__collapse-button"
          id="studio-library-rail-toggle"
          key="studio-library-rail-toggle"
          onClick={() => {
            onCollapsedChange(!collapsed);
          }}
          type="button"
        >
          <UiIcon iconId={collapsed ? "chevron-right" : "chevron-left"} />
        </button>
        {collapsed ? (
          <span class="studio-rail__vertical-label" aria-hidden="true">
            Library
          </span>
        ) : null}
      </div>
    </aside>
  );
}
