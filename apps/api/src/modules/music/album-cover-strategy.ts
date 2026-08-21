/**
 * Provider-aware album cover routing (Provider Affinity).
 *
 * Suno `/suno/cover/generate` requires the original *Suno music* taskId.
 * Mureka (and any non-sunoapi) providerTaskId must never be passed there.
 */

import { resolveExistingMusicAssetProvider } from "@ai-music/shared";

export type AlbumCoverStrategy =
  | {
      kind: "suno_music_task";
      /** Must be MusicGeneration.providerTaskId when provider === sunoapi. */
      sunoMusicTaskId: string;
    }
  | {
      kind: "unavailable";
      reason:
        | "non_suno_music_provider"
        | "missing_suno_task_id"
        | "provider_affinity_mismatch"
        | "provider_affinity_unknown";
    };

export function resolveAlbumCoverStrategy(input: {
  trackProvider?: string | null;
  musicProvider: string;
  providerTaskId: string | null | undefined;
}): AlbumCoverStrategy {
  const affinity = resolveExistingMusicAssetProvider({
    trackProvider: input.trackProvider,
    generationProvider: input.musicProvider,
    providerTaskId: input.providerTaskId,
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

  return { kind: "suno_music_task", sunoMusicTaskId: affinity.providerTaskId };
}

export function isAlbumCoverVariantsAvailable(musicProvider: string): boolean {
  return musicProvider.trim().toLowerCase() === "sunoapi";
}
