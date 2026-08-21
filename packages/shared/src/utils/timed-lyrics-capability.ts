/**
 * Karaoke Sync (timed lyrics) capability for an existing track's provider.
 * Stage 1: Suno only. Mureka must not call Suno get-timestamped-lyrics.
 */
export function isTimedLyricsAvailableForProvider(
  musicProvider: string | null | undefined,
): boolean {
  return (musicProvider ?? "").trim().toLowerCase() === "sunoapi";
}
