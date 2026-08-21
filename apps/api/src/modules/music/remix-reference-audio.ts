import {
  createSunoVoiceClients,
  MusicProviderUnavailableError,
  resolveSunoVoiceConfig,
} from "@ai-music/ai-providers";
import { BadRequestError, ForbiddenError } from "../../common/errors.js";
import { getStorageService } from "../storage/storage.service.js";

const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_500;

const REMIX_UPLOAD_UNAVAILABLE_RU =
  "Не удалось загрузить аудио для ремикса. Сервис временно недоступен — повторите попытку позже.";

const REMIX_AUDIO_UNAVAILABLE_RU =
  "Ремикс недоступен: исходное аудио не готово.";

type TrackAudioSource = {
  id: string;
  audioStorageKey: string | null;
};

async function loadTrackAudioBuffer(track: TrackAudioSource): Promise<Buffer> {
  const storageKey = track.audioStorageKey?.trim();

  if (!storageKey) {
    throw new BadRequestError(REMIX_AUDIO_UNAVAILABLE_RU);
  }

  return getStorageService().get(storageKey);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("fetch failed") ||
    message.includes("connect timeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up")
  );
}

async function uploadRemixAudioWithRetry(
  data: Uint8Array,
  filename: string,
): Promise<string> {
  const config = resolveSunoVoiceConfig();
  const { fileUpload } = createSunoVoiceClients(config);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      const uploaded = await fileUpload.uploadAudio(data, filename, "audio/mpeg");
      return uploaded.downloadUrl;
    } catch (error) {
      lastError = error;

      if (!isRetryableUploadError(error) || attempt >= MAX_UPLOAD_ATTEMPTS) {
        break;
      }

      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw new MusicProviderUnavailableError("sunoapi", REMIX_UPLOAD_UNAVAILABLE_RU, lastError);
}

/**
 * Suno upload-cover needs a fetchable URL.
 * Trust boundary: load bytes only from internal R2 storage key for sourceTrackId,
 * then upload via Suno File API. Never accept client-supplied audio URLs.
 */
export async function uploadRemixReferenceAudioUrl(track: TrackAudioSource): Promise<string> {
  const config = resolveSunoVoiceConfig();

  if (!config.apiKey.trim()) {
    throw new ForbiddenError("SUNO_API_KEY не настроен");
  }

  const buffer = await loadTrackAudioBuffer(track);
  const filename = `remix-${track.id}.mp3`;

  return uploadRemixAudioWithRetry(new Uint8Array(buffer), filename);
}
