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
    let anchor: MidiExportDownloadAnchor | null = null;
    const cleanup = () => {
      let revoked = false, removed = anchor === null;
      const errors: unknown[] = [];
      try {
        dom.revokeObjectUrl(url);
        revoked = true;
      } catch (error) {
        errors.push(error);
      }
      try {
        anchor?.remove();
        removed = true;
      } catch (error) {
        errors.push(error);
      }
      return {
        errors,
        receipt: Object.freeze({
          objectUrlsCreated: 1,
          objectUrlsRevoked: revoked ? 1 : 0,
          outstandingOwnedResources: Number(!revoked) + Number(!removed),
          ...(errors.length === 0 ? {} : {
            error: errors.map(error => error instanceof Error ? error.message : "unknown cleanup failure").join("; "),
          }),
        }),
      };
    };
    try {
      anchor = dom.createAnchor();
      anchor.href = url;
      anchor.download = request.binding.filename;
      dom.attachToDocument(anchor);
      // Keep activation in the original user gesture, before any microtask.
      anchor.click();
    } catch (error) {
      const result = cleanup();
      if (result.errors.length > 0) {
        throw new AggregateError([error, ...result.errors], "MIDI download activation failed and cleanup was incomplete.", { cause: error });
      }
      throw error;
    }
    return Object.freeze({ completion: Promise.resolve().then(() => cleanup().receipt) });
  };
}
