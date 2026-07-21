import {
  Badge,
  Button,
  EmptyState,
  KeyValueList,
} from "../primitives";
import type {
  StudioChartView,
  StudioPanelSide,
} from "./studio-contract";

export type ChartWorkspaceProps = Readonly<{
  view: StudioChartView;
  onRequestPanelSheet: (side: StudioPanelSide) => void;
}>;

export function ChartWorkspace({
  view,
  onRequestPanelSheet,
}: ChartWorkspaceProps) {
  return (
    <section
      id="chart-workspace"
      class="studio-chart"
      aria-labelledby="studio-chart-heading"
      tabIndex={-1}
    >
      <header class="studio-chart__header">
        <div>
          <p class="studio-kicker">Lead sheet</p>
          <h2 id="studio-chart-heading">Chart workspace</h2>
        </div>

        <div
          class="studio-mobile-panel-actions"
          role="group"
          aria-label="Studio panels"
        >
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-open-library-sheet"
            invalid={false}
            label="Library"
            onAction={() => {
              onRequestPanelSheet("library");
            }}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-open-harmony-sheet"
            invalid={false}
            label="Harmony Lens"
            onAction={() => {
              onRequestPanelSheet("harmony");
            }}
            type="button"
            variant="secondary"
          />
        </div>

        <div class="studio-chart-summary">
          <KeyValueList
            accessibleName="Chart summary"
            items={[
              {
                description: null,
                id: "chart-summary-sections",
                key: "Sections",
                value: view.sectionCountLabel,
              },
              {
                description: null,
                id: "chart-summary-measures",
                key: "Measures",
                value: view.measureCountLabel,
              },
              {
                description: null,
                id: "chart-summary-chords",
                key: "Chords",
                value: view.chordCountLabel,
              },
            ]}
          />
        </div>
      </header>

      {view.sections.length === 0 ? (
        <div class="studio-chart__empty-document">
          <EmptyState
            description="The chart has no measures or chord events."
            illustration={null}
            primaryAction={null}
            secondaryAction={null}
            title="No sections yet"
          />
        </div>
      ) : (
        <ol class="studio-section-list">
          {view.sections.map((section, sectionIndex) => {
            const sectionHeadingId = `studio-section-${sectionIndex.toString()}-heading`;

            return (
              <li key={section.id}>
                <section
                  class="studio-section"
                  aria-labelledby={sectionHeadingId}
                >
                  <header class="studio-section__header">
                    <div class="studio-section__identity">
                      <span class="studio-section__letter" aria-hidden="true">
                        {section.label}
                      </span>
                      <div>
                        <p class="studio-kicker">Section</p>
                        <h3 id={sectionHeadingId}>{section.label}</h3>
                      </div>
                    </div>
                    <Badge label={section.measureCountLabel} tone="neutral" />
                  </header>

                  <ol class="studio-measure-list">
                    {section.measures.map((measure, measureIndex) => {
                      const measureHeadingId = `studio-section-${sectionIndex.toString()}-measure-${measureIndex.toString()}-heading`;

                      return (
                        <li key={measure.id}>
                          <article
                            class="studio-measure"
                            data-measure-state={measure.state}
                            aria-labelledby={measureHeadingId}
                          >
                            <header class="studio-measure__header">
                              <h4 id={measureHeadingId}>
                                Measure {measure.number}
                              </h4>
                              <span class="studio-meter-signature">
                                {measure.meterLabel}
                              </span>
                            </header>

                            <div class="studio-measure__canvas">
                              <div
                                class="studio-measure__staff"
                                aria-hidden="true"
                              >
                                <span />
                                <span />
                                <span />
                                <span />
                              </div>
                              {measure.state === "empty" ? (
                                <div class="studio-measure__empty-copy">
                                  <span
                                    class="studio-measure__empty-mark"
                                    aria-hidden="true"
                                  >
                                    —
                                  </span>
                                  <strong>Empty measure</strong>
                                  <span>{measure.chordCountLabel}</span>
                                </div>
                              ) : (
                                <div class="studio-measure__populated-copy">
                                  <strong>{measure.chordCountLabel}</strong>
                                  <span>
                                    Chord cards are not composed in this
                                    checkpoint.
                                  </span>
                                </div>
                              )}
                            </div>

                            <div class="studio-measure__facts">
                              <KeyValueList
                                accessibleName={`Measure ${measure.number.toString()} facts`}
                                items={[
                                  {
                                    description: null,
                                    id: `${measure.id}-duration`,
                                    key: "Duration",
                                    value: measure.durationLabel,
                                  },
                                  {
                                    description: null,
                                    id: `${measure.id}-capacity`,
                                    key: "Capacity",
                                    value: measure.capacityLabel,
                                  },
                                  {
                                    description: null,
                                    id: `${measure.id}-position`,
                                    key: "Position",
                                    value: `${measure.startBeatLabel}–${measure.endBeatLabel}`,
                                  },
                                ]}
                              />
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
