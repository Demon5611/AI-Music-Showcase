/**
 * Stem separation requires Suno vocal-removal taskId + audioId.
 * Stage 1: only sunoapi source assets.
 */
export function isStemSeparationAvailableForProvider(
  musicProvider: string | null | undefined,
): boolean {
  return (musicProvider ?? "").trim().toLowerCase() === "sunoapi";
}
