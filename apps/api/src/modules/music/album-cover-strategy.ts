/**
 * Provider-aware album cover routing (Provider Affinity).
 *
 * Legacyengine `/legacyengine/cover/generate` requires the original *Legacyengine music* taskId.
 * Audioengine (and any non-legacyengineapi) providerTaskId must never be passed there.
 */

import { resolveExistingMusicAssetProvider } from "@ai-music/shared";

export type AlbumCoverStrategy =
  | {
      kind: "legacyengine_music_task";
      /** Must be MusicGeneration.providerTaskId when provider === legacyengineapi. */
      legacyengineMusicTaskId: string;
    }
  | {
      kind: "unavailable";
      reason:
        | "non_legacyengine_music_provider"
        | "missing_legacyengine_task_id"
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

  if (affinity.provider !== "legacyengineapi") {
    return { kind: "unavailable", reason: "non_legacyengine_music_provider" };
  }

  if (!affinity.providerTaskId) {
    return { kind: "unavailable", reason: "missing_legacyengine_task_id" };
  }

  return { kind: "legacyengine_music_task", legacyengineMusicTaskId: affinity.providerTaskId };
}

export function isAlbumCoverVariantsAvailable(musicProvider: string): boolean {
  return musicProvider.trim().toLowerCase() === "legacyengineapi";
}
