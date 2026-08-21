import {
  OPERATION_COST_CREDITS,
  OPERATION_COST_UNITS,
  type CreditUnits,
} from "../constants/credits-economy.js";

export function parseAlbumCoverImagesJson(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const images = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return images.length > 0 ? images : null;
}

/** Product charge for album cover — always 0 in Pricing Model v1 (never music 15/24). */
export function resolveAlbumCoverProductCostCredits(): number {
  return OPERATION_COST_CREDITS.albumCover;
}

export function resolveAlbumCoverProductCostUnits(): CreditUnits {
  return OPERATION_COST_UNITS.albumCover;
}

/** Cover variants CTA only for completed Suno music generations. */
export function canRequestAlbumCoverVariants(
  musicProvider: string | null | undefined,
): boolean {
  return (musicProvider ?? "").trim().toLowerCase() === "sunoapi";
}

export type AlbumCoverGenerationReadyInput = {
  status: string | null | undefined;
  /**
   * True when at least one song track is already stored/playable.
   * Polling may stop in this state while provider/DB status is still `processing`.
   */
  hasReadyTracks?: boolean;
};

/**
 * Cover variants are allowed once the song has usable audio.
 * `completed` / `partial_success` always qualify; `processing` qualifies only with ready tracks
 * (early stream/finalize — not pending/queued with no audio yet).
 */
export function isAlbumCoverGenerationReady(
  input: AlbumCoverGenerationReadyInput,
): boolean {
  const normalized = (input.status ?? "").trim().toLowerCase();

  if (normalized === "completed" || normalized === "partial_success") {
    return true;
  }

  return normalized === "processing" && Boolean(input.hasReadyTracks);
}
