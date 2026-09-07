import type { StudioComposition } from "./studio-controller";
import type { StudioDocumentImport } from "./studio-document-import";
import type { ApplySharedResult } from "./studio-share";

/** Called before the first editable render and before recovery is probed.
 * The existing import service owns F2/F3 preparation and the one E0 swap. */
export async function applyExactSharedStartup(composition: StudioComposition,
  documentImport: StudioDocumentImport, text: string): Promise<ApplySharedResult> {
  const before = composition.readApplicationState(), snapshot = composition.controller.getSnapshot();
  const unchanged = () => {
    const now = composition.readApplicationState();
    return now.document === before.document && now.revision === before.revision &&
      now.quickEntry === before.quickEntry && now.bookmarks === before.bookmarks;
  };
  if (snapshot.chordCount !== 0 || snapshot.sections.length !== 1 || snapshot.history.canUndo ||
      snapshot.quickEntry.text !== "" || before.revision !== 0 || before.dialogs.length !== 0) {
    return { applied: false, reason: "The studio already has content. The shared chart was not applied." };
  }
  documentImport.open();
  await documentImport.previewPaste(text, "canonical-json");
  if (!unchanged() || documentImport.getSnapshot().phase !== "preview") {
    const reason = unchanged() ? documentImport.getSnapshot().issueCodes.join(", ") : "command.stale_revision";
    documentImport.cancel();
    return { applied: false, reason: reason || "The shared chart could not be validated." };
  }
  await documentImport.requestCommit(unchanged);
  const after = composition.readApplicationState();
  if (!documentImport.getSnapshot().open && after.document !== before.document && after.revision === before.revision + 1) {
    return { applied: true };
  }
  const reason = documentImport.getSnapshot().message ?? "The shared chart was not applied; the current chart is unchanged.";
  documentImport.cancel();
  return { applied: false, reason };
}
