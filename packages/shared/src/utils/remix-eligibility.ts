import { isMusicTrackPlaybackAvailable } from "./music-track-playback.js";

export type RemixEligibilityReason = "eligible" | "not_song" | "audio_not_ready";

export type RemixEligibilityInput = {
  /** MusicGeneration.type — Remix is for song tracks only. */
  generationType?: string | null;
  /**
   * Parent generation status is intentionally ignored.
   * A playable track may exist while status is still `processing` / `partial_success`.
   */
  audioStorageKey?: string | null;
  persistenceState?: string | null;
  persistenceErrorCode?: string | null;
  configuredStorageBucket?: string | null;
  storageObjectBucket?: string | null;
  /**
   * Optional DTO override (UI). When set, still requires a non-empty storage key
   * for API-safe remix upload, unless `allowMissingStorageKey` is true (editor
   * master URL path already proved playable audio).
   */
  playbackAvailable?: boolean | null;
  allowMissingStorageKey?: boolean;
};

export type RemixEligibility = {
  eligible: boolean;
  reason: RemixEligibilityReason;
};

/**
 * AI Remix eligibility is based on source AUDIO readiness, not generation label.
 *
 * Eligible when:
 * - type is song (or omitted);
 * - source audio is playable / stored with a storage key (unless editor override).
 *
 * Not eligible when:
 * - non-song generation;
 * - audio missing / processing / failed / STORAGE_MISSING.
 */
export function resolveRemixEligibility(
  input: RemixEligibilityInput,
): RemixEligibility {
  const type = (input.generationType ?? "song").trim().toLowerCase();
  if (type !== "song") {
    return { eligible: false, reason: "not_song" };
  }

  const storageKey = input.audioStorageKey?.trim() ?? "";

  if (typeof input.playbackAvailable === "boolean") {
    if (!input.playbackAvailable) {
      return { eligible: false, reason: "audio_not_ready" };
    }

    if (storageKey || input.allowMissingStorageKey) {
      return { eligible: true, reason: "eligible" };
    }

    return { eligible: false, reason: "audio_not_ready" };
  }

  if (!storageKey) {
    return { eligible: false, reason: "audio_not_ready" };
  }

  const playable = isMusicTrackPlaybackAvailable({
    persistenceState: input.persistenceState,
    audioStorageKey: input.audioStorageKey,
    persistenceErrorCode: input.persistenceErrorCode,
    configuredStorageBucket: input.configuredStorageBucket,
    storageObjectBucket: input.storageObjectBucket,
  });

  return playable
    ? { eligible: true, reason: "eligible" }
    : { eligible: false, reason: "audio_not_ready" };
}

export function isRemixEligible(input: RemixEligibilityInput): boolean {
  return resolveRemixEligibility(input).eligible;
}
