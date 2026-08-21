export const MUSIC_PROVIDER_CAPACITY_RAW_STATUS = "PROVIDER_CAPACITY_EXCEEDED";

/** User-facing copy when upstream music API rejects generation (e.g. provider credits). */
export const MUSIC_PROVIDER_CAPACITY_ERROR_RU =
  "Генерация музыки сейчас недоступна: исчерпан технический лимит сервиса AI Music. " +
  "Кредиты за неудачную попытку возвращены на баланс. Попробуйте позже или обратитесь в поддержку AI Music.";

const PROVIDER_CAPACITY_PATTERN =
  /insufficient credits|not enough credits|top up|credit balance/i;

export function isMusicProviderCapacityError(message: string | null | undefined): boolean {
  if (!message?.trim()) {
    return false;
  }

  return PROVIDER_CAPACITY_PATTERN.test(message);
}

export function resolveMusicProviderUserErrorMessage(message: string): string {
  if (isMusicProviderCapacityError(message)) {
    return MUSIC_PROVIDER_CAPACITY_ERROR_RU;
  }

  return message;
}
