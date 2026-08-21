import type { MusicTrackAudioStatus, MusicTrackPersistenceState } from "@ai-music/shared";
import { resolveRemixEligibility } from "@ai-music/shared";
import { isTrackPlaybackAvailable } from "@/shared/lib/is-track-playback-available";

/**
 * Editor Remix CTA: requires authoritative source track + usable master audio URL.
 * Same domain rule as API (`resolveRemixEligibility`): source audio readiness,
 * not parent generation.status.
 */
export function isEditorRemixSourcePlayable(input: {
  sourceTrackId: string | null | undefined;
  masterAudioUrl: string | null | undefined;
}): boolean {
  const sourceTrackId = input.sourceTrackId?.trim() ?? "";
  const masterAudioUrl = input.masterAudioUrl?.trim() ?? "";

  return resolveRemixEligibility({
    generationType: "song",
    playbackAvailable: Boolean(sourceTrackId && masterAudioUrl),
    allowMissingStorageKey: true,
  }).eligible;
}

export function resolveFirstPlayableRemixTrackId(
  tracks:
    | Array<{
        id: string;
        audioUrl?: string | null;
        playbackAvailable?: boolean | null;
        audioStatus?: MusicTrackAudioStatus | null;
        persistenceState?: MusicTrackPersistenceState | null;
      }>
    | undefined,
): string | null {
  if (!tracks?.length) {
    return null;
  }

  for (const track of tracks) {
    if (
      isTrackPlaybackAvailable({
        audioUrl: track.audioUrl,
        playbackAvailable: track.playbackAvailable,
        audioStatus: track.audioStatus,
        persistenceState: track.persistenceState,
      })
    ) {
      return track.id;
    }
  }

  return null;
}
