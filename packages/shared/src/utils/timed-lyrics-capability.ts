/**
 * Karaoke Sync (timed lyrics) capability for an existing track's provider.
 * Stage 1: Legacyengine only. Audioengine must not call Legacyengine get-timestamped-lyrics.
 */
export function isTimedLyricsAvailableForProvider(
  musicProvider: string | null | undefined,
): boolean {
  return (musicProvider ?? "").trim().toLowerCase() === "legacyengineapi";
}
