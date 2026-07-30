import { Button, Field, Input, Label, StatusPill } from "../primitives";
import type {
  StudioDocumentView,
  StudioShellCallbacks,
} from "./studio-contract";

export type StudioHeaderProps = Readonly<{
  view: StudioDocumentView;
  callbacks: Pick<
    StudioShellCallbacks,
    | "onTitleDraftChange"
    | "onCommitTitle"
    | "onResetTitleDraft"
    | "onUndo"
    | "onRedo"
    | "onClearChart"
  >;
}>;

export function StudioHeader({ view, callbacks }: StudioHeaderProps) {
  const titleIsRefused = view.titleFeedback.kind === "refused";
  const titleLength = Array.from(view.titleDraft).length;

  return (
    <header class="studio-header" id="app-header">
      <div class="studio-brand">
        <span class="studio-brand__mark" aria-hidden="true">
          C
        </span>
        <div class="studio-brand__copy">
          <p class="studio-kicker">Offline jazz studio</p>
          <h1>JazzChords.org</h1>
        </div>
      </div>

      <Field
        controlId="studio-document-title"
        descriptionIds={["studio-title-policy"]}
        errorIds={["studio-title-feedback"]}
        id="studio-title-field"
        invalid={titleIsRefused}
        labelId="studio-title-label"
        required
        content={
          <form
            class="studio-title-editor"
            aria-label="Chart title"
            onSubmit={(event) => {
              event.preventDefault();
              if (view.canCommitTitle) {
                callbacks.onCommitTitle(view.titleDraft);
              }
            }}
          >
            <div class="studio-title-editor__label-row">
              <Label
                controlId="studio-document-title"
                id="studio-title-label"
                required
                text="Chart title"
              />
              <span
                aria-label={`${titleLength.toString()} of ${view.titleMaxCodePoints.toString()} code points`}
              >
                {titleLength}/{view.titleMaxCodePoints}
              </span>
            </div>
            <div class="studio-title-editor__control-row">
              <Input
                accessibleName="Chart title"
                busy={false}
                density="comfortable"
                describedBy={["studio-title-policy", "studio-title-feedback"]}
                disabled={false}
                id="studio-document-title"
                inputType="text"
                invalid={titleIsRefused}
                onValueChange={(event) => {
                  callbacks.onTitleDraftChange(event.value);
                }}
                placeholder={null}
                readOnly={false}
                value={view.titleDraft}
              />
              <Button
                busy={false}
                density="comfortable"
                describedBy={[]}
                disabled={!view.canCommitTitle}
                id="studio-apply-title"
                invalid={false}
                label="Apply title"
                onAction={() => undefined}
                type="submit"
                variant="primary"
              />
              <Button
                busy={false}
                density="comfortable"
                describedBy={[]}
                disabled={!view.canResetTitleDraft}
                id="studio-reset-title"
                invalid={false}
                label="Reset"
                onAction={callbacks.onResetTitleDraft}
                type="button"
                variant="ghost"
              />
            </div>
            <p id="studio-title-policy" class="studio-title-editor__policy">
              Apply commits the title. A refused title leaves “{view.committedTitle}”
              unchanged.
            </p>
            <p
              id="studio-title-feedback"
              class="studio-title-editor__feedback"
              data-feedback-kind={view.titleFeedback.kind}
              role={titleIsRefused ? "alert" : "status"}
              aria-live={titleIsRefused ? "assertive" : "polite"}
              aria-atomic="true"
            >
              {view.titleFeedback.message}
            </p>
          </form>
        }
      />

      <div class="studio-document-actions">
        <div
          class="studio-document-status"
          id="document-status"
          aria-label="Document status"
          aria-live="polite"
          aria-atomic="true"
          role="status"
        >
          <StatusPill
            iconId="status"
            label={view.lifecycleLabel}
            tone={view.dirty ? "warning" : "neutral"}
          />
          <span class="studio-document-status__revision">
            {view.revisionLabel}
          </span>
        </div>
        <div
          class="studio-history-actions"
          id="document-menu"
          role="group"
          aria-label="Document commands"
        >
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canUndo}
            id="studio-undo"
            invalid={false}
            label="Undo"
            onAction={callbacks.onUndo}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canRedo}
            id="studio-redo"
            invalid={false}
            label="Redo"
            onAction={callbacks.onRedo}
            type="button"
            variant="secondary"
          />
          {/*
            Clearing is destructive but not irreversible: it is one undoable
            command, so the confirmation exists to stop an accidental click,
            not to guard something unrecoverable. It is offered only when
            there is something to clear, so the affordance never lies.
          */}
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canClearChart}
            id="studio-clear-chart"
            invalid={false}
            label="Clear"
            onAction={callbacks.onClearChart}
            type="button"
            variant="destructive"
          />
        </div>
      </div>
    </header>
  );
}
