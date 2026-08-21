import type {
  MusicGenerationCallbackNormalizer,
  NormalizedProviderCallback,
} from "../../domain/music-generation-callback-normalizer.js";
import { mapSunoTrack } from "./suno-api.mapper.js";
import {
  sunoMusicCallbackSchema,
  type SunoMusicCallbackPayload,
} from "./suno-callback.schema.js";

const PROVIDER_ID = "sunoapi" as const;

function extractTaskId(payload: SunoMusicCallbackPayload): string | undefined {
  const raw = payload.data?.task_id ?? payload.data?.taskId;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

function mapTracks(payload: SunoMusicCallbackPayload) {
  const rawTracks = payload.data?.data ?? [];
  return (Array.isArray(rawTracks) ? rawTracks : [])
    .filter((track) => Boolean(track.id))
    .map((track) => mapSunoTrack(track));
}

/**
 * Order: validate → extract taskId → classify event.
 * Never throws Zod errors; returns invalid_payload instead.
 */
export class SunoMusicCallbackNormalizer implements MusicGenerationCallbackNormalizer {
  readonly id = PROVIDER_ID;

  normalizeCallback(rawPayload: unknown): NormalizedProviderCallback {
    const parsed = sunoMusicCallbackSchema.safeParse(rawPayload);

    if (!parsed.success) {
      return { kind: "invalid_payload", reason: "malformed_body" };
    }

    const payload = parsed.data;
    const providerTaskId = extractTaskId(payload);

    if (!providerTaskId) {
      return { kind: "ignored", reason: "missing_task_id" };
    }

    return classifySunoCallback(payload, providerTaskId);
  }
}

function classifySunoCallback(
  payload: SunoMusicCallbackPayload,
  providerTaskId: string,
): NormalizedProviderCallback {
  const callbackType = payload.data?.callbackType;
  const code = payload.code;

  if (callbackType === "error" && (code === 400 || code === 451)) {
    return {
      kind: "failed",
      providerTaskId,
      status: "failed",
      error: {
        code: code === 451 ? "DOWNLOAD_FAILED" : "CALLBACK_ERROR",
        message: payload.msg || "Music generation failed",
        rawCode: code,
      },
      rawStatus: code === 451 ? "DOWNLOAD_FAILED" : "CALLBACK_ERROR",
    };
  }

  if (code === 500 || (callbackType === "error" && code !== 400 && code !== 451)) {
    return {
      kind: "ignored",
      providerTaskId,
      reason: "provider_transient",
    };
  }

  if (code !== 200 || !payload.data) {
    return {
      kind: "ignored",
      providerTaskId,
      reason: "unmapped_code",
    };
  }

  const tracks = mapTracks(payload);

  if (callbackType === "complete") {
    return {
      kind: "completed",
      providerTaskId,
      status: "completed",
      tracks,
      rawStatus: "SUCCESS",
    };
  }

  if (callbackType === "text" || callbackType === "first") {
    return {
      kind: "progress",
      providerTaskId,
      status: "processing",
      tracks,
      rawStatus: callbackType === "first" ? "FIRST_SUCCESS" : "TEXT_SUCCESS",
    };
  }

  return {
    kind: "ignored",
    providerTaskId,
    reason: "unknown_event",
  };
}

export function createSunoMusicCallbackNormalizer(): SunoMusicCallbackNormalizer {
  return new SunoMusicCallbackNormalizer();
}
