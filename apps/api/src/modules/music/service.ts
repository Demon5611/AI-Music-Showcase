import {
  createLyricsEngine,
  createMusicGenerationProvider,
  getAudioengineGenerationOptions,
  getLegacyengineGenerationOptions,
  isInstrumentalMode,
  resolveMusicProviderConfig,
  resolveMusicProviderId,
  toPersistedSongInput,
  type MusicProviderId,
} from "@ai-music/ai-providers";
import { randomUUID } from "node:crypto";
import type { GenerateSongInput } from "@ai-music/ai-providers";
import {
  musicGenerationStartedTotal,
  musicProviderPollDurationSeconds,
  audioengineGenerationStartedTotal,
  audioengineEstimatedCostUsdTotal,
  observeDuration,
} from "@ai-music/observability";
import {
  createMusicGenerationRecord,
  deleteMusicGenerationTrack,
  deleteMusicGenerations,
  listMusicGenerationHistory,
  resolveApiBaseUrl,
  syncMusicGenerationRecord,
} from "./music-record.service.js";
import { toMusicGenerationRecordDto, toMusicStatusResponse } from "./music-record.mapper.js";
import { resolveMusicQueueEtaSec, resolveMusicQueuePhase } from "./music-queue-meta.js";
import {
  buildPersonaSongInput,
  resolveMusicPersonaForUser,
  type MusicGenerateLogger,
} from "./music-persona.js";
import {
  assertAudioengineGenerateAllowed,
  buildAudioengineSongInput,
  loadReadyAudioengineVoiceProfile,
  audioengineSpendAmountUnits,
  audioengineSpendIdempotencyKey,
  resolveProviderOrThrow,
} from "./music-generate-audioengine.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InsufficientCreditsError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../common/errors.js";
import { getApiEnv } from "../../config/env.js";
import { refundOriginalSpend, spendCredits } from "../credits/service.js";
import { isAudioengineWorkerListenHeartbeatFresh } from "./audioengine-worker-heartbeat.js";
import {
  assertMaxDuration,
  assertMusicGenerationMode,
  getQueuePriorityForUser,
  getUserEntitlements,
} from "../billing/entitlements.service.js";
import { enqueueProviderJob } from "../queue/provider-job-queue.js";
import { enqueueAudioengineProviderJob } from "../queue/audioengine-provider-job-queue.js";
import {
  assertProviderQueueCapacity,
  getProviderQueueMetrics,
} from "../queue/provider-queue-metrics.js";
import {
  buildLyricsGenerationProviderPrompt,
  buildLyricsLanguageInstruction,
  checkContentAllowed,
  CONTENT_MODERATION_ERROR_RU,
  isVocalGender,
  logLoadControl,
  AUDIOENGINE_ECONOMICS,
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  buildLyricsRefundKey,
  buildLyricsSpendKey,
  buildAudioengineMusicRefundKey,
  buildAudioengineMusicSpendKey,
  normalizeLyricsLanguage,
  OPERATION_COST_UNITS,
  PROVIDER_JOB_QUEUE_NAME,
  resolveEffectiveDurationSecForPlan,
  resolveLyricsBriefMaxLength,
  resolveLyricsDurationSecForPlan,
  resolveLyricsLanguage,
  resolveManualLyricsMaxLength,
  resolveAudioengineFeatureFlags,
  resolveAudioenginePersonalVoiceAvailability,
  estimateAudioengineLyricsToSongUsdMicros,
  formatUsdFromMicros,
  AUDIOENGINE_OUTPUT_COUNT,
  usdMicrosToNumber,
  LEGACYENGINE_LYRICS_PROMPT_MAX_LENGTH,
  truncateLyricsForDuration,
  type LyricsLanguage,
  type MusicBrief,
} from "@ai-music/shared";
import {
  InsufficientCreditsLedgerError,
  prisma,
  Prisma,
  spendCreditsInTransaction,
  tryLockUserCreditsInTransaction,
  type MusicGeneration,
} from "@ai-music/db";
import {
  COMMIT_RETRY_BUDGET_MS,
  CreditLockBusyError,
  commitRetryReason,
  isPrismaInteractiveTransactionGoneError,
  isUniqueConstraintError,
  runWithCommitTransactionRetry,
} from "./commit-music-generation-retry.js";
import {
  buildCanonicalMusicGenerateRequest,
  hashCanonicalRequest,
} from "./music-generate-idempotency.js";

/** Lyrics always use Legacyengine lyrics engine — independent of song MUSIC_DEFAULT_PROVIDER. */
const lyricsEngine = createLyricsEngine();
const CONTENT_MODERATION_ERROR_CODE = "CONTENT_MODERATION";

type QueueableMusicGeneration = Pick<
  MusicGeneration,
  | "id"
  | "userId"
  | "provider"
  | "providerTaskId"
  | "providerRequestJson"
  | "clientRequestHash"
  | "status"
>;

function assertModerationForNonEmptyText(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const moderationResult = checkContentAllowed(trimmed);
  if (!moderationResult.allowed) {
    throw new BadRequestError(moderationResult.reasonMessageRu, CONTENT_MODERATION_ERROR_CODE);
  }
}

export async function getMusicTestStatus() {
  const config = resolveMusicProviderConfig();
  const provider = resolveMusicProviderId();
  const env = getApiEnv();
  const personalVoice = resolveAudioenginePersonalVoiceAvailability({
    appEnv: env.APP_ENV,
  });
  const workerHeartbeatFresh =
    personalVoice.available && personalVoice.workerListenReady
      ? await isAudioengineWorkerListenHeartbeatFresh()
      : false;

  return {
    provider,
    configured:
      provider === "audioengine"
        ? Boolean(process.env.AUDIOENGINE_API_KEY?.trim())
        : Boolean(config.legacyengineApiKey.trim()),
    personalVoice: {
      available: personalVoice.available,
      reason: personalVoice.reason,
      productionRolloutEnabled: personalVoice.productionRolloutEnabled,
      workerListenReady: personalVoice.workerListenReady,
      workerHeartbeatFresh,
    },
  };
}

export async function generateMusicForUser(
  userId: string,
  input: GenerateSongInput,
  options: {
    voiceSampleId?: string;
    voiceProfileId?: string;
    usePersonalVoice?: boolean;
    musicBrief?: MusicBrief;
    clientRequestId?: string;
  } = {},
  log?: MusicGenerateLogger,
) {
  // Product contract: Audioengine only when Personal Voice toggle is ON.
  // Ready VoiceProfile alone must not select Audioengine or load vocal_id.
  const wantsPersonalVoice = options.usePersonalVoice === true;

  // "auto" is product UI mode — resolve before any provider language matrix check.
  const requestedLyricsLanguage = normalizeLyricsLanguage(input.lyricsLanguage);
  const resolvedLanguage = resolveLyricsLanguage({
    selectedLanguage: requestedLyricsLanguage,
    prompt: input.prompt,
    customLyrics: input.prompt,
  });
  const inputWithResolvedLanguage: GenerateSongInput = {
    ...input,
    lyricsLanguage: resolvedLanguage.code,
  };

  const voiceProfile = wantsPersonalVoice
    ? await loadReadyAudioengineVoiceProfile(userId, options.voiceProfileId)
    : null;

  if (wantsPersonalVoice && !voiceProfile) {
    throw new ForbiddenError(
      "Персональный AI-голос ещё не готов. Создайте его в разделе голоса.",
    );
  }

  const flags = resolveAudioengineFeatureFlags();
  const defaultProvider = resolveMusicProviderId();
  const providerId = resolveProviderOrThrow({
    explicitProvider:
      inputWithResolvedLanguage.providerOptions?.providerId === "audioengine" ||
      inputWithResolvedLanguage.providerOptions?.providerId === "legacyengineapi"
        ? inputWithResolvedLanguage.providerOptions.providerId
        : undefined,
    hasPersonalAudioengineVoice: wantsPersonalVoice && Boolean(voiceProfile),
    lyricsLanguage: resolvedLanguage.code,
  });

  logLoadControl("music_provider_resolved", {
    provider: providerId,
    defaultProvider,
    audioengineEnabled: flags.enabled,
    personalVoiceEnabled: flags.personalVoiceEnabled,
    productionRolloutEnabled: flags.productionRolloutEnabled,
    wantsPersonalVoice,
    hasVoiceProfile: Boolean(voiceProfile),
    requestedLyricsLanguage,
    resolvedLyricsLanguage: resolvedLanguage.code,
    lyricsLanguageSource: resolvedLanguage.source,
    model: flags.model,
    status: "resolved",
  });

  if (providerId === "audioengine") {
    if (!voiceProfile) {
      throw new ForbiddenError(
        "Персональный AI-голос ещё не готов. Создайте его в разделе голоса.",
      );
    }

    return generateAudioengineMusicForUser(
      userId,
      inputWithResolvedLanguage,
      {
        voiceProfile,
        musicBrief: options.musicBrief,
        clientRequestId: options.clientRequestId,
      },
      log,
    );
  }

  // OFF / non-personal: Legacyengine standard AI vocal — never require VoiceProfile / Legacyengine persona.
  return generateLegacyengineMusicForUser(
    userId,
    inputWithResolvedLanguage,
    {
      voiceSampleId: undefined,
      clientRequestId: options.clientRequestId,
      requirePersona: false,
    },
    log,
  );
}

async function generateAudioengineMusicForUser(
  userId: string,
  input: GenerateSongInput,
  options: {
    voiceProfile: NonNullable<Awaited<ReturnType<typeof loadReadyAudioengineVoiceProfile>>>;
    musicBrief?: MusicBrief;
    clientRequestId?: string;
  },
  log?: MusicGenerateLogger,
) {
  await assertAudioengineGenerateAllowed();

  const songInput = buildAudioengineSongInput({
    base: input,
    vocalId: options.voiceProfile.externalId,
    voiceProfileId: options.voiceProfile.id,
    musicBrief: options.musicBrief,
  });

  const canonicalRequest = buildCanonicalMusicGenerateRequest(songInput, {
    voiceProfileId: options.voiceProfile.id,
  });
  const clientRequestHash = hashCanonicalRequest(canonicalRequest);
  const existingRecord = await findIdempotentMusicGeneration(
    userId,
    options.clientRequestId,
    clientRequestHash,
  );

  if (existingRecord) {
    await retryEnqueueQueuedMusicGeneration(existingRecord, log);
    return toMusicGenerateResponse(existingRecord);
  }

  assertModerationForNonEmptyText(songInput.prompt);
  assertModerationForNonEmptyText(songInput.style ?? "");
  assertModerationForNonEmptyText(songInput.title ?? "");

  const entitlements = await getUserEntitlements(userId);
  const effectiveDurationSec = resolveEffectiveDurationSecForPlan(
    entitlements.planId,
    songInput.durationSec ?? 0,
  );

  await assertMaxDuration(userId, effectiveDurationSec);
  await assertLyricsTextLengthForUser(userId, songInput.prompt, songInput.durationSec ?? 0);

  const finalInput: GenerateSongInput = {
    ...songInput,
    durationSec: effectiveDurationSec,
    // Already resolved upstream — never re-normalize (would map "multi" → "auto").
    lyricsLanguage: songInput.lyricsLanguage,
  };

  log?.info(
    {
      userId,
      provider: "audioengine",
      voiceProfileId: options.voiceProfile?.id ?? null,
      hasPersonalVoice: Boolean(options.voiceProfile),
      resolvedLyricsLanguage: finalInput.lyricsLanguage,
    },
    "Submitting Audioengine music generation",
  );

  const { record } = await commitMusicGeneration(
    {
      userId,
      songInput: finalInput,
      provider: "audioengine",
      voiceProfileId: options.voiceProfile?.id,
      clientRequestId: options.clientRequestId,
      clientRequestHash,
      creditAmountUnits: audioengineSpendAmountUnits(),
      creditIdempotencyKeyBuilder: audioengineSpendIdempotencyKey,
      creditReason: "audioengine_music_generate",
      meta: {
        prompt: input.prompt,
        style: finalInput.style ?? null,
        title: finalInput.title ?? null,
        customMode: true,
        instrumental: false,
      },
    },
    log,
  );

  return toMusicGenerateResponse(record);
}

async function generateLegacyengineMusicForUser(
  userId: string,
  input: GenerateSongInput,
  options: {
    voiceSampleId?: string;
    clientRequestId?: string;
    /** When false, standard AI vocal is allowed without Legacyengine voice persona. */
    requirePersona?: boolean;
  },
  log?: MusicGenerateLogger,
) {
  const requirePersona = options.requirePersona !== false;
  const canonicalRequest = buildCanonicalMusicGenerateRequest(input, {
    voiceSampleId: options.voiceSampleId,
  });
  const clientRequestHash = hashCanonicalRequest(canonicalRequest);
  const existingRecord = await findIdempotentMusicGeneration(
    userId,
    options.clientRequestId,
    clientRequestHash,
  );

  if (existingRecord) {
    await retryEnqueueQueuedMusicGeneration(existingRecord, log);
    return toMusicGenerateResponse(existingRecord);
  }

  assertModerationForNonEmptyText(input.prompt);
  assertModerationForNonEmptyText(input.style ?? "");
  assertModerationForNonEmptyText(input.title ?? "");

  const persona = requirePersona || options.voiceSampleId?.trim()
    ? await resolveMusicPersonaForUser(userId, options.voiceSampleId, log)
    : null;

  if (requirePersona && !persona) {
    throw new ForbiddenError(
      "Голос AI Music не готов. Запишите голос на главной и пройдите верификацию.",
    );
  }

  const entitlements = await getUserEntitlements(userId);
  const effectiveDurationSec = resolveEffectiveDurationSecForPlan(
    entitlements.planId,
    input.durationSec ?? 0,
  );

  await assertMaxDuration(userId, effectiveDurationSec);

  await assertMusicGenerationMode(userId, {
    customMode: getLegacyengineGenerationOptions(input)?.customMode,
    instrumental: isInstrumentalMode(input),
    style: input.style,
    durationSec: input.durationSec ?? 0,
  });

  await assertLyricsTextLengthForUser(userId, input.prompt, input.durationSec ?? 0);

  const songInput = persona
    ? buildPersonaSongInput(
        {
          ...input,
          durationSec: effectiveDurationSec,
        },
        persona,
      )
    : {
        ...input,
        durationSec: effectiveDurationSec,
        providerOptions: {
          providerId: "legacyengineapi" as const,
          options: {
            customMode: getLegacyengineGenerationOptions(input)?.customMode ?? true,
            instrumental: isInstrumentalMode(input),
            vocalGender: getLegacyengineGenerationOptions(input)?.vocalGender,
            referenceAudioUrl: getLegacyengineGenerationOptions(input)?.referenceAudioUrl,
          },
        },
      };
  const legacyengineOptions = getLegacyengineGenerationOptions(songInput) ?? {};

  log?.info(
    {
      userId,
      provider: "legacyengineapi",
      voiceSampleId: persona?.voiceSampleId ?? null,
      personaId: legacyengineOptions.personaId ?? null,
      legacyengineVoiceTaskId: persona?.legacyengineVoiceTaskId ?? null,
      personaModel: legacyengineOptions.personaModel ?? null,
      legacyengineVoiceModel: resolveMusicProviderConfig().legacyengineVoiceModel,
      customMode: legacyengineOptions.customMode ?? null,
      style: songInput.style ?? null,
      title: songInput.title ?? null,
      requirePersona,
      resolvedLyricsLanguage: input.lyricsLanguage ?? null,
    },
    persona
      ? "Submitting Legacyengine music generation with persona"
      : "Submitting Legacyengine music generation with standard AI vocal",
  );

  await assertProviderQueueCapacity();

  const { record } = await commitMusicGeneration(
    {
      userId,
      songInput,
      provider: "legacyengineapi",
      clientRequestId: options.clientRequestId,
      clientRequestHash,
      meta: {
        prompt: input.prompt,
        style: input.style ?? null,
        title: input.title ?? null,
        customMode: legacyengineOptions.customMode ?? false,
        instrumental: isInstrumentalMode(input),
      },
    },
    log,
  );

  return toMusicGenerateResponse(record);
}

export interface CommitMusicGenerationParams {
  userId: string;
  songInput: GenerateSongInput;
  provider?: MusicProviderId;
  voiceProfileId?: string;
  clientRequestId?: string;
  clientRequestHash: string;
  creditAmountUnits?: number;
  creditIdempotencyKeyBuilder?: (generationId: string) => string;
  creditReason?: string;
  meta: {
    prompt: string;
    style: string | null;
    title: string | null;
    customMode: boolean;
    instrumental: boolean;
  };
}

/**
 * Atomically create the MusicGeneration + debit credits under a per-user
 * advisory lock, then enqueue. The lock is try-lock only: waiters abort the
 * interactive transaction and retry so Prisma does not close a blocked tx (P2028).
 * A post-lock duplicate re-check keeps same Idempotency-Key at one record/spend.
 */
export async function commitMusicGeneration(
  params: CommitMusicGenerationParams,
  log?: MusicGenerateLogger,
): Promise<{ record: QueueableMusicGeneration; created: boolean }> {
  const {
    userId,
    songInput,
    provider = "legacyengineapi",
    voiceProfileId,
    clientRequestId,
    clientRequestHash,
    meta,
  } = params;
  const queuePlaceholder = `queue:${randomUUID()}`;
  const amountUnits = params.creditAmountUnits ?? OPERATION_COST_UNITS.generateTrack;
  const creditReason = params.creditReason ?? "music_generate";
  const spendKeyBuilder =
    params.creditIdempotencyKeyBuilder ??
    ((generationId: string) => `generation:${generationId}:spend`);

  let txResult: { record: QueueableMusicGeneration; created: boolean };

  try {
    txResult = await runWithCommitTransactionRetry(
      () =>
        prisma.$transaction(async (tx) => {
          const duplicate = await findIdempotentMusicGeneration(
            userId,
            clientRequestId,
            clientRequestHash,
            tx,
          );

          if (duplicate) {
            return { record: duplicate, created: false };
          }

          const locked = await tryLockUserCreditsInTransaction(userId, tx);

          if (!locked) {
            throw new CreditLockBusyError();
          }

          const lockedDuplicate = await findIdempotentMusicGeneration(
            userId,
            clientRequestId,
            clientRequestHash,
            tx,
          );

          if (lockedDuplicate) {
            return { record: lockedDuplicate, created: false };
          }

          const record = await tx.musicGeneration.create({
            data: {
              userId,
              type: "song",
              provider,
              voiceProfileId: voiceProfileId ?? null,
              providerTaskId: queuePlaceholder,
              clientRequestId: clientRequestId ?? null,
              clientRequestHash,
              providerRequestJson: toPersistedSongInput(
                songInput,
              ) as unknown as Prisma.InputJsonValue,
              prompt: meta.prompt,
              style: meta.style,
              title: meta.title,
              customMode: meta.customMode,
              instrumental: meta.instrumental,
              status: "pending",
            },
          });

          await spendCreditsInTransaction(
            {
              userId,
              amountUnits,
              reason: creditReason,
              idempotencyKey: spendKeyBuilder(record.id),
              relatedEntityType: "music_generation",
              relatedEntityId: record.id,
            },
            tx,
          );

          return { record, created: true };
        }),
      {
        onRetry: ({ attempt, error }) => {
          if (attempt > 1 && attempt % 20 !== 0) {
            return;
          }

          logLoadControl(
            "music_generation_commit_retry",
            {
              attempt,
              reason: commitRetryReason(error),
              provider,
            },
            "warn",
          );
        },
      },
    );
  } catch (error) {
    txResult = await resolveCommitMusicGenerationFailure(
      error,
      userId,
      clientRequestId,
      clientRequestHash,
    );
  }

  if (txResult.created) {
    const audioengineObservability =
      provider === "audioengine" ? resolveAudioengineGenerationObservability(songInput) : null;
    logLoadControl("music_generation_persisted", {
      generationId: txResult.record.id,
      provider,
      hasVoiceProfile: Boolean(voiceProfileId),
      model: audioengineObservability?.model ?? null,
      tariffModel: audioengineObservability?.tariffModel ?? null,
      variantCount: audioengineObservability?.variantCount ?? null,
      estimatedProviderCostUsd: audioengineObservability?.estimatedProviderCostUsd ?? null,
      status: txResult.record.status,
    });
  }

  await retryEnqueueQueuedMusicGeneration(txResult.record, log);

  if (txResult.created) {
    musicGenerationStartedTotal.inc();
    if (provider === "audioengine") {
      const observability = resolveAudioengineGenerationObservability(songInput);
      audioengineGenerationStartedTotal.inc();
      audioengineEstimatedCostUsdTotal.inc(
        { operation: "song" },
        usdMicrosToNumber(observability.estimatedProviderCostUsdMicros),
      );
    }
  }

  return txResult;
}

async function resolveCommitMusicGenerationFailure(
  error: unknown,
  userId: string,
  clientRequestId: string | undefined,
  clientRequestHash: string,
): Promise<{ record: QueueableMusicGeneration; created: boolean }> {
  if (error instanceof InsufficientCreditsLedgerError) {
    throw new InsufficientCreditsError();
  }

  if (isUniqueConstraintError(error)) {
    const existing = await findIdempotentMusicGeneration(
      userId,
      clientRequestId,
      clientRequestHash,
    );

    if (existing) {
      return { record: existing, created: false };
    }
  }

  if (
    error instanceof CreditLockBusyError ||
    isPrismaInteractiveTransactionGoneError(error)
  ) {
    throw new ServiceUnavailableError(
      "Сервис временно занят. Повторите запрос.",
      Math.ceil(COMMIT_RETRY_BUDGET_MS / 1000),
    );
  }

  throw error;
}

function resolveAudioengineGenerationObservability(songInput: GenerateSongInput): {
  model: string;
  tariffModel: string;
  variantCount: number;
  estimatedProviderCostUsd: string;
  estimatedProviderCostUsdMicros: number;
} {
  const options = getAudioengineGenerationOptions(songInput);
  const variantCount = AUDIOENGINE_OUTPUT_COUNT;
  const estimatedProviderCostUsdMicros = estimateAudioengineLyricsToSongUsdMicros(variantCount);

  return {
    model: options?.model?.trim() || resolveAudioengineFeatureFlags().model,
    tariffModel: AUDIOENGINE_ECONOMICS.tariffModel,
    variantCount,
    estimatedProviderCostUsd: formatUsdFromMicros(estimatedProviderCostUsdMicros),
    estimatedProviderCostUsdMicros,
  };
}

async function findIdempotentMusicGeneration(
  userId: string,
  clientRequestId: string | undefined,
  clientRequestHash: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<QueueableMusicGeneration | null> {
  if (!clientRequestId) {
    return null;
  }

  const record = await tx.musicGeneration.findFirst({
    where: { userId, clientRequestId },
    select: {
      id: true,
      userId: true,
      provider: true,
      providerTaskId: true,
      providerRequestJson: true,
      clientRequestHash: true,
      status: true,
    },
  });

  if (!record) {
    return null;
  }

  if (record.clientRequestHash !== clientRequestHash) {
    throw new ConflictError(
      "Idempotency-Key was already used with a different request",
      "IDEMPOTENCY_KEY_REUSED",
    );
  }

  return record;
}

async function retryEnqueueQueuedMusicGeneration(
  record: QueueableMusicGeneration,
  log?: MusicGenerateLogger,
): Promise<void> {
  if (!record.providerTaskId.startsWith("queue:") || !record.providerRequestJson) {
    return;
  }

  try {
    const priority = await getQueuePriorityForUser(record.userId);
    const songInputJson = JSON.stringify(record.providerRequestJson);

    if (record.provider === "audioengine") {
      logLoadControl("music_queue_selected", {
        generationId: record.id,
        provider: "audioengine",
        queueName: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
        hasVoiceProfile: Boolean(
          (record.providerRequestJson as { voiceProfileId?: unknown } | null)?.voiceProfileId,
        ),
        status: record.status,
      });
      await enqueueAudioengineProviderJob(
        {
          type: "audioengine_music_generate",
          userId: record.userId,
          recordId: record.id,
          songInputJson,
          spendReason: `audioengine_music_generate:${record.id}`,
        },
        priority,
      );
      return;
    }

    logLoadControl("music_queue_selected", {
      generationId: record.id,
      provider: record.provider,
      queueName: PROVIDER_JOB_QUEUE_NAME,
      hasVoiceProfile: false,
      status: record.status,
    });

    const outcome = await enqueueProviderJob(
      {
        type: "music_generate",
        userId: record.userId,
        recordId: record.id,
        songInputJson,
        spendReason: `music_generate:${record.id}`,
      },
      priority,
    );

    if (outcome === "already_finished") {
      log?.warn(
        { recordId: record.id },
        "Idempotent replay hit a finished provider job; not re-submitting",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    log?.warn(
      {
        recordId: record.id,
        provider: record.provider,
        error: message,
      },
      "Music generation enqueue failed; reconciler will retry",
    );

    if (record.provider === "audioengine" && isPermanentAudioengineEnqueueError(message)) {
      await failAudioenginePreSubmitAndRefund(record, message, log);
    }
  }
}

function isPermanentAudioengineEnqueueError(message: string): boolean {
  return /Custom Id cannot contain|jobId part must not contain|BullMQ jobId/i.test(message);
}

async function failAudioenginePreSubmitAndRefund(
  record: QueueableMusicGeneration,
  enqueueError: string,
  log?: MusicGenerateLogger,
): Promise<void> {
  await prisma.musicGeneration.updateMany({
    where: {
      id: record.id,
      provider: "audioengine",
      status: { in: ["pending", "processing"] },
      providerTaskId: { startsWith: "queue:" },
    },
    data: {
      status: "failed",
      submissionState: "failed",
      submitCompletedAt: new Date(),
      submitErrorCode: "AUDIOENGINE_PRE_SUBMIT_QUEUE_FAILED",
      submitErrorMessage: enqueueError.slice(0, 500),
      errorMessage: "Генерация не была отправлена провайдеру. Кредиты возвращены.",
      rawStatus: "AUDIOENGINE_PRE_SUBMIT_QUEUE_FAILED",
    },
  });

  await refundOriginalSpend({
    userId: record.userId,
    spendIdempotencyKey: buildAudioengineMusicSpendKey(record.id),
    refundIdempotencyKey: buildAudioengineMusicRefundKey(record.id),
    reason: "audioengine_music_generate_refund",
    relatedEntityType: "music_generation",
    relatedEntityId: record.id,
  }).catch((refundError) => {
    log?.warn(
      {
        recordId: record.id,
        error: refundError instanceof Error ? refundError.message : "unknown",
      },
      "Audioengine pre-submit refund failed; reconciler will retry",
    );
  });
}

function resolveRecordProvider(record: Pick<MusicGeneration, "provider">): MusicProviderId {
  return record.provider === "audioengine" ? "audioengine" : "legacyengineapi";
}

function toMusicGenerateResponse(
  record: Pick<MusicGeneration, "id" | "status" | "provider">,
) {
  return {
    recordId: record.id,
    provider: resolveRecordProvider(record),
    taskId: record.id,
    status: record.status,
  };
}

export async function getMusicGenerationStatusForUser(taskOrRecordId: string, userId?: string) {
  const record = await findMusicGenerationRecord(taskOrRecordId, userId);

  if (!record) {
    throw new NotFoundError("Music generation not found");
  }

  const apiBaseUrl = resolveApiBaseUrl();
  const queueMetrics = await getProviderQueueMetrics();

  if (record.status === "failed") {
    const failedStatus = {
      taskId: record.providerTaskId,
      status: "failed" as const,
      provider: resolveRecordProvider(record),
      errorMessage: record.errorMessage ?? undefined,
      rawStatus: record.rawStatus ?? undefined,
    };

    return toMusicStatusResponse(failedStatus, record, apiBaseUrl, {
      queuePhase: resolveMusicQueuePhase(record, failedStatus),
    });
  }

  if (record.providerTaskId.startsWith("queue:")) {
    const queuePhase = resolveMusicQueuePhase(record, {
      taskId: record.id,
      status: "pending",
      provider: resolveRecordProvider(record),
      rawStatus: "QUEUED",
    });

    return toMusicStatusResponse(
      {
        taskId: record.id,
        status: "pending",
        provider: resolveRecordProvider(record),
        rawStatus: "QUEUED",
      },
      record,
      apiBaseUrl,
      {
        queuePhase,
        queueEtaSec: resolveMusicQueueEtaSec(queuePhase, queueMetrics.waiting),
      },
    );
  }

  // Terminal completed / partial: do not call provider or download audio on the request path.
  if (record.status === "completed" || record.status === "partial_success") {
    await enqueuePendingTrackPersistence(record).catch(() => undefined);

    const completedStatus = {
      taskId: record.providerTaskId,
      status: "completed" as const,
      provider: resolveRecordProvider(record),
      rawStatus: record.rawStatus ?? "SUCCESS",
      tracks: [],
    };

    return toMusicStatusResponse(completedStatus, record, apiBaseUrl, {
      queuePhase: resolveMusicQueuePhase(record, completedStatus),
    });
  }

  // Audioengine progress is driven by delayed worker poll jobs — avoid env-provider mismatch.
  if (record.provider === "audioengine") {
    const pendingStatus = {
      taskId: record.providerTaskId,
      status: "processing" as const,
      provider: "audioengine" as const,
      rawStatus: record.rawStatus ?? "PROCESSING",
      tracks: [],
    };

    return toMusicStatusResponse(pendingStatus, record, apiBaseUrl, {
      queuePhase: resolveMusicQueuePhase(record, pendingStatus),
    });
  }

  const pollStarted = Date.now();
  const status = await createMusicGenerationProvider(resolveRecordProvider(record)).getGenerationStatus(
    record.providerTaskId,
  );
  observeDuration(musicProviderPollDurationSeconds, pollStarted);
  logLoadControl("provider_poll", {
    phase: "provider_poll",
    provider: resolveRecordProvider(record),
    generationId: record.id,
    providerTaskId: record.providerTaskId,
    durationMs: Date.now() - pollStarted,
    count: 1,
  });

  const synced = await syncMusicGenerationRecord(record.providerTaskId, status, userId);
  const resolvedRecord = synced ?? record;
  const queuePhase = resolveMusicQueuePhase(resolvedRecord, status);

  return toMusicStatusResponse(status, resolvedRecord, apiBaseUrl, {
    queuePhase,
    queueEtaSec:
      queuePhase === "queued"
        ? resolveMusicQueueEtaSec(queuePhase, queueMetrics.waiting)
        : undefined,
  });
}

async function enqueuePendingTrackPersistence(
  record: Awaited<ReturnType<typeof findMusicGenerationRecord>>,
): Promise<void> {
  if (!record) {
    return;
  }

  const { enqueueMusicTrackPersistJob } = await import(
    "../queue/music-track-persistence-queue.js"
  );

  for (const track of record.tracks) {
    if (
      track.audioStorageKey ||
      !track.audioSourceUrl ||
      track.persistenceState === "stored" ||
      track.persistenceState === "failed"
    ) {
      continue;
    }

    await enqueueMusicTrackPersistJob({
      trackId: track.id,
      musicGenerationId: record.id,
      userId: record.userId,
    });
  }
}

async function findMusicGenerationRecord(id: string, userId?: string) {
  const scopedUser = userId ? { userId } : {};

  const byId = await prisma.musicGeneration.findFirst({
    where: { id, ...scopedUser },
    include: { tracks: true },
  });

  if (byId) {
    return byId;
  }

  return prisma.musicGeneration.findFirst({
    where: { providerTaskId: id, ...scopedUser },
    include: { tracks: true },
  });
}

export async function getMusicHistory(userId: string) {
  const entitlements = await getUserEntitlements(userId);
  return listMusicGenerationHistory(userId, entitlements.maxProjects);
}

export async function removeMusicGenerations(userId: string, ids: string[]) {
  return deleteMusicGenerations(userId, ids);
}

export async function removeMusicGenerationTrack(userId: string, trackId: string) {
  return deleteMusicGenerationTrack(userId, trackId);
}

export type GenerateLyricsForUserInput = {
  prompt: string;
  durationSec?: number;
  lyricsLanguage?: LyricsLanguage;
  uiLocale?: string | null;
};

export async function generateLyricsForUser(
  userId: string,
  input: GenerateLyricsForUserInput,
  log?: MusicGenerateLogger,
) {
  const entitlements = await getUserEntitlements(userId);
  const lyricsDurationSec = resolveLyricsDurationSecForPlan(
    entitlements.planId,
    input.durationSec ?? 0,
  );

  if (input.durationSec && input.durationSec > 0) {
    await assertMaxDuration(userId, input.durationSec);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vocalGender: true },
  });
  const vocalGender =
    user?.vocalGender && isVocalGender(user.vocalGender) ? user.vocalGender : null;

  const trimmedPrompt = input.prompt.trim();
  const requestedLyricsLanguage = normalizeLyricsLanguage(input.lyricsLanguage);
  const resolvedLanguage = resolveLyricsLanguage({
    selectedLanguage: requestedLyricsLanguage,
    prompt: trimmedPrompt,
    uiLocale: input.uiLocale,
  });
  const languageInstructionLength = buildLyricsLanguageInstruction(resolvedLanguage).length;
  const briefMaxLength = resolveLyricsBriefMaxLength(
    vocalGender,
    lyricsDurationSec,
    languageInstructionLength,
    resolvedLanguage.code,
  );

  if (trimmedPrompt.length > briefMaxLength) {
    throw new BadRequestError(
      vocalGender
        ? `Описание слишком длинное — максимум ${briefMaxLength} символов (AI Music учитывает подсказки про язык, длительность и род глаголов).`
        : `Описание слишком длинное — максимум ${briefMaxLength} символов (AI Music учитывает подсказки про язык и длительность).`,
    );
  }

  assertModerationForNonEmptyText(trimmedPrompt);

  const providerPrompt = buildLyricsGenerationProviderPrompt({
    brief: trimmedPrompt,
    resolvedLanguage,
    vocalGender,
    lyricsDurationSec,
  });

  if (providerPrompt.length > LEGACYENGINE_LYRICS_PROMPT_MAX_LENGTH) {
    throw new BadRequestError(
      `Описание слишком длинное для AI Music — максимум ${briefMaxLength} символов.`,
    );
  }

  assertModerationForNonEmptyText(providerPrompt);

  log?.info(
    {
      requestedLyricsLanguage,
      resolvedLyricsLanguage: resolvedLanguage.code,
      lyricsLanguageSource: resolvedLanguage.source,
    },
    "Resolved lyrics language for generation",
  );

  const lyricsRequestId = randomUUID();
  const spendKey = buildLyricsSpendKey(lyricsRequestId);
  await spendCredits({
    userId,
    amountUnits: OPERATION_COST_UNITS.generateText,
    reason: "lyrics_generate",
    idempotencyKey: spendKey,
    relatedEntityType: "lyrics_request",
    relatedEntityId: lyricsRequestId,
  });

  try {
    const result = await lyricsEngine.generateLyrics({ prompt: providerPrompt });
    // Existing poll/status record only — do not persist language metadata here.
    // clientRequestId snapshots the spend key so fail/refund uses original amount.
    await createMusicGenerationRecord({
      userId,
      type: "lyrics",
      providerTaskId: result.taskId,
      prompt: trimmedPrompt,
      clientRequestId: lyricsRequestId,
    });

    return {
      provider: result.provider,
      taskId: result.taskId,
      status: result.status,
      lyricsDurationSec,
    };
  } catch (error) {
    await refundOriginalSpend({
      userId,
      spendIdempotencyKey: spendKey,
      refundIdempotencyKey: buildLyricsRefundKey(lyricsRequestId),
      reason: "lyrics_generate_failed",
      relatedEntityType: "lyrics_request",
      relatedEntityId: lyricsRequestId,
    }).catch(() => undefined);
    throw error;
  }
}

export async function getLyricsGenerationStatus(
  taskId: string,
  userId: string,
  durationSec?: number,
) {
  const entitlements = await getUserEntitlements(userId);
  const lyricsDurationSec = resolveLyricsDurationSecForPlan(entitlements.planId, durationSec ?? 0);

  const record = await prisma.musicGeneration.findUnique({
    where: { providerTaskId: taskId },
    select: { id: true, userId: true, clientRequestId: true },
  });

  if (!record || record.userId !== userId) {
    throw new NotFoundError("Lyrics generation not found");
  }

  const status = await lyricsEngine.getLyricsGenerationStatus(taskId);
  const hasBlockedLyrics =
    status.status === "completed" &&
    (status.lyrics ?? []).some((item) => !checkContentAllowed(item.text).allowed);
  const hasProviderSensitiveWordError = status.rawStatus === "SENSITIVE_WORD_ERROR";
  const moderationBlocked = hasBlockedLyrics || hasProviderSensitiveWordError;

  const lyrics =
    moderationBlocked || status.status !== "completed"
      ? undefined
      : (status.lyrics ?? []).map((item) => ({
          ...item,
          text: truncateLyricsForDuration(item.text, lyricsDurationSec),
        }));
  const finalStatus = moderationBlocked ? "failed" : status.status;
  const finalRawStatus = moderationBlocked ? "CONTENT_MODERATION" : status.rawStatus;
  const finalErrorMessage = moderationBlocked ? CONTENT_MODERATION_ERROR_RU : status.errorMessage;

  await prisma.musicGeneration.update({
    where: { id: record.id },
    data: {
      status: finalStatus,
      rawStatus: finalRawStatus ?? null,
      errorMessage: finalErrorMessage ?? null,
      lyricsResult: lyrics ? (lyrics as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  if (finalStatus === "failed") {
    const lyricsRequestId = record.clientRequestId?.trim();

    // Prefer snapshot on the generation row. Never refund using current OPERATION_COST_*.
    if (lyricsRequestId) {
      await refundOriginalSpend({
        userId,
        spendIdempotencyKey: buildLyricsSpendKey(lyricsRequestId),
        refundIdempotencyKey: buildLyricsRefundKey(lyricsRequestId),
        reason: "lyrics_generate_failed",
        relatedEntityType: "lyrics_request",
        relatedEntityId: lyricsRequestId,
      }).catch(() => undefined);
    }
  }

  return {
    taskId: status.taskId,
    status: finalStatus,
    provider: status.provider,
    rawStatus: finalRawStatus,
    lyrics,
    errorMessage: finalErrorMessage,
    lyricsDurationSec,
  };
}

async function assertLyricsTextLengthForUser(
  userId: string,
  lyrics: string,
  durationSec: number,
): Promise<void> {
  const entitlements = await getUserEntitlements(userId);
  const maxLength = resolveManualLyricsMaxLength(entitlements.planId, durationSec);
  const effectiveDuration = resolveLyricsDurationSecForPlan(entitlements.planId, durationSec);

  if (lyrics.trim().length > maxLength) {
    throw new BadRequestError(
      `Текст слишком длинный для ~${effectiveDuration} сек — максимум ${maxLength} символов.`,
    );
  }
}

export { toMusicGenerationRecordDto };
