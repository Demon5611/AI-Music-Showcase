/**
 * Stem separation requires Legacyengine vocal-removal taskId + audioId.
 * Stage 1: only legacyengineapi source assets.
 */
export function isStemSeparationAvailableForProvider(
  musicProvider: string | null | undefined,
): boolean {
  return (musicProvider ?? "").trim().toLowerCase() === "legacyengineapi";
}
