import type {
  MusicGenerationRecordStatus,
  MusicTrackAudioPersistence,
  MusicTrackPersistenceState,
} from "./types/music-generation.js";

export function resolveMusicTrackAudioPersistence(
  status: MusicGenerationRecordStatus,
  tracks: Array<{ persistenceState: MusicTrackPersistenceState }>,
): MusicTrackAudioPersistence {
  // Provider finished but track rows are not hydrated yet — still persisting for UX/poll.
  if (status === "completed" && tracks.length === 0) {
    return "saving";
  }

  if (status !== "completed" || tracks.length === 0) {
    return "none";
  }

  if (tracks.every((track) => track.persistenceState === "stored")) {
    return "ready";
  }

  if (
    tracks.some((track) => track.persistenceState === "failed") &&
    tracks.every(
      (track) =>
        track.persistenceState === "stored" || track.persistenceState === "failed",
    )
  ) {
    return "failed";
  }

  return "saving";
}
