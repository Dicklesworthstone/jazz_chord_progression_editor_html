import type { StudioLayoutView } from "./studio-contract";
import { Button } from "../primitives";

export type StudioShellNoticeProps = Readonly<{
  refusal: NonNullable<StudioLayoutView["uiRefusal"]>;
  onDismiss: () => void;
}>;

export function StudioShellNotice({
  refusal,
  onDismiss,
}: StudioShellNoticeProps) {
  return (
    <section
      class="studio-shell-notice"
      aria-labelledby="studio-shell-notice-title"
      role="alert"
    >
      <span class="studio-shell-notice__cue" aria-hidden="true">
        !
      </span>
      <div>
        <h2 id="studio-shell-notice-title">Panel could not open</h2>
        <p>{refusal.message}</p>
        {refusal.recoveryAction === null ? null : (
          <p class="studio-shell-notice__recovery">
            {refusal.recoveryAction}
          </p>
        )}
      </div>
      <Button
        busy={false}
        density="comfortable"
        describedBy={[]}
        disabled={false}
        id="studio-dismiss-shell-notice"
        invalid={false}
        label="Dismiss"
        onAction={onDismiss}
        type="button"
        variant="secondary"
      />
    </section>
  );
}
