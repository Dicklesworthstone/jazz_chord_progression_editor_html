import { Button } from "../primitives";
import type { StudioMidiExportView } from "./studio-contract";

/**
 * U7 MIDI export workflow surface (dialog at/above the compact breakpoint,
 * sheet below — one content component for both, per the frozen accessibility
 * matrix).
 *
 * Every rendered value comes from the application service's pinned preview
 * model; this component derives nothing of its own. The disclosure rows a
 * musician is entitled to inspect before generating: readiness, realization
 * provenance, the fixed byte-model facts, the external-bass disclosure, the
 * mirrored E1 loss rows, the omitted-marker and title notices, the safe
 * filename, the deterministic SHA-256 of the exact bytes, and the byte
 * length. A blocked preview names every blocker with a chart link and offers
 * no Generate path.
 */
export type MidiExportPanelProps = Readonly<{
  context: "dialog" | "sheet";
  view: StudioMidiExportView;
  onGenerate: () => void;
  onDownload: () => void;
  onClose: () => void;
  onRepreview: () => void;
  onBlockedEventActivate: (eventId: string) => void;
}>;

function lossSentence(kind: string): string {
  switch (kind) {
    case "enharmonic-spelling":
      return "Note numbers cannot carry sharps or flats; the spelled symbols stay in the marker text and the JSON export.";
    case "annotation-text":
      return "No chord marker text was written for these events.";
    default:
      return "The playback loop range is not part of this file.";
  }
}

function omissionSentence(reason: string): string {
  switch (reason) {
    case "text-over-limit":
      return "longer than the file format's 96-byte text limit";
    case "text-control-chars":
      return "containing characters the file format forbids";
    case "text-empty":
      return "empty";
    default:
      return "not formattable";
  }
}

export function MidiExportPanel({
  context,
  view,
  onGenerate,
  onDownload,
  onClose,
  onRepreview,
  onBlockedEventActivate,
}: MidiExportPanelProps) {
  const statusId = `studio-midi-export-status-${context}`;
  const state = view.state ?? "preview";
  return (
    <div class="studio-midi-export" data-state={state}>
      <p
        aria-atomic="true"
        aria-live={view.refusal === null ? "polite" : "assertive"}
        class="studio-midi-export__status"
        data-testid={statusId}
        id={statusId}
        role="status"
      >
        {view.announcement ?? ""}
      </p>

      {view.refusal === null ? null : (
        <div
          class="studio-midi-export__refusal"
          data-testid={`studio-midi-export-refusal-${context}`}
        >
          <p>
            <strong>{view.refusal.code}</strong> {view.refusal.message}
          </p>
        </div>
      )}

      {view.stale ? (
        <div class="studio-midi-export__stale" data-testid={`studio-midi-export-stale-${context}`}>
          <p>
            The chart changed since this preview was made. Preview again to
            export the current chart.
          </p>
          <Button
            busy={false}
            density="comfortable"
            describedBy={[statusId]}
            disabled={false}
            type="button"
            id={`studio-midi-export-repreview-${context}`}
            invalid={false}
            label="Preview the current chart"
            onAction={onRepreview}
            variant="primary"
          />
        </div>
      ) : null}

      {state === "delivered" ? (
        <div class="studio-midi-export__delivered">
          <p>
            <strong>{view.artifact?.filename ?? ""}</strong> was handed to the
            browser's downloads. Whether it reached disk is the browser's
            report to make, not this studio's.
          </p>
          <div class="studio-midi-export__actions">
            <Button
              busy={false}
              density="comfortable"
              describedBy={[statusId]}
              disabled={false}
            type="button"
              id={`studio-midi-export-again-${context}`}
              invalid={false}
              label="Preview again"
              onAction={onRepreview}
              variant="secondary"
            />
            <Button
              busy={false}
              density="comfortable"
              describedBy={[statusId]}
              disabled={false}
            type="button"
              id={`studio-midi-export-done-${context}`}
              invalid={false}
              label="Done"
              onAction={onClose}
              variant="primary"
            />
          </div>
        </div>
      ) : state === "delivering" ? (
        <p class="studio-midi-export__busy">Handing the file to the browser…</p>
      ) : state === "generating" ? (
        <p class="studio-midi-export__busy">Checking the preview against the current chart…</p>
      ) : view.readiness === "blocked" ? (
        <section aria-label="What blocks this export" class="studio-midi-export__blocked">
          <h3>Not ready to export yet</h3>
          <p>
            Resolve{" "}
            {view.blockers.length === 1
              ? "this chord"
              : `these ${String(view.blockers.length)} chords`}{" "}
            and the file can be written:
          </p>
          <ul class="studio-midi-export__blockers">
            {view.blockers.map((blocker, index) => (
              <li key={`${blocker.eventId ?? "chart"}-${String(index)}`}>
                <p>{blocker.message}</p>
                {blocker.eventId === null ? null : (
                  <Button
                    busy={false}
                    density="dense"
                    describedBy={[]}
                    disabled={false}
            type="button"
                    id={`studio-midi-export-blocker-${context}-${String(index)}`}
                    invalid={false}
                    label="Show this chord in the chart"
                    onAction={() => {
                      onBlockedEventActivate(blocker.eventId as string);
                    }}
                    variant="outline"
                  />
                )}
              </li>
            ))}
          </ul>
          <div class="studio-midi-export__actions">
            <Button
              busy={false}
              density="comfortable"
              describedBy={[statusId]}
              disabled={false}
            type="button"
              id={`studio-midi-export-cancel-${context}`}
              invalid={false}
              label="Close"
              onAction={onClose}
              variant="secondary"
            />
          </div>
        </section>
      ) : (
        <section aria-label="Export preview" class="studio-midi-export__preview">
          <h3>This file will contain</h3>
          <dl class="studio-midi-export__facts">
            <div>
              <dt>Realization</dt>
              <dd>
                {[
                  view.realization.storedManualCount > 0
                    ? `${String(view.realization.storedManualCount)} manual`
                    : null,
                  view.realization.storedFrozenCount > 0
                    ? `${String(view.realization.storedFrozenCount)} frozen`
                    : null,
                  view.realization.generatedCount > 0
                    ? `${String(view.realization.generatedCount)} generated`
                    : null,
                ]
                  .filter((part) => part !== null)
                  .join(", ") || "no voicings"}
              </dd>
            </div>
            <div>
              <dt>Grid</dt>
              <dd>
                PPQ {String(view.ppq)}, {String(view.tempoBpm)} BPM,{" "}
                {String(view.meter.beatsPerBar)}/{String(view.meter.beatUnit)},{" "}
                {String(view.trackCount)} tracks
              </dd>
            </div>
            {view.realization.externalBassEventIds.length === 0 ? null : (
              <div>
                <dt>Bass</dt>
                <dd>
                  {String(view.realization.externalBassEventIds.length)}{" "}
                  {view.realization.externalBassEventIds.length === 1
                    ? "chord expects"
                    : "chords expect"}{" "}
                  an external bass player: the file carries no bass note for{" "}
                  {view.realization.externalBassEventIds.length === 1
                    ? "it"
                    : "them"}
                  , by design.
                </dd>
              </div>
            )}
            {view.artifact === null ? null : (
              <>
                <div>
                  <dt>File</dt>
                  <dd>
                    <strong>{view.artifact.filename}</strong> (
                    {String(view.artifact.byteLength)} bytes,{" "}
                    {String(view.artifact.noteCount)} notes,{" "}
                    {String(view.artifact.markerCount)} markers)
                  </dd>
                </div>
                <div>
                  <dt>SHA-256</dt>
                  <dd>
                    <code data-testid={`studio-midi-export-hash-${context}`}>
                      {view.artifact.sha256}
                    </code>
                  </dd>
                </div>
                {view.artifact.tempo.roundingErrorNumerator === 0 ? null : (
                  <div>
                    <dt>Tempo rounding</dt>
                    <dd>
                      {String(view.artifact.tempo.requestedBpm)} BPM encodes as{" "}
                      {String(
                        view.artifact.tempo.encodedMicrosecondsPerQuarter,
                      )}{" "}
                      µs per quarter, off by at most{" "}
                      {String(view.artifact.tempo.roundingErrorNumerator)}/
                      {String(view.artifact.tempo.roundingErrorDenominator)}{" "}
                      µs.
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>

          {view.losses.length === 0 ? null : (
            <section aria-label="What this file cannot hold">
              <h4>Not carried by this format</h4>
              <ul class="studio-midi-export__losses">
                {view.losses.map((loss) => (
                  <li key={loss.kind}>
                    {lossSentence(loss.kind)}{" "}
                    {loss.eventIds.length > 0
                      ? `(${String(loss.eventIds.length)} ${
                          loss.eventIds.length === 1 ? "chord" : "chords"
                        })`
                      : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view.markerOmissions.length === 0 &&
          view.titleNotice === null ? null : (
            <section aria-label="Text notices">
              <h4>Text notices</h4>
              <ul class="studio-midi-export__notices">
                {view.titleNotice === null ? null : (
                  <li>
                    {view.titleNotice.kind === "title-truncated"
                      ? `The title was shortened to fit the format's 96-byte text limit (was ${String(
                          view.titleNotice.originalUtf8ByteLength ?? 0,
                        )} bytes).`
                      : "The title contained characters the file format forbids and was replaced."}
                  </li>
                )}
                {view.markerOmissions.map((omission, index) => (
                  <li key={`${omission.eventId}-${String(index)}`}>
                    One {omission.markerKind} marker was omitted (
                    {omissionSentence(omission.reason)}).
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div class="studio-midi-export__actions">
            {state === "ready" ? (
              <Button
                busy={false}
                density="comfortable"
                describedBy={[statusId]}
                disabled={false}
            type="button"
                id={`studio-midi-export-download-${context}`}
                invalid={false}
                label="Download this file"
                onAction={onDownload}
                variant="primary"
              />
            ) : (
              <Button
                busy={false}
                density="comfortable"
                describedBy={[statusId]}
                disabled={false}
            type="button"
                id={`studio-midi-export-generate-${context}`}
                invalid={false}
                label="Generate the MIDI file"
                onAction={onGenerate}
                variant="primary"
              />
            )}
            <Button
              busy={false}
              density="comfortable"
              describedBy={[statusId]}
              disabled={false}
            type="button"
              id={`studio-midi-export-cancel-${context}`}
              invalid={false}
              label="Cancel"
              onAction={onClose}
              variant="secondary"
            />
          </div>
        </section>
      )}
    </div>
  );
}
