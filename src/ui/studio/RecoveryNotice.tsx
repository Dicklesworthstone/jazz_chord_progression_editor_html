import { Button } from "../primitives";

/**
 * A1 recovery surfaces (jcpe-milestone-reliable-studio-l3a.2 step 4).
 * The offer notice presents the reviewed Keep/Discard choice for a
 * recovered chart; the status line speaks ONLY the frozen
 * RECOVERY_STATUS_VOCABULARY strings the composition passes down.
 * Browser recovery is never called Save anywhere in this UI, and Keep
 * rides the transactional replacement channel — the buttons dispatch to
 * the composition-bound orchestrator, never to a local shortcut.
 */
export type RecoveryOfferView = Readonly<{
  /** Locale-rendered wall-clock time of the recovered snapshot. */
  savedAtLabel: string;
  revision: number;
}>;

export type RecoveryNoticeProps = Readonly<{
  offer: RecoveryOfferView;
  busy: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}>;

export function RecoveryNotice({
  offer,
  busy,
  onKeep,
  onDiscard,
}: RecoveryNoticeProps) {
  return (
    <section
      class="studio-recovery-notice"
      aria-labelledby="studio-recovery-notice-title"
      role="alertdialog"
      aria-describedby="studio-recovery-notice-body"
    >
      <div class="studio-recovery-notice__text">
        <h2 id="studio-recovery-notice-title">Recovered chart found</h2>
        <p id="studio-recovery-notice-body">
          A locally recovered chart from {offer.savedAtLabel} (revision{" "}
          {offer.revision}) is available. Keep it to replace the current
          chart, or discard it.
        </p>
      </div>
      <div class="studio-recovery-notice__actions">
        <Button
          busy={busy}
          density="comfortable"
          describedBy={["studio-recovery-notice-body"]}
          disabled={busy}
          id="studio-recovery-keep"
          invalid={false}
          label="Keep recovered chart"
          onAction={onKeep}
          type="button"
          variant="primary"
        />
        <Button
          busy={false}
          density="comfortable"
          describedBy={["studio-recovery-notice-body"]}
          disabled={busy}
          id="studio-recovery-discard"
          invalid={false}
          label="Discard"
          onAction={onDiscard}
          type="button"
          variant="secondary"
        />
      </div>
    </section>
  );
}

export type RecoveryStatusLineProps = Readonly<{
  /** One frozen RECOVERY_STATUS_VOCABULARY string, already substituted. */
  text: string;
}>;

export function RecoveryStatusLine({ text }: RecoveryStatusLineProps) {
  return (
    <p
      class="studio-recovery-status"
      id="studio-recovery-status"
      role="status"
    >
      {text}
    </p>
  );
}
