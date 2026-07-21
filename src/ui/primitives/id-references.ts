export function joinIdReferences(ids: readonly string[]): string | undefined {
  return ids.length === 0 ? undefined : ids.join(" ");
}
