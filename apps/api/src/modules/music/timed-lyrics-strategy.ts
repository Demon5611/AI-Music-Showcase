/**
 * Provider-aware timed lyrics / Karaoke Sync routing.
 *
 * Uses Provider Affinity (persisted generation provider), never
 * MUSIC_DEFAULT_PROVIDER / active MusicProvider / My Voice toggle.
 *
 * Suno get-timestamped-lyrics requires original Suno taskId + audioId (providerTrackId).
 * Mureka Stage 1: unavailable (do not call Suno).
 */

import { resolveExistingMusicAssetProvider } from "@ai-music/shared";

export type TimedLyricsStrategy =
  | {
      kind: "suno_timestamped";
      /** MusicGeneration.providerTaskId when provider === sunoapi. */
      sunoTaskId: string;
      /** MusicGenerationTrack.providerTrackId (Suno audio id for this variant). */
      sunoAudioId: string;
    }
  | {
      kind: "unavailable";
      reason:
        | "non_suno_music_provider"
        | "missing_suno_task_id"
        | "missing_suno_audio_id"
        | "provider_affinity_mismatch"
        | "provider_affinity_unknown";
    };

export function resolveTimedLyricsStrategy(input: {
  /** Optional track.provider when present; else generation.provider. */
  trackProvider?: string | null;
  /** MusicGeneration.provider for this track — not the active/default provider. */
  musicProvider: string;
  providerTaskId: string | null | undefined;
  providerAudioId: string | null | undefined;
}): TimedLyricsStrategy {
  const affinity = resolveExistingMusicAssetProvider({
    trackProvider: input.trackProvider,
    generationProvider: input.musicProvider,
    providerTaskId: input.providerTaskId,
    providerTrackId: input.providerAudioId,
  });

  if (!affinity.ok) {
    return {
      kind: "unavailable",
      reason:
        affinity.code === "MUSIC_PROVIDER_AFFINITY_MISMATCH"
          ? "provider_affinity_mismatch"
          : "provider_affinity_unknown",
    };
  }

  if (affinity.provider !== "sunoapi") {
    return { kind: "unavailable", reason: "non_suno_music_provider" };
  }

  if (!affinity.providerTaskId) {
    return { kind: "unavailable", reason: "missing_suno_task_id" };
  }

  if (!affinity.providerTrackId) {
    return { kind: "unavailable", reason: "missing_suno_audio_id" };
  }

  return {
    kind: "suno_timestamped",
    sunoTaskId: affinity.providerTaskId,
    sunoAudioId: affinity.providerTrackId,
  };
}

export type TimedLyricsSunoIds = {
  sunoTaskId: string;
  sunoAudioId: string;
};

export type TimedLyricsStrategyErrorCode =
  | "TIMED_LYRICS_UNAVAILABLE_FOR_PROVIDER"
  | "TIMED_LYRICS_PROVIDER_IDS_MISSING"
  | "MUSIC_PROVIDER_AFFINITY_MISMATCH"
  | "MUSIC_PROVIDER_AFFINITY_UNKNOWN";

/** Maps strategy failure to a stable API error code (spend must not happen). */
export function timedLyricsStrategyErrorCode(
  strategy: Extract<TimedLyricsStrategy, { kind: "unavailable" }>,
): TimedLyricsStrategyErrorCode {
  if (strategy.reason === "provider_affinity_mismatch") {
    return "MUSIC_PROVIDER_AFFINITY_MISMATCH";
  }
  if (strategy.reason === "provider_affinity_unknown") {
    return "MUSIC_PROVIDER_AFFINITY_UNKNOWN";
  }
  if (strategy.reason === "non_suno_music_provider") {
    return "TIMED_LYRICS_UNAVAILABLE_FOR_PROVIDER";
  }

  return "TIMED_LYRICS_PROVIDER_IDS_MISSING";
}
