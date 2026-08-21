import type { EditOperation, EditorTrackId, SongRegionDto } from "../types/music-editor.js";

export const DEFAULT_FADE_DURATION_MS = 800;

export interface RegionFadeInEnvelope {
  startMs: number;
  durationMs: number;
}

export interface RegionFadeOutEnvelope {
  startMs: number;
  durationMs: number;
}

export interface RegionFadeEnvelope {
  fadeIn?: RegionFadeInEnvelope;
  fadeOut?: RegionFadeOutEnvelope;
}

export function resolveRegionFadeEnvelope(
  trackId: EditorTrackId,
  region: SongRegionDto,
  operations: EditOperation[],
): RegionFadeEnvelope {
  const envelope: RegionFadeEnvelope = {};
  const regionDurationMs = region.endMs - region.startMs;

  for (const operation of operations) {
    if (
      operation.type !== "FADE" ||
      operation.trackId !== trackId ||
      operation.regionId !== region.id
    ) {
      continue;
    }

    const rangeStartMs = operation.rangeStartMs ?? region.startMs;
    const rangeEndMs = operation.rangeEndMs ?? region.endMs;
    const rangeStartRelativeMs = Math.max(0, rangeStartMs - region.startMs);
    const rangeEndRelativeMs = Math.min(regionDurationMs, rangeEndMs - region.startMs);
    const rangeLengthMs = Math.max(0, rangeEndRelativeMs - rangeStartRelativeMs);

    if (rangeLengthMs <= 0) {
      continue;
    }

    const fadeDurationMs = Math.min(operation.durationMs, rangeLengthMs);

    if (operation.fadeType === "in") {
      envelope.fadeIn = {
        startMs: rangeStartRelativeMs,
        durationMs: fadeDurationMs,
      };
      continue;
    }

    envelope.fadeOut = {
      startMs: Math.max(0, rangeEndRelativeMs - fadeDurationMs),
      durationMs: fadeDurationMs,
    };
  }

  return envelope;
}

export function regionFadeEnvelopeHasEffect(envelope: RegionFadeEnvelope): boolean {
  return envelope.fadeIn !== undefined || envelope.fadeOut !== undefined;
}

export function resolveFadeGainAtRegionMs(
  regionRelativeMs: number,
  envelope: RegionFadeEnvelope,
): number {
  let gain = 1;

  if (envelope.fadeIn) {
    const { startMs, durationMs } = envelope.fadeIn;

    if (regionRelativeMs >= startMs && regionRelativeMs < startMs + durationMs) {
      gain *= (regionRelativeMs - startMs) / durationMs;
    }
  }

  if (envelope.fadeOut) {
    const { startMs, durationMs } = envelope.fadeOut;
    const fadeOutEndMs = startMs + durationMs;

    if (regionRelativeMs >= startMs && regionRelativeMs < fadeOutEndMs) {
      gain *= (fadeOutEndMs - regionRelativeMs) / durationMs;
    }
  }

  return gain;
}
