import { randomUUID } from "node:crypto";
import {
  createMusicGenerationProvider,
  fromPersistedSongInput,
  getAudioengineSongLimiter,
  type SubmitGenerationResult,
} from "@ai-music/ai-providers";
import { prisma, refundOriginalSpend } from "@ai-music/db";
import {
  buildAudioengineMusicRefundKey,
  buildAudioengineMusicSpendKey,
  logLoadControl,
  AUDIOENGINE_POLL_TIMEOUT_MS,
  resolveAudioenginePollDelayMs,
  resolveMusicProviderUserErrorMessage,
  type AudioengineMusicGenerateJobPayload,
  type AudioengineMusicPollJobPayload,
  type AudioengineProviderJobPayload,
} from "@ai-music/shared";
import type { Job } from "bullmq";
import { enqueueAudioengineProviderJob } from "../audioengine-provider-job-queue.js";
import { resolveAudioengineMusicGenerateAction } from "./audioengine-music-generate-action.js";
import { upsertAudioengineTracksAndEnqueue } from "./audioengine-track-metadata.js";
import { processAudioengineVocalClone } from "./process-audioengine-vocal-clone.js";

const TERMINAL_GENERATION_STATUSES = new Set(["completed", "failed", "partial_success"]);

export async function processAudioengineProviderJob(
  payload: AudioengineProviderJobPayload,
  job: Job<AudioengineProviderJobPayload>,
): Promise<{ outcome: "success" | "terminal_failed" | "skipped" }> {
  switch (payload.type) {
    case "audioengine_music_generate":
      await processMusicGenerate(payload, job);
      return { outcome: "success" };
    case "audioengine_music_poll":
      await processMusicPoll(payload);
      return { outcome: "success" };
    case "audioengine_vocal_clone":
      return { outcome: await processAudioengineVocalClone(payload, job) };
    default: {
      const exhaustive: never = payload;
      throw new Error(`Unknown Audioengine provider job: ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function processMusicGenerate(
  payload: AudioengineMusicGenerateJobPayload,
  job: Job<AudioengineProviderJobPayload>,
): Promise<void> {
  const record = await prisma.musicGeneration.findUnique({ where: { id: payload.recordId } });
  assertAudioengineGenerationRecord(record, payload);

  const action = resolveAudioengineMusicGenerateAction({
    status: record.status,
    submissionState: record.submissionState,
    providerTaskId: record.providerTaskId,
    recoveredProviderTaskId: payload.recoveredProviderTaskId,
  });

  if (action.kind === "noop_terminal") {
    if (action.refundIfFailed) {
      await refundMusicGeneration(payload);
    }
    return;
  }

  if (action.kind === "poll_only") {
    if (payload.recoveredProviderTaskId?.trim() === action.providerTaskId) {
      await persistSubmittedTask(record.id, action.providerTaskId, record.submitAttemptId);
    }
    await enqueueFirstPoll(
      payload,
      action.providerTaskId,
      record.submitCompletedAt?.getTime(),
    );
    return;
  }

  if (action.kind === "wait_submit_unknown") {
    logSubmitUnknown(record.id, "automatic POST forbidden");
    return;
  }

  if (action.kind === "mark_orphan_dispatching") {
    await markSubmitUnknown(record.id, record.submitAttemptId, "ORPHAN_DISPATCHING");
    return;
  }

  const provider = createMusicGenerationProvider(record.provider);
  const context = { recordId: record.id, userId: record.userId };
  let prepared;

  try {
    prepared = provider.prepareGeneration(
      fromPersistedSongInput(JSON.parse(payload.songInputJson)),
      context,
    );
  } catch (error) {
    await failMusicGeneration(payload, "AUDIOENGINE_PREFLIGHT_FAILED", errorMessage(error));
    return;
  }

  let permit: { release(): Promise<void> };
  try {
    permit = await getAudioengineSongLimiter().acquire();
  } catch (error) {
    if (isLastAttempt(job)) {
      await failMusicGeneration(payload, "AUDIOENGINE_LIMITER_TIMEOUT", errorMessage(error));
      return;
    }
    throw error;
  }
  const submitAttemptId = randomUUID();
  let claimed: boolean;
  try {
    claimed = await claimDispatching(record.id, submitAttemptId);
  } catch (error) {
    await permit.release();
    throw error;
  }

  if (!claimed) {
    await permit.release();
    return;
  }

  let result: SubmitGenerationResult;
  try {
    result = await provider.submitPreparedGeneration(prepared, context);
  } catch (error) {
    result = { kind: "ambiguous", message: errorMessage(error) };
  } finally {
    await permit.release();
  }

  await handleSubmitResult(payload, job, submitAttemptId, result);
}

function assertAudioengineGenerationRecord(
  record: Awaited<ReturnType<typeof prisma.musicGeneration.findUnique>>,
  payload: AudioengineMusicGenerateJobPayload,
): asserts record is NonNullable<typeof record> & { provider: "audioengine" } {
  if (!record || record.userId !== payload.userId) {
    throw new Error("Audioengine music generation record not found");
  }
  if (record.provider !== "audioengine") {
    throw new Error(`Audioengine queue received provider ${record.provider}`);
  }
}

async function claimDispatching(recordId: string, submitAttemptId: string): Promise<boolean> {
  const updated = await prisma.musicGeneration.updateMany({
    where: {
      id: recordId,
      provider: "audioengine",
      status: "pending",
      submissionState: "queued",
      providerTaskId: { startsWith: "queue:" },
    },
    data: {
      submissionState: "dispatching",
      submitAttemptId,
      submitAttemptedAt: new Date(),
      submitErrorCode: null,
      submitErrorMessage: null,
    },
  });
  return updated.count === 1;
}

async function handleSubmitResult(
  payload: AudioengineMusicGenerateJobPayload,
  job: Job<AudioengineProviderJobPayload>,
  submitAttemptId: string,
  result: SubmitGenerationResult,
): Promise<void> {
  if (result.kind === "ok") {
    try {
      await persistSubmittedTask(payload.recordId, result.taskId, submitAttemptId);
    } catch (error) {
      await saveRecoveredTaskId(job, payload, result.taskId);
      await markSubmitUnknown(payload.recordId, submitAttemptId, "DB_UPDATE_AFTER_ACCEPT");
      throw error;
    }
    await enqueueFirstPoll(payload, result.taskId);
    return;
  }

  if (result.kind === "ambiguous") {
    await markSubmitUnknown(payload.recordId, submitAttemptId, "AMBIGUOUS_SUBMIT", result.message);
    return;
  }

  if (result.kind === "retryable_capacity" && !isLastAttempt(job)) {
    await releaseToQueued(payload.recordId, submitAttemptId, result.code, result.message);
    throw new Error(result.message);
  }

  await failMusicGeneration(payload, String(result.code), result.message, submitAttemptId);
}

async function persistSubmittedTask(
  recordId: string,
  taskId: string,
  submitAttemptId: string | null,
): Promise<void> {
  const updated = await prisma.musicGeneration.updateMany({
    where: {
      id: recordId,
      provider: "audioengine",
      ...(submitAttemptId ? { submitAttemptId } : {}),
      submissionState: { in: ["dispatching", "submit_unknown", "queued", "submitted"] },
    },
    data: {
      providerTaskId: taskId,
      submissionState: "submitted",
      submitCompletedAt: new Date(),
      status: "processing",
      submitErrorCode: null,
      submitErrorMessage: null,
    },
  });

  if (updated.count === 0) {
    throw new Error("Failed to persist accepted Audioengine task id");
  }

  logLoadControl("audioengine_task_id_persisted", {
    generationId: recordId,
    provider: "audioengine",
    status: "submitted",
  });
}

async function enqueueFirstPoll(
  payload: AudioengineMusicGenerateJobPayload,
  providerTaskId: string,
  submittedAtMs = Date.now(),
): Promise<void> {
  const pollPayload: AudioengineMusicPollJobPayload = {
    type: "audioengine_music_poll",
    userId: payload.userId,
    recordId: payload.recordId,
    providerTaskId,
    submittedAtMs,
    attempt: 1,
    requestId: payload.requestId,
  };
  await enqueueAudioengineProviderJob(pollPayload, {
    delayMs: resolveAudioenginePollDelayMs(submittedAtMs),
  });
}

async function processMusicPoll(payload: AudioengineMusicPollJobPayload): Promise<void> {
  const record = await prisma.musicGeneration.findUnique({ where: { id: payload.recordId } });

  if (!record || record.userId !== payload.userId || record.provider !== "audioengine") {
    throw new Error("Audioengine poll record not found");
  }
  if (TERMINAL_GENERATION_STATUSES.has(record.status)) {
    if (record.status === "failed") {
      await refundMusicGeneration(payload);
    }
    return;
  }
  if (record.providerTaskId !== payload.providerTaskId) {
    return;
  }
  if (Date.now() - payload.submittedAtMs > AUDIOENGINE_POLL_TIMEOUT_MS) {
    await failMusicGeneration(payload, "AUDIOENGINE_POLL_TIMEOUT", "Audioengine generation timed out");
    return;
  }

  const status = await createMusicGenerationProvider("audioengine").getGenerationStatus(
    payload.providerTaskId,
  );

  if (status.status === "failed") {
    await failMusicGeneration(
      payload,
      status.rawStatus ?? "AUDIOENGINE_PROVIDER_FAILED",
      status.errorMessage ?? "Audioengine generation failed",
    );
    return;
  }
  if (status.status !== "completed") {
    await markPollProgress(record.id, status.status, status.rawStatus);
    await enqueueNextPoll(payload);
    return;
  }

  const tracks = status.tracks?.filter((track) => Boolean(track.audioUrl)) ?? [];
  if (tracks.length === 0) {
    await failMusicGeneration(
      payload,
      "AUDIOENGINE_NO_AUDIO_TRACKS",
      "Audioengine completed without downloadable audio",
    );
    return;
  }

  await upsertAudioengineTracksAndEnqueue(record, tracks);
  await prisma.musicGeneration.update({
    where: { id: record.id },
    data: {
      status: "completed",
      rawStatus: status.rawStatus ?? "completed",
      errorMessage: null,
    },
  });
}

async function markPollProgress(
  recordId: string,
  status: "pending" | "processing",
  rawStatus?: string,
): Promise<void> {
  await prisma.musicGeneration.updateMany({
    where: { id: recordId, provider: "audioengine", status: { in: ["pending", "processing"] } },
    data: { status, rawStatus: rawStatus ?? status },
  });
}

async function enqueueNextPoll(payload: AudioengineMusicPollJobPayload): Promise<void> {
  await enqueueAudioengineProviderJob(
    { ...payload, attempt: payload.attempt + 1 },
    { delayMs: resolveAudioenginePollDelayMs(payload.submittedAtMs) },
  );
}

async function failMusicGeneration(
  payload: Pick<AudioengineMusicGenerateJobPayload, "recordId" | "userId" | "spendReason"> |
    AudioengineMusicPollJobPayload,
  code: string,
  message: string,
  submitAttemptId?: string,
): Promise<void> {
  const safeMessage = resolveMusicProviderUserErrorMessage(message);
  await prisma.musicGeneration.updateMany({
    where: {
      id: payload.recordId,
      provider: "audioengine",
      status: { notIn: ["completed", "partial_success"] },
      ...(submitAttemptId ? { submitAttemptId } : {}),
    },
    data: {
      status: "failed",
      submissionState: "failed",
      submitCompletedAt: new Date(),
      submitErrorCode: code.slice(0, 100),
      submitErrorMessage: message.slice(0, 500),
      errorMessage: safeMessage,
      rawStatus: code,
    },
  });
  await refundMusicGeneration(payload);
}

async function refundMusicGeneration(
  payload: Pick<AudioengineMusicGenerateJobPayload, "recordId" | "userId" | "spendReason"> |
    AudioengineMusicPollJobPayload,
): Promise<void> {
  const result = await refundOriginalSpend({
    userId: payload.userId,
    spendIdempotencyKey: buildAudioengineMusicSpendKey(payload.recordId),
    refundIdempotencyKey: buildAudioengineMusicRefundKey(payload.recordId),
    reason: "audioengine_music_generate_refund",
    relatedEntityType: "music_generation",
    relatedEntityId: payload.recordId,
  });

  if (result.amountUnits === null) {
    logLoadControl(
      "queue_reconcile_skip",
      { provider: "audioengine", recordId: payload.recordId, reason: "missing_spend" },
      "warn",
    );
  }
}

async function releaseToQueued(
  recordId: string,
  submitAttemptId: string,
  code: number,
  message: string,
): Promise<void> {
  await prisma.musicGeneration.updateMany({
    where: { id: recordId, submissionState: "dispatching", submitAttemptId },
    data: {
      submissionState: "queued",
      submitErrorCode: String(code),
      submitErrorMessage: message.slice(0, 500),
    },
  });
}

async function markSubmitUnknown(
  recordId: string,
  submitAttemptId: string | null,
  code: string,
  message = code,
): Promise<void> {
  await prisma.musicGeneration.updateMany({
    where: {
      id: recordId,
      provider: "audioengine",
      ...(submitAttemptId ? { submitAttemptId } : {}),
      submissionState: { in: ["dispatching", "submit_unknown"] },
    },
    data: {
      submissionState: "submit_unknown",
      submitErrorCode: code,
      submitErrorMessage: message.slice(0, 500),
    },
  });
  logSubmitUnknown(recordId, message);
}

function logSubmitUnknown(recordId: string, message: string): void {
  logLoadControl(
    "audioengine_submit",
    { provider: "audioengine", recordId, submissionState: "submit_unknown", message: message.slice(0, 200) },
    "warn",
  );
}

async function saveRecoveredTaskId(
  job: Job<AudioengineProviderJobPayload>,
  payload: AudioengineMusicGenerateJobPayload,
  taskId: string,
): Promise<void> {
  await job.updateData({ ...payload, recoveredProviderTaskId: taskId }).catch(() => undefined);
}

function isLastAttempt(job: Job<AudioengineProviderJobPayload>): boolean {
  return (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Audioengine worker error";
}
