import { Badge, UiIcon } from "../primitives";

const stagedLibraryAreas = [
  {
    name: "Quick entry",
    description:
      "Typed chord entry and its parse preview arrive with the syntax workflow.",
  },
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
}>;

export function LibraryPanelContent({
  headingId,
  context,
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

      <p class="studio-panel-intro">
        Entry tools will appear here only when they can create real, validated
        chart changes.
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
}>;

export function LibraryPanel({
  collapsed,
  onCollapsedChange,
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
          <LibraryPanelContent headingId={headingId} context="rail" />
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
