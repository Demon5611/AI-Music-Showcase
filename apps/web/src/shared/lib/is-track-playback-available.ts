import type { MusicTrackAudioStatus, MusicTrackPersistenceState } from "@ai-music/shared";

/**
 * Prefer server `playbackAvailable` / `audioStatus` when present.
 * Avoid creating audio src for missing/failed tracks (409 storm).
 */
export function isTrackPlaybackAvailable(input: {
  audioUrl: string | null | undefined;
  persistenceState?: MusicTrackPersistenceState | null;
  playbackAvailable?: boolean | null;
  audioStatus?: MusicTrackAudioStatus | null;
}): boolean {
  if (typeof input.playbackAvailable === "boolean") {
    return input.playbackAvailable && Boolean(input.audioUrl?.trim());
  }

  if (input.audioStatus) {
    return input.audioStatus === "stored" && Boolean(input.audioUrl?.trim());
  }

  if (!input.audioUrl?.trim()) {
    return false;
  }

  if (!input.persistenceState) {
    return true;
  }

  return input.persistenceState === "stored";
}
