import type { StudioMidiExportDeliveryStart } from "../application/runtime";

/**
 * The U7 browser download adapter: one object URL, one anchor, one click,
 * total cleanup accounting.
 *
 * The orchestration laws it carries (docs/U7_MIDI_EXPORT_WORKFLOW_CONTRACT.md
 * §3): the anchor is invoked synchronously inside the caller's user-activation
 * window — no await and no queued microtask may precede the click; exactly one
 * object URL is created and exactly one is revoked; the completion reports the
 * accounting and the coordinator validates it. `handed-off` is the terminal
 * observable: browser activation is visible, final disk persistence is not.
 *
 * The DOM surface is injected so the orchestration is provable headless; the
 * composition root (`src/main.tsx`) wires the real browser globals.
 */
export type MidiExportDownloadAnchor = {
  href: string;
  download: string;
  click: () => void;
  remove: () => void;
};

export type MidiExportDownloadDom = Readonly<{
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAnchor: () => MidiExportDownloadAnchor;
  attachToDocument: (anchor: MidiExportDownloadAnchor) => void;
}>;

export function createMidiExportDownloadStart(
  dom: MidiExportDownloadDom,
): StudioMidiExportDeliveryStart {
  return (request) => {
    const blob = new Blob([request.privateBytes as BlobPart], {
      type: "audio/midi",
    });
    const url = dom.createObjectUrl(blob);
    const anchor = dom.createAnchor();
    anchor.href = url;
    anchor.download = request.binding.filename;
    dom.attachToDocument(anchor);
    anchor.click();
    return Object.freeze({
      completion: Promise.resolve().then(() => {
        let revoked = false;
        let cleanupError: unknown = null;
        try {
          dom.revokeObjectUrl(url);
          revoked = true;
        } catch (error) {
          cleanupError = error;
        }
        try {
          anchor.remove();
        } catch (error) {
          cleanupError ??= error;
        }
        return Object.freeze({
          objectUrlsCreated: 1,
          objectUrlsRevoked: revoked ? 1 : 0,
          outstandingOwnedResources: revoked ? 0 : 1,
          ...(cleanupError === null
            ? {}
            : {
                error:
                  cleanupError instanceof Error
                    ? cleanupError.message
                    : "unknown cleanup failure",
              }),
        });
      }),
    });
  };
}
