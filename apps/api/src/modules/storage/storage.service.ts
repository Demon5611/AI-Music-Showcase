import { extname } from "node:path";
import {
  buildMusicTrackAudioKey,
  buildSongRenderKey,
  buildSongStemKey,
  buildSongWavExportKey,
  buildTrackAudioKey,
  buildVoiceSampleKey,
} from "@ai-music/shared";
import {
  assertAllowedUploadMime,
  assertUploadSize,
  getStorageService,
} from "./storage.factory.js";
import { getApiEnv } from "../../config/env.js";

export {
  buildMusicTrackAudioKey,
  buildSongRenderKey,
  buildSongStemKey,
  buildSongWavExportKey,
  buildTrackAudioKey,
  buildVoiceSampleKey,
};

export type StorageService = ReturnType<typeof getStorageService>;

const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

export { getStorageService, assertAllowedUploadMime, assertUploadSize };

export function resolveVoiceSampleExtension(filename: string, mimeType: string): string {
  const fromName = extname(filename).replace(/^\./, "").toLowerCase();

  if (fromName) {
    return fromName;
  }

  return MIME_TO_EXTENSION[mimeType] ?? "bin";
}

export async function createSignedReadUrl(key: string, ttlSeconds?: number): Promise<string> {
  const env = getApiEnv();
  return getStorageService().getSignedReadUrl(
    key,
    ttlSeconds ?? env.R2_SIGNED_URL_TTL_SECONDS,
  );
}

export async function createSignedWriteUrl(
  key: string,
  contentType: string,
  ttlSeconds?: number,
): Promise<string> {
  const env = getApiEnv();
  assertAllowedUploadMime(contentType, contentType.startsWith("image/") ? "image" : "audio");

  return getStorageService().getSignedWriteUrl({
    key,
    contentType,
    ttlSeconds: ttlSeconds ?? env.R2_SIGNED_URL_TTL_SECONDS,
  });
}
