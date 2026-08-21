import {
  CONTENT_MODERATION_ERROR_RU,
  isMusicProviderCapacityError,
  MUSIC_PROVIDER_CAPACITY_ERROR_RU,
  MUSIC_PROVIDER_CAPACITY_RAW_STATUS,
} from "@ai-music/shared";

const REMIX_REFERENCE_AUDIO_ERROR_RU =
  "Не удалось получить исходное аудио для ремикса. Попробуйте создать ремикс ещё раз.";

export type MusicGenerationErrorDisplay = {
  rawStatus: string | null;
  errorMessage: string | null;
};

export function resolveMusicGenerationErrorDisplay(
  rawStatus: string | null | undefined,
  errorMessage: string | null | undefined,
): MusicGenerationErrorDisplay {
  if (rawStatus === "SENSITIVE_WORD_ERROR") {
    return {
      rawStatus: "CONTENT_MODERATION",
      errorMessage: CONTENT_MODERATION_ERROR_RU,
    };
  }

  const message = errorMessage?.trim();

  if (!message) {
    return {
      rawStatus: rawStatus ?? null,
      errorMessage: null,
    };
  }

  if (/file fetch failed/i.test(message)) {
    return {
      rawStatus: rawStatus ?? "REFERENCE_AUDIO_ERROR",
      errorMessage: REMIX_REFERENCE_AUDIO_ERROR_RU,
    };
  }

  if (isMusicProviderCapacityError(message)) {
    return {
      rawStatus: rawStatus ?? MUSIC_PROVIDER_CAPACITY_RAW_STATUS,
      errorMessage: MUSIC_PROVIDER_CAPACITY_ERROR_RU,
    };
  }

  return {
    rawStatus: rawStatus ?? null,
    errorMessage: message,
  };
}
