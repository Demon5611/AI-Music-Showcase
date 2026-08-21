import { VOICE_VERIFY_PHRASE_TTL_SEC } from "./constants/index.js";

/** Маркер текста ошибки API про истечение фразы (не клиентский description). */
export const VERIFY_PHRASE_EXPIRED_ERROR_MARKER = "Фраза верификации истекла";

/** Оставшиеся секунды до истечения фразы верификации, либо null если якорь неизвестен. */
export function resolveVerifyPhraseRemainingSec(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!startedAt) {
    return null;
  }

  const startedMs = new Date(startedAt).getTime();

  if (Number.isNaN(startedMs)) {
    return null;
  }

  const elapsedSec = Math.floor((nowMs - startedMs) / 1000);
  return Math.max(0, VOICE_VERIFY_PHRASE_TTL_SEC - elapsedSec);
}

/**
 * Фраза истекла. При неизвестном якоре возвращает false — безопасный дефолт,
 * чтобы не форсить restart без данных.
 */
export function isVerifyPhraseExpired(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const remaining = resolveVerifyPhraseRemainingSec(startedAt, nowMs);
  return remaining !== null && remaining <= 0;
}

/**
 * Красный API-текст «фраза истекла» при живом countdown и awaiting — рассинхрон.
 * Подавляет только если remainingSec > 0 (якорь известен).
 */
export function isStaleVerifyPhraseExpiredError(
  message: string | null | undefined,
  startedAt: string | null | undefined,
  voiceCloneStatus: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!message?.includes(VERIFY_PHRASE_EXPIRED_ERROR_MARKER)) {
    return false;
  }

  if (voiceCloneStatus !== "awaiting_verification") {
    return false;
  }

  const remaining = resolveVerifyPhraseRemainingSec(startedAt, nowMs);
  return remaining !== null && remaining > 0;
}

export function formatVerifyPhraseCountdown(remainingSec: number): string {
  const safeSec = Math.max(0, remainingSec);
  const minutes = Math.floor(safeSec / 60);
  const seconds = safeSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
