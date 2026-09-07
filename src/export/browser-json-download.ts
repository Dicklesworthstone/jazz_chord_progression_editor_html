/** Composition-injected file handoff for a prepared collection/kept chart.
 * No current-document export marker authority is carried by this adapter. */
export function prepareBrowserJsonDownload(text: string, filename: string): () => boolean {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  let used = false;
  return () => {
    if (used) return false;
    used = true;
    if (!navigator.userActivation.isActive) return false;
    let url: string | null = null, anchor: HTMLAnchorElement | null = null, issued = false, cleaned = true;
    try {
      url = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename; anchor.hidden = true;
      document.body.append(anchor); anchor.click(); issued = true;
    } catch { /* Cleanup still runs after a partially issued download. */ }
    finally {
      try { anchor?.remove(); } catch { cleaned = false; }
      try { if (url !== null) URL.revokeObjectURL(url); } catch { cleaned = false; }
    }
    return issued && cleaned;
  };
}
