import { prisma } from "@ai-music/db";
import {
  createLegacyengineVoiceClients,
  isLegacyengineVoiceTaskFailed,
  isLegacyengineVoiceTaskPending,
  MusicProviderError,
  resolveLegacyengineVoiceConfig,
} from "@ai-music/ai-providers";
import type { VoiceSample } from "@ai-music/db";
import {
  MIN_VOICE_VERIFY_DURATION_SEC,
  buildLegacyengineVoiceCloneStyle,
  isVocalGender,
  isVoiceLanguage,
  normalizeVoiceLanguage,
  resolveMusicProviderUserErrorMessage,
} from "@ai-music/shared";
import { ForbiddenError, NotFoundError } from "../../common/errors.js";
import { getStorageService } from "../storage/storage.service.js";
import { toVoiceSampleDto, toVoiceSampleDtoWithPersonaCheck } from "./mapper.js";
import {
  checkPersonaAvailableWithRetry,
  PERSONA_VOICE_UNAVAILABLE_MESSAGE,
  resolvePersonaVoiceId,
} from "./persona-voice-id.service.js";
import {
  canSyncLegacyengineVoiceTask,
  isVoiceCloneCancelled,
  isVoiceCloneTimedOut,
  PREPARING_STUCK_MS,
  resolveVoiceCloneStartedAt,
  VOICE_CLONE_CANCELLED_MESSAGE,
  voiceCloneStartData,
} from "./legacyengine-voice-clone-state.js";
import { normalizeVoiceSampleMime } from "./resolve-voice-sample-mime.js";
import { resolveLegacyengineRecordVoiceId } from "./resolve-legacyengine-record-voice-id.js";

const STUCK_PHRASE_REGEN_MS = 90_000;
const MAX_STUCK_PHRASE_REGENS = 2;
const WAIT_VALIDATING_PHRASE_RETRIES = 6;
const WAIT_VALIDATING_PHRASE_DELAY_MS = 2_000;

/** Prefer per-sample language; fall back to LEGACYENGINE_VOICE_LANGUAGE for legacy rows. */
function resolveLegacyengineValidateLanguage(
  sampleLanguage: string | null | undefined,
  envFallback: string,
): string {
  if (isVoiceLanguage(sampleLanguage)) {
    return sampleLanguage;
  }

  if (isVoiceLanguage(envFallback)) {
    return envFallback;
  }

  return normalizeVoiceLanguage(sampleLanguage);
}

const EXPIRED_PHRASE_MESSAGE =
  "Фраза верификации истекла. Нажмите «Повторить верификацию» — AI Music выдаст новую фразу.";

const EMPTY_VALIDATE_PHRASE_MESSAGE =
  "AI Music не вернул текст фразы для верификации. Нажмите «Повторить верификацию». " +
  "Если ошибка повторится — запишите образец на главной заново.";

function extractValidatePhrase(validateInfo: { validateInfo?: string | null }): string | null {
  const phrase = validateInfo.validateInfo?.trim();
  return phrase ? phrase : null;
}

function isValidatePhraseGenerating(status: string): boolean {
  return status === "wait_processing" || status === "processing_validate";
}

function canRegenerateStuckPhrase(validateStatus: string, validatePhrase: string | null): boolean {
  if (isValidatePhraseGenerating(validateStatus)) {
    return true;
  }

  return validateStatus === "wait_validating" && !validatePhrase;
}

function shouldFailEmptyWaitValidating(
  sample: VoiceSample,
  validateStatus: string,
  validatePhrase: string | null,
): boolean {
  if (sample.voiceCloneStatus !== "preparing") {
    return false;
  }

  if (validateStatus !== "wait_validating" || validatePhrase) {
    return false;
  }

  return Date.now() - resolveVoiceCloneStartedAt(sample).getTime() > PREPARING_STUCK_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isExpiredVerificationPhraseMessage(message: string | null | undefined): boolean {
  const normalized = message?.trim().toLowerCase() ?? "";

  return (
    normalized.includes("phrase expired") ||
    normalized.includes("verification phrase expired") ||
    (normalized.includes("not found") && normalized.includes("phrase"))
  );
}

function mapLegacyengineVoiceFailMessage(message: string | null | undefined): string {
  const trimmed = message?.trim();

  if (!trimmed) {
    return "AI Music Voice отклонил аудио. Запишите фразу чище и напевом.";
  }

  if (isExpiredVerificationPhraseMessage(trimmed)) {
    return EXPIRED_PHRASE_MESSAGE;
  }

  if (trimmed.toLowerCase().includes("voices sound different")) {
    return (
      "Голос не совпал с первым образцом. AI Music сравнивает две записи: " +
      "запишите образец на главной и фразу здесь одним способом — " +
      "оба раза напевом или оба раза речью, тем же голосом и в том же помещении."
    );
  }

  return resolveMusicProviderUserErrorMessage(trimmed);
}

async function loadOwnedSample(userId: string, sampleId: string) {
  const sample = await prisma.voiceSample.findFirst({
    where: { id: sampleId, userId },
  });

  if (!sample) {
    throw new NotFoundError("Voice sample not found");
  }

  if (!sample.consentConfirmed || sample.status !== "ready") {
    throw new ForbiddenError("Voice sample is not ready");
  }

  return sample;
}

async function readSampleBuffer(sample: VoiceSample): Promise<Buffer> {
  const buffer = await getStorageService().get(sample.r2Key);

  if (buffer.byteLength === 0) {
    throw new ForbiddenError("Voice sample file is empty");
  }

  return buffer;
}

function resolveSampleFilename(sample: VoiceSample): string {
  const extension = sample.r2Key.split(".").pop() ?? "mp3";
  return `voice-sample-${sample.id}.${extension}`;
}

function resolveSampleMimeType(filename: string): string {
  return normalizeVoiceSampleMime(filename, "");
}

const LEGACYENGINE_VOICE_UNAVAILABLE_MESSAGE = PERSONA_VOICE_UNAVAILABLE_MESSAGE;

const INVALID_LEGACYENGINE_VOICE_ID_MESSAGE =
  "AI Music не подтвердил голос для генерации музыки. Нажмите «Повторить верификацию» — образец на главной сохранён.";

export async function reconcileReadyLegacyengineVoiceSample(
  sample: VoiceSample,
): Promise<VoiceSample> {
  if (sample.voiceCloneStatus !== "ready") {
    return sample;
  }

  const personaVoiceId = await resolvePersonaVoiceId(sample, { persistCorrection: true });

  if (personaVoiceId) {
    return prisma.voiceSample.findUniqueOrThrow({ where: { id: sample.id } });
  }

  if (sample.legacyengineVoiceId?.trim()) {
    return markInvalidPersonaVoice(sample, INVALID_LEGACYENGINE_VOICE_ID_MESSAGE);
  }

  return sample;
}

export async function syncVoiceSampleListEntry(sample: VoiceSample): Promise<VoiceSample> {
  if (sample.voiceCloneStatus === "ready") {
    return reconcileReadyLegacyengineVoiceSample(sample);
  }

  if (!sample.legacyengineVoiceTaskId) {
    return sample;
  }

  const shouldSync =
    canSyncLegacyengineVoiceTask(sample) ||
    (sample.voiceCloneStatus === "ready" && !sample.legacyengineVoiceId?.trim());

  if (!shouldSync) {
    return sample;
  }

  return syncLegacyengineVoiceTaskStatus(sample);
}

async function promoteValidatePhraseIfReady(
  sample: VoiceSample,
  validateInfo: { validateInfo?: string | null },
): Promise<VoiceSample | null> {
  const validatePhrase = extractValidatePhrase(validateInfo);

  if (!validatePhrase) {
    return null;
  }

  return prisma.voiceSample.update({
    where: { id: sample.id },
    data: {
      voiceCloneStatus: "awaiting_verification",
      legacyengineValidatePhrase: validatePhrase,
      voiceCloneError: null,
      legacyengineValidateRegenCount: 0,
    },
  });
}

async function markCloneFailed(sample: VoiceSample, message: string) {
  return prisma.voiceSample.update({
    where: { id: sample.id },
    data: {
      voiceCloneStatus: "failed",
      voiceCloneError: message,
      legacyengineValidatePhrase: null,
    },
  });
}

async function markInvalidPersonaVoice(sample: VoiceSample, message: string) {
  return prisma.voiceSample.update({
    where: { id: sample.id },
    data: {
      voiceCloneStatus: "failed",
      voiceCloneError: message,
      legacyengineVoiceId: null,
      legacyengineValidatePhrase: null,
    },
  });
}

async function claimVoiceClonePrepare(sampleId: string, userId: string): Promise<boolean> {
  const result = await prisma.voiceSample.updateMany({
    where: {
      id: sampleId,
      userId,
      voiceCloneStatus: "pending",
      legacyengineVoiceTaskId: null,
    },
    data: {
      voiceCloneStatus: "preparing",
      ...voiceCloneStartData(),
    },
  });

  return result.count > 0;
}

async function releaseVoiceClonePrepareClaim(sampleId: string): Promise<void> {
  await prisma.voiceSample.updateMany({
    where: {
      id: sampleId,
      voiceCloneStatus: "preparing",
      legacyengineVoiceTaskId: null,
    },
    data: {
      voiceCloneStatus: "pending",
      voiceCloneStartedAt: null,
      voiceCloneError: null,
    },
  });
}

async function resetLegacyengineVoiceTask(sample: VoiceSample) {
  return prisma.voiceSample.update({
    where: { id: sample.id },
    data: {
      legacyengineVoiceTaskId: null,
      legacyengineValidatePhrase: null,
      legacyengineVoiceId: null,
      voiceCloneStatus: "pending",
      voiceCloneError: null,
      voiceCloneStartedAt: null,
      legacyengineValidateRegenCount: 0,
    },
  });
}

async function maybeRegenerateStuckPhrase(
  sample: VoiceSample,
  taskId: string,
  validateStatus: string,
  validatePhrase: string | null,
  voice: ReturnType<typeof createLegacyengineVoiceClients>["voice"],
): Promise<VoiceSample | null> {
  if (sample.voiceCloneStatus !== "preparing") {
    return null;
  }

  if (!canRegenerateStuckPhrase(validateStatus, validatePhrase)) {
    return null;
  }

  if (sample.legacyengineValidateRegenCount >= MAX_STUCK_PHRASE_REGENS) {
    return null;
  }

  const elapsedMs = Date.now() - resolveVoiceCloneStartedAt(sample).getTime();

  if (elapsedMs < STUCK_PHRASE_REGEN_MS) {
    return null;
  }

  try {
    const config = resolveLegacyengineVoiceConfig();
    const newTaskId = await voice.regenerateValidationPhrase(taskId, config.callbackUrl);

    return prisma.voiceSample.update({
      where: { id: sample.id },
      data: {
        legacyengineVoiceTaskId: newTaskId,
        legacyengineValidateRegenCount: sample.legacyengineValidateRegenCount + 1,
        legacyengineValidatePhrase: null,
        ...voiceCloneStartData(),
      },
    });
  } catch {
    return null;
  }
}

async function resolveWaitValidatingPhrase(
  sample: VoiceSample,
  taskId: string,
  voice: ReturnType<typeof createLegacyengineVoiceClients>["voice"],
): Promise<VoiceSample> {
  for (let attempt = 0; attempt < WAIT_VALIDATING_PHRASE_RETRIES; attempt += 1) {
    const retryInfo = await voice.getValidationPhraseInfo(taskId);
    const promoted = await promoteValidatePhraseIfReady(sample, retryInfo);

    if (promoted) {
      return promoted;
    }

    if (attempt < WAIT_VALIDATING_PHRASE_RETRIES - 1) {
      await sleep(WAIT_VALIDATING_PHRASE_DELAY_MS);
    }
  }

  return sample;
}

async function refreshStaleVerificationPhrase(
  sample: VoiceSample,
  taskId: string,
  validateInfo: { validateInfo?: string | null; status: string },
  voice: ReturnType<typeof createLegacyengineVoiceClients>["voice"],
): Promise<VoiceSample | null> {
  if (sample.voiceCloneStatus !== "awaiting_verification") {
    return null;
  }

  if (String(validateInfo.status) !== "wait_validating") {
    return null;
  }

  if (extractValidatePhrase(validateInfo)) {
    return null;
  }

  // Phrase already stored for UI — Legacyengine often stops echoing validateInfo on poll.
  // This is not expiration; only explicit verify failure or user restart should reset.
  if (sample.legacyengineValidatePhrase?.trim()) {
    return null;
  }

  if (sample.legacyengineValidateRegenCount >= MAX_STUCK_PHRASE_REGENS) {
    return markCloneFailed(sample, EXPIRED_PHRASE_MESSAGE);
  }

  try {
    const config = resolveLegacyengineVoiceConfig();
    const newTaskId = await voice.regenerateValidationPhrase(taskId, config.callbackUrl);

    return prisma.voiceSample.update({
      where: { id: sample.id },
      data: {
        legacyengineVoiceTaskId: newTaskId,
        legacyengineValidatePhrase: null,
        voiceCloneStatus: "preparing",
        legacyengineValidateRegenCount: sample.legacyengineValidateRegenCount + 1,
        ...voiceCloneStartData(),
      },
    });
  } catch {
    return markCloneFailed(sample, EXPIRED_PHRASE_MESSAGE);
  }
}

async function syncLegacyengineVoiceTaskStatus(sample: VoiceSample) {
  if (!canSyncLegacyengineVoiceTask(sample)) {
    return sample;
  }

  if (isVoiceCloneTimedOut(sample)) {
    return markCloneFailed(
      sample,
      sample.voiceCloneStatus === "preparing"
        ? "AI Music не выдал фразу за 5 минут. Нажмите «Повторить верификацию» или загрузите образец заново."
        : "Превышено время ожидания AI Music Voice (10 мин). Попробуйте снова.",
    );
  }

  const { voice } = createLegacyengineVoiceClients();
  const taskId = sample.legacyengineVoiceTaskId!;

  const [validateInfo, recordInfo] = await Promise.all([
    voice.getValidationPhraseInfo(taskId),
    voice.getVoiceRecordInfo(taskId),
  ]);

  const staleRefresh = await refreshStaleVerificationPhrase(
    sample,
    taskId,
    validateInfo,
    voice,
  );

  if (staleRefresh) {
    return syncLegacyengineVoiceTaskStatus(staleRefresh);
  }

  const validateStatus = String(validateInfo.status);
  const recordStatus = String(recordInfo.status);
  const errorMessage =
    recordInfo.errorMessage?.trim() ||
    validateInfo.errorMessage?.trim() ||
    null;

  if (isLegacyengineVoiceTaskFailed(recordStatus)) {
    return markCloneFailed(sample, mapLegacyengineVoiceFailMessage(errorMessage));
  }

  if (isLegacyengineVoiceTaskFailed(validateStatus)) {
    const recordStillPending =
      isLegacyengineVoiceTaskPending(recordStatus) || recordStatus === "wait_validating";

    if (sample.voiceCloneStatus === "preparing" && recordStillPending) {
      return sample;
    }

    return markCloneFailed(sample, mapLegacyengineVoiceFailMessage(errorMessage));
  }

  const voiceId = resolveLegacyengineRecordVoiceId(recordInfo);

  if (recordStatus === "success" && voiceId) {
    const available = await checkPersonaAvailableWithRetry(voiceId);

    if (!available) {
      return markCloneFailed(sample, LEGACYENGINE_VOICE_UNAVAILABLE_MESSAGE);
    }

    return prisma.voiceSample.update({
      where: { id: sample.id },
      data: {
        voiceCloneStatus: "ready",
        legacyengineVoiceId: voiceId,
        voiceCloneError: null,
      },
    });
  }

  if (
    sample.voiceCloneStatus === "awaiting_verification" &&
    validateStatus === "success" &&
    (isLegacyengineVoiceTaskPending(recordStatus) || recordStatus === "success")
  ) {
    return prisma.voiceSample.update({
      where: { id: sample.id },
      data: {
        voiceCloneStatus: "cloning",
        ...voiceCloneStartData(),
      },
    });
  }

  const validatePhrase = extractValidatePhrase(validateInfo);

  if (
    sample.voiceCloneStatus === "awaiting_verification" &&
    sample.legacyengineValidatePhrase?.trim() &&
    validateStatus === "wait_validating" &&
    !validatePhrase
  ) {
    return sample;
  }

  if (validateStatus === "wait_validating" && sample.voiceCloneStatus !== "cloning") {
    if (validatePhrase) {
      const promoted = await promoteValidatePhraseIfReady(sample, validateInfo);

      if (promoted) {
        return promoted;
      }
    }

    const regeneratedWaitValidating = await maybeRegenerateStuckPhrase(
      sample,
      taskId,
      validateStatus,
      validatePhrase,
      voice,
    );

    if (regeneratedWaitValidating) {
      return syncLegacyengineVoiceTaskStatus(regeneratedWaitValidating);
    }

    if (shouldFailEmptyWaitValidating(sample, validateStatus, validatePhrase)) {
      return markCloneFailed(sample, EMPTY_VALIDATE_PHRASE_MESSAGE);
    }

    return resolveWaitValidatingPhrase(sample, taskId, voice);
  }

  if (
    sample.voiceCloneStatus === "preparing" &&
    isValidatePhraseGenerating(validateStatus)
  ) {
    const regenerated = await maybeRegenerateStuckPhrase(
      sample,
      taskId,
      validateStatus,
      validatePhrase,
      voice,
    );

    if (regenerated) {
      return syncLegacyengineVoiceTaskStatus(regenerated);
    }

    return sample;
  }

  if (sample.voiceCloneStatus === "cloning") {
    if (isLegacyengineVoiceTaskPending(recordStatus) || recordStatus === "success") {
      return sample;
    }

    return sample;
  }

  if (
    isLegacyengineVoiceTaskPending(validateStatus) ||
    isLegacyengineVoiceTaskPending(recordStatus) ||
    recordStatus === "success"
  ) {
    return sample;
  }

  return sample;
}

function mapLegacyengineVoicePrepareError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : String(error);

  if (message.toLowerCase().includes("internal error")) {
    return "Сервис AI Music временно недоступен. Подождите 1–2 минуты и нажмите «Повторить верификацию».";
  }

  if (message.toLowerCase().includes("abort")) {
    return "Загрузка в AI Music прервана по таймауту. Проверьте интернет и попробуйте снова.";
  }

  return message || "Не удалось отправить образец в AI Music Voice";
}

async function markPrepareFailed(sampleId: string, error: unknown): Promise<never> {
  const voiceCloneError = mapLegacyengineVoicePrepareError(error);

  await prisma.voiceSample.update({
    where: { id: sampleId },
    data: {
      voiceCloneStatus: "failed",
      voiceCloneError,
    },
  });

  throw new ForbiddenError(voiceCloneError);
}

function mapLegacyengineVoiceSubmitError(error: unknown): never {
  if (error instanceof MusicProviderError) {
    if (isExpiredVerificationPhraseMessage(error.message)) {
      throw new ForbiddenError(EXPIRED_PHRASE_MESSAGE);
    }

    if (error.message.toLowerCase().includes("not in valid status")) {
      throw new ForbiddenError(
        "Сессия верификации AI Music истекла или уже использована. Нажмите «Повторить» и запишите фразу снова.",
      );
    }

    if (error.message.toLowerCase().includes("internal error")) {
      throw new ForbiddenError(
        "Сервис AI Music временно недоступен. Подождите 1–2 минуты и попробуйте снова.",
      );
    }

    throw new ForbiddenError(resolveMusicProviderUserErrorMessage(error.message));
  }

  if (error instanceof Error && error.message.toLowerCase().includes("internal error")) {
    throw new ForbiddenError(
      "Сервис AI Music временно недоступен. Подождите 1–2 минуты и попробуйте снова.",
    );
  }

  throw error;
}

async function assertValidateTaskReady(
  taskId: string,
  cachedPhrase?: string | null,
): Promise<void> {
  const { voice } = createLegacyengineVoiceClients();
  let validateInfo = await voice.getValidationPhraseInfo(taskId);
  let status = String(validateInfo.status);

  if (
    status === "wait_validating" &&
    !extractValidatePhrase(validateInfo) &&
    !cachedPhrase?.trim()
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    validateInfo = await voice.getValidationPhraseInfo(taskId);
    status = String(validateInfo.status);
  }

  if (status === "wait_validating") {
    const livePhrase = extractValidatePhrase(validateInfo);

    if (livePhrase) {
      return;
    }

    // Cached phrase is still valid — Legacyengine often stops echoing validateInfo on poll.
    // Same contract as syncLegacyengineVoiceTaskStatus / refreshStaleVerificationPhrase.
    if (cachedPhrase?.trim()) {
      return;
    }

    throw new ForbiddenError(
      "Фраза для верификации ещё загружается. Подождите 10–20 секунд и обновите страницу.",
    );
  }

  if (status === "success") {
    throw new ForbiddenError(
      "Верификация уже отправлена. Обновите страницу и дождитесь создания голоса.",
    );
  }

  if (isLegacyengineVoiceTaskFailed(status)) {
    throw new ForbiddenError(
      `${mapLegacyengineVoiceFailMessage(validateInfo.errorMessage)} Нажмите «Повторить» и запишите фразу снова.`,
    );
  }

  throw new ForbiddenError(
    "AI Music ещё не готов принять запись верификации. Подождите несколько секунд и попробуйте снова.",
  );
}

export async function getLegacyengineVoiceCloneStatus(userId: string, sampleId: string) {
  let sample = await loadOwnedSample(userId, sampleId);
  sample = await syncLegacyengineVoiceTaskStatus(sample);
  return toVoiceSampleDtoWithPersonaCheck(sample, resolvePersonaVoiceId);
}

export async function cancelLegacyengineVoiceClone(userId: string, sampleId: string) {
  let sample = await loadOwnedSample(userId, sampleId);

  if (sample.voiceCloneStatus === "ready" && sample.legacyengineVoiceId) {
    return toVoiceSampleDto(sample);
  }

  if (sample.legacyengineVoiceTaskId) {
    sample = await syncLegacyengineVoiceTaskStatus(sample);

    if (sample.voiceCloneStatus === "ready") {
      return toVoiceSampleDtoWithPersonaCheck(sample, resolvePersonaVoiceId);
    }
  }

  const cancelled = await prisma.voiceSample.update({
    where: { id: sample.id },
    data: {
      legacyengineVoiceTaskId: null,
      legacyengineValidatePhrase: null,
      legacyengineVoiceId: null,
      voiceCloneStatus: "failed",
      voiceCloneError: VOICE_CLONE_CANCELLED_MESSAGE,
      voiceCloneStartedAt: null,
      legacyengineValidateRegenCount: 0,
    },
  });

  return toVoiceSampleDto(cancelled);
}

export interface PrepareLegacyengineVoiceCloneOptions {
  restart?: boolean;
}

export async function prepareLegacyengineVoiceClone(
  userId: string,
  sampleId: string,
  options: PrepareLegacyengineVoiceCloneOptions = {},
) {
  let sample = await loadOwnedSample(userId, sampleId);

  if (options.restart) {
    if (sample.legacyengineVoiceTaskId) {
      sample = await syncLegacyengineVoiceTaskStatus(sample);
    }

    const personaVoiceId = await resolvePersonaVoiceId(sample);

    if (sample.voiceCloneStatus === "ready" && personaVoiceId) {
      return toVoiceSampleDtoWithPersonaCheck(sample, resolvePersonaVoiceId);
    }

    sample = await resetLegacyengineVoiceTask(sample);
  }

  if (sample.voiceCloneStatus === "failed" && sample.legacyengineVoiceTaskId && !isVoiceCloneCancelled(sample)) {
    sample = await syncLegacyengineVoiceTaskStatus(sample);

    if (sample.voiceCloneStatus !== "failed") {
      return toVoiceSampleDto(sample);
    }

    if (!options.restart) {
      return toVoiceSampleDto(sample);
    }

    sample = await resetLegacyengineVoiceTask(sample);
  }

  if (sample.voiceCloneStatus === "failed") {
    if (!options.restart) {
      return toVoiceSampleDto(sample);
    }

    sample = await resetLegacyengineVoiceTask(sample);
  }

  if (sample.voiceCloneStatus === "ready" && sample.legacyengineVoiceId) {
    const personaVoiceId = await resolvePersonaVoiceId(sample, { persistCorrection: true });

    if (personaVoiceId) {
      return toVoiceSampleDtoWithPersonaCheck(sample, resolvePersonaVoiceId);
    }

    sample = await resetLegacyengineVoiceTask(sample);
  }

  if (
    sample.voiceCloneStatus === "awaiting_verification" &&
    sample.legacyengineValidatePhrase &&
    sample.legacyengineVoiceTaskId
  ) {
    sample = await syncLegacyengineVoiceTaskStatus(sample);
    return toVoiceSampleDto(sample);
  }

  if (
    (sample.voiceCloneStatus === "preparing" ||
      sample.voiceCloneStatus === "cloning") &&
    sample.legacyengineVoiceTaskId
  ) {
    sample = await syncLegacyengineVoiceTaskStatus(sample);
    return toVoiceSampleDto(sample);
  }

  const claimed = await claimVoiceClonePrepare(sample.id, userId);

  if (!claimed) {
    sample = await loadOwnedSample(userId, sampleId);

    if (
      sample.legacyengineVoiceTaskId &&
      (sample.voiceCloneStatus === "preparing" ||
        sample.voiceCloneStatus === "cloning" ||
        sample.voiceCloneStatus === "awaiting_verification")
    ) {
      sample = await syncLegacyengineVoiceTaskStatus(sample);
      return toVoiceSampleDto(sample);
    }

    throw new ForbiddenError(
      "Верификация уже запускается. Подождите несколько секунд и обновите страницу.",
    );
  }

  sample = await loadOwnedSample(userId, sampleId);

  const config = resolveLegacyengineVoiceConfig();

  if (!config.apiKey.trim()) {
    throw new ForbiddenError("LEGACYENGINE_API_KEY не настроен");
  }

  const buffer = await readSampleBuffer(sample);
  const filename = resolveSampleFilename(sample);
  const mimeType = resolveSampleMimeType(filename);
  const { voice, fileUpload } = createLegacyengineVoiceClients(config);

  try {
    const uploaded = await fileUpload.uploadAudio(buffer, filename, mimeType);
    const vocalEndS = Math.max(1, Math.min(sample.durationSec, 120));
    const taskId = await voice.createValidationPhrase({
      voiceUrl: uploaded.downloadUrl,
      vocalStartS: 0,
      vocalEndS,
      language: resolveLegacyengineValidateLanguage(sample.voiceLanguage, config.voiceLanguage),
      callBackUrl: config.callbackUrl,
    });

    const updated = await prisma.voiceSample.update({
      where: { id: sample.id },
      data: {
        legacyengineVoiceTaskId: taskId,
        voiceCloneStatus: "preparing",
        legacyengineValidatePhrase: null,
        legacyengineVoiceId: null,
        legacyengineValidateRegenCount: 0,
        ...voiceCloneStartData(),
      },
    });

    const synced = await syncLegacyengineVoiceTaskStatus(updated);
    return toVoiceSampleDto(synced);
  } catch (error) {
    await releaseVoiceClonePrepareClaim(sample.id);
    return markPrepareFailed(sample.id, error);
  }
}

export interface SubmitLegacyengineVoiceVerificationInput {
  userId: string;
  sampleId: string;
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
  durationSec?: number;
}

export async function submitLegacyengineVoiceVerification(
  input: SubmitLegacyengineVoiceVerificationInput,
) {
  let sample = await loadOwnedSample(input.userId, input.sampleId);

  if (sample.voiceCloneStatus === "ready" && sample.legacyengineVoiceId) {
    return toVoiceSampleDto(sample);
  }

  if (sample.legacyengineVoiceTaskId) {
    sample = await syncLegacyengineVoiceTaskStatus(sample);

    if (sample.voiceCloneStatus === "ready" && sample.legacyengineVoiceId) {
      return toVoiceSampleDto(sample);
    }

    if (sample.voiceCloneStatus === "cloning") {
      throw new ForbiddenError(
        "Голос уже создаётся. Не закрывайте страницу — обычно это занимает около минуты.",
      );
    }

    if (sample.voiceCloneStatus === "failed") {
      throw new ForbiddenError(
        sample.voiceCloneError ??
          "AI Music Voice отклонил аудио. Запишите фразу чище и напевом.",
      );
    }

    if (sample.voiceCloneStatus === "preparing") {
      throw new ForbiddenError(
        "Фраза устарела — AI Music готовит новую. Подождите 10–20 секунд, пока появится текст для записи.",
      );
    }
  }

  if (sample.voiceCloneStatus !== "awaiting_verification") {
    throw new ForbiddenError("Сначала дождитесь фразы для верификации");
  }

  if (!sample.legacyengineVoiceTaskId || !sample.legacyengineValidatePhrase?.trim()) {
    throw new ForbiddenError("Задача верификации голоса AI Music не инициализирована");
  }

  const mimeType = normalizeVoiceSampleMime(input.filename, input.mimeType);

  if (
    input.durationSec !== undefined &&
    input.durationSec < MIN_VOICE_VERIFY_DURATION_SEC
  ) {
    throw new ForbiddenError(
      `Запись слишком короткая — минимум ${MIN_VOICE_VERIFY_DURATION_SEC} сек. Произнесите фразу целиком.`,
    );
  }

  await assertValidateTaskReady(sample.legacyengineVoiceTaskId, sample.legacyengineValidatePhrase);

  const config = resolveLegacyengineVoiceConfig();
  const { voice, fileUpload } = createLegacyengineVoiceClients(config);
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { vocalGender: true },
  });
  const vocalGender = isVocalGender(user?.vocalGender) ? user.vocalGender : null;
  const uploaded = await fileUpload.uploadAudio(
    input.fileBuffer,
    input.filename,
    mimeType,
  );

  let generateTaskId: string;
  const cloneStyle = vocalGender ? buildLegacyengineVoiceCloneStyle(vocalGender) : null;

  try {
    generateTaskId = await voice.generateCustomVoice({
      taskId: sample.legacyengineVoiceTaskId,
      verifyUrl: uploaded.downloadUrl,
      voiceName: `voice-${sample.id}`,
      description: "AI Music user voice",
      singerSkillLevel: "intermediate",
      ...(cloneStyle ? { style: cloneStyle } : {}),
      callBackUrl: config.callbackUrl,
    });
  } catch (error) {
    const rawMessage =
      error instanceof MusicProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);

    if (isExpiredVerificationPhraseMessage(rawMessage)) {
      await markCloneFailed(sample, EXPIRED_PHRASE_MESSAGE);
      throw new ForbiddenError(EXPIRED_PHRASE_MESSAGE);
    }

    mapLegacyengineVoiceSubmitError(error);
  }

  const updated = await prisma.voiceSample.update({
    where: { id: sample.id },
    data: {
      legacyengineVoiceTaskId: generateTaskId,
      voiceCloneStatus: "cloning",
      ...voiceCloneStartData(),
    },
  });

  const synced = await syncLegacyengineVoiceTaskStatus(updated);
  return toVoiceSampleDtoWithPersonaCheck(synced, resolvePersonaVoiceId);
}
