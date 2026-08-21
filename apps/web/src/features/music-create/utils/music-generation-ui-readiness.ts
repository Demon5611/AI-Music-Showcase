import type { MusicStatusResponseDto } from "@ai-music/shared";

/** Suno generation returns two variants. */
export const EXPECTED_SONG_VARIANTS = 2;

/**
 * Mureka Voice-to-Song poll/UX expects one output.
 * Keep equal to `MUREKA_OUTPUT_COUNT` in `@ai-music/shared`.
 */
export const EXPECTED_MUREKA_SONG_VARIANTS = 1;

export function resolveExpectedSongVariants(provider?: string | null): number {
  return provider === "mureka" ? EXPECTED_MUREKA_SONG_VARIANTS : EXPECTED_SONG_VARIANTS;
}

export type MusicGenerationUiState =
  | "idle"
  | "submitting"
  | "generating"
  | "waiting_for_first_track"
  | "first_track_ready"
  | "waiting_for_remaining_tracks"
  | "ready"
  | "failed";

type StatusTrack = NonNullable<MusicStatusResponseDto["tracks"]>[number];

export function isMusicGenerationTrackPlayable(
  track: Pick<
    StatusTrack,
    "audioUrl" | "persistenceState" | "playbackAvailable" | "audioStatus"
  >,
): boolean {
  if (typeof track.playbackAvailable === "boolean") {
    return track.playbackAvailable && Boolean(track.audioUrl?.trim());
  }

  if (track.audioStatus) {
    return track.audioStatus === "stored" && Boolean(track.audioUrl?.trim());
  }

  if (!track.audioUrl?.trim()) {
    return false;
  }

  if (!track.persistenceState) {
    return true;
  }

  return track.persistenceState === "stored";
}

/** Track will not become playable without a new generation. */
export function isMusicGenerationTrackTerminal(
  track: Pick<
    StatusTrack,
    "audioUrl" | "persistenceState" | "playbackAvailable" | "audioStatus"
  >,
): boolean {
  if (isMusicGenerationTrackPlayable(track)) {
    return true;
  }

  if (track.audioStatus === "failed" || track.audioStatus === "missing") {
    return true;
  }

  return track.persistenceState === "failed";
}

export function countPlayableMusicGenerationTracks(
  tracks: MusicStatusResponseDto["tracks"] | null | undefined,
): number {
  return (tracks ?? []).filter(isMusicGenerationTrackPlayable).length;
}

/**
 * Poll until first playable exists and remaining variants settle (or fail).
 * Provider `completed` alone is not enough — tracks may still be hydrating/persisting.
 *
 * Missing second row after first playable must NOT terminate as partial failure:
 * keep polling until the second row appears, an explicit per-track failure exists
 * for the full variant set, or the caller hits its bounded poll timeout.
 */
export function isMusicGenerationPollTerminal(
  data: MusicStatusResponseDto | undefined,
  expectedVariants?: number,
): boolean {
  if (!data) {
    return true;
  }

  const expected = expectedVariants ?? resolveExpectedSongVariants(data.provider);

  if (data.status === "failed") {
    return true;
  }

  const tracks = data.tracks ?? [];
  const playableCount = countPlayableMusicGenerationTracks(tracks);

  if (playableCount >= expected) {
    return true;
  }

  // Still waiting for DB/storage hydration after provider completion.
  if (tracks.length === 0) {
    return false;
  }

  const allKnownTerminal = tracks.every(isMusicGenerationTrackTerminal);

  if (!allKnownTerminal) {
    return false;
  }

  // Full variant set present and every row settled (playable and/or failed).
  if (tracks.length >= expected) {
    return true;
  }

  // Explicit second-failure signal without a second row (backend partial marker).
  if (playableCount > 0 && isExplicitPartialSuccessSignal(data)) {
    return true;
  }

  // Fewer rows than expected and no explicit partial failure — keep polling.
  return false;
}

function isExplicitPartialSuccessSignal(data: MusicStatusResponseDto): boolean {
  const raw = (data.rawStatus ?? "").trim().toUpperCase();
  return raw === "PARTIAL_SUCCESS" || raw.includes("PARTIAL_SUCCESS");
}

export function resolveMusicGenerationUiState(input: {
  isSubmitting?: boolean;
  status: MusicStatusResponseDto | null | undefined;
  isPolling?: boolean;
  expectedVariants?: number;
}): MusicGenerationUiState {
  const expected =
    input.expectedVariants ?? resolveExpectedSongVariants(input.status?.provider);
  const status = input.status;

  if (input.isSubmitting) {
    return "submitting";
  }

  if (!status && !input.isPolling) {
    return "idle";
  }

  if (status?.status === "failed") {
    return "failed";
  }

  const playableCount = countPlayableMusicGenerationTracks(status?.tracks);
  const tracks = status?.tracks ?? [];
  const unresolvedCount = tracks.filter((track) => !isMusicGenerationTrackTerminal(track)).length;
  const waitingForMore =
    playableCount > 0 &&
    playableCount < expected &&
    (Boolean(input.isPolling) || unresolvedCount > 0);

  if (playableCount >= expected) {
    return "ready";
  }

  if (playableCount > 0 && waitingForMore) {
    return "waiting_for_remaining_tracks";
  }

  if (playableCount > 0) {
    return "first_track_ready";
  }

  if (status?.status === "completed" || status?.audioPersistence === "saving") {
    return "waiting_for_first_track";
  }

  if (status?.status === "processing" || status?.status === "pending" || input.isPolling) {
    return "generating";
  }

  return "idle";
}

export function shouldShowMusicGenerationGlobalLoader(
  uiState: MusicGenerationUiState,
): boolean {
  return (
    uiState === "submitting" ||
    uiState === "generating" ||
    uiState === "waiting_for_first_track"
  );
}

export function countPendingSongVariantSlots(input: {
  status: MusicStatusResponseDto | null | undefined;
  isPolling: boolean;
  expectedVariants?: number;
}): { preparing: number; failed: number } {
  const expected =
    input.expectedVariants ?? resolveExpectedSongVariants(input.status?.provider);
  const tracks = input.status?.tracks ?? [];
  const playableCount = countPlayableMusicGenerationTracks(tracks);
  const remaining = Math.max(0, expected - playableCount);

  if (remaining === 0) {
    return { preparing: 0, failed: 0 };
  }

  const hasUnresolved = tracks.some((track) => !isMusicGenerationTrackTerminal(track));

  if (input.isPolling || hasUnresolved) {
    return { preparing: remaining, failed: 0 };
  }

  return { preparing: 0, failed: remaining };
}
