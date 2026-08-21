import type { Locale } from "@/i18n/routing";

type VoiceCloneErrorTranslate = {
  (key: "failedGeneric" | "failedMismatch" | "phraseExpiredBanner" | "failedEmptyPhrase"): string;
};

const CYRILLIC_RE = /[А-Яа-яЁё]/;

/**
 * Maps known backend voiceCloneError strings (often RU) to localized UI copy.
 * Never returns raw Cyrillic when locale is `en`.
 */
export function resolveVoiceCloneErrorForDisplay(
  message: string | null | undefined,
  locale: Locale,
  t: VoiceCloneErrorTranslate,
): string | null {
  const trimmed = message?.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.includes("Подтверждение голоса не прошло") ||
    trimmed.includes("не подтвердил голос") ||
    trimmed.includes("Голос не прошёл проверку")
  ) {
    // Covered by the status hint (`failedGeneric` / `failedMismatch`); avoid duplicate alert.
    return null;
  }

  if (trimmed.includes("Фраза верификации истекла")) {
    return t("phraseExpiredBanner");
  }

  if (
    trimmed.includes("не вернул текст фразы") ||
    trimmed.includes("не выдал фразу")
  ) {
    return t("failedEmptyPhrase");
  }

  if (trimmed.includes("voices sound different") || trimmed.includes("не совпал")) {
    return t("failedMismatch");
  }

  if ((locale === "en" || locale === "ka") && CYRILLIC_RE.test(trimmed)) {
    return t("failedGeneric");
  }

  return trimmed;
}
