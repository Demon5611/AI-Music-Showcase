import { randomUUID } from "node:crypto";
import type {
  GenerateSongInput,
  OpaquePreparedGeneration,
  SubmitGenerationResult,
} from "@ai-music/ai-providers";
import { fromPersistedSongInput } from "@ai-music/ai-providers";
import { prisma, refundOriginalSpend, type MusicGeneration } from "@ai-music/db";
import {
  musicProviderSubmitDurationSeconds,
  observeDuration,
  recordProviderSubmitAttempt,
  type ProviderSubmitAttemptResult,
} from "@ai-music/observability";
import {
  logLoadControl,
  MUSIC_PROVIDER_CAPACITY_RAW_STATUS,
  resolveMusicProviderUserErrorMessage,
  type MusicGenerateJobPayload,
  type ProviderJobPayload,
} from "@ai-music/shared";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import {
  isLastProviderJobAttempt,
  wrapProviderJobError,
  type ProviderJobAttempt,
} from "../common/provider-job-retry.js";
import { resolveSignedSunoCallBackUrl } from "../common/suno-signed-callback-url.js";
import { createDefaultMusicGenerateSubmitDeps } from "../music-generate/default-submit-deps.js";
import type { MusicGenerateSubmitDeps } from "../music-generate/submit-deps.js";

export type { MusicGenerateSubmitDeps } from "../music-generate/submit-deps.js";

const DB_PERSIST_ATTEMPTS = 3;
const DB_PERSIST_DELAY_MS = 200;

const defaultDeps: MusicGenerateSubmitDeps = createDefaultMusicGenerateSubmitDeps();

export async function processProviderJob(
  payload: ProviderJobPayload,
  attempt: ProviderJobAttempt,
  job?: Job<ProviderJobPayload>,
  deps: MusicGenerateSubmitDeps = defaultDeps,
): Promise<void> {
  switch (payload.type) {
    case "music_generate":
      await processMusicGenerateJob(
        payload,
        attempt,
        job as Job<MusicGenerateJobPayload> | undefined,
        deps,
      );
      return;
    case "stem_separation":
    case "lyrics_generate":
      return;
    default: {
      const exhaustive: never = payload;
      throw new Error(`Unknown provider job: ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function processMusicGenerateJob(
  payload: MusicGenerateJobPayload,
  attempt: ProviderJobAttempt,
  job: Job<MusicGenerateJobPayload> | undefined,
  deps: MusicGenerateSubmitDeps,
): Promise<void> {
  const record = await prisma.musicGeneration.findUnique({
    where: { id: payload.recordId },
  });

  if (!record || record.userId !== payload.userId) {
    throw wrapProviderJobError(new Error("Music generation record not found"), false);
  }

  if (record.status === "completed" || record.status === "failed") {
    return;
  }

  const recoveredTaskId = payload.recoveredProviderTaskId?.trim();

  if (recoveredTaskId) {
    try {
      await persistProviderTaskId(record.id, recoveredTaskId, record.submitAttemptId);
      return;
    } catch (error) {
      if (isLastProviderJobAttempt(attempt)) {
        await markSubmitUnknown(record.id, record.submitAttemptId, "DB_PERSIST_EXHAUSTED", {
          message: error instanceof Error ? error.message : "persist recovered taskId failed",
        });
        throw new UnrecoverableError("Failed to persist recovered provider taskId");
      }
      throw wrapProviderJobError(error, true);
    }
  }

  if (record.submissionState === "submitted" || !record.providerTaskId.startsWith("queue:")) {
    logLoadControl("suno_submit", {
      source: "worker",
      jobType: "music_generate",
      recordId: record.id,
      userId: payload.userId,
      taskId: record.providerTaskId,
      resumed: true,
    });
    return;
  }

  if (record.submissionState === "submit_unknown") {
    throw new UnrecoverableError("Music generate submit_unknown — automatic POST forbidden");
  }

  if (record.submissionState === "dispatching") {
    await markSubmitUnknown(record.id, record.submitAttemptId, "ORPHAN_DISPATCHING", {
      message: "Orphaned dispatching claim — auto POST forbidden",
    });
    throw new UnrecoverableError("Music generate orphaned dispatching — auto POST forbidden");
  }

  if (record.submissionState === "failed") {
    return;
  }

  // --- Preflight (all fallible local work before CAS) ---
  let prepared: OpaquePreparedGeneration;
  let songInput: GenerateSongInput;
  const submitContextBase = {
    recordId: record.id,
    userId: record.userId,
  };

  try {
    songInput = fromPersistedSongInput(JSON.parse(payload.songInputJson));
    prepared = deps.provider.prepareGeneration(songInput, submitContextBase);
    await deps.acquireSubmitPermit();
  } catch (error) {
    const retryable = !(error instanceof SyntaxError);
    const shouldFinalize = !retryable || isLastProviderJobAttempt(attempt);

    if (shouldFinalize) {
      await markMusicGenerateFailed(payload, error);
    }

    throw wrapProviderJobError(error, retryable && !(error instanceof SyntaxError));
  }

  const submitAttemptId = randomUUID();
  const claimed = await claimDispatching(record.id, submitAttemptId);

  if (!claimed) {
    const latest = await prisma.musicGeneration.findUnique({ where: { id: record.id } });

    if (!latest || latest.submissionState !== "queued") {
      return;
    }

    throw wrapProviderJobError(new Error("CAS claim lost race"), true);
  }

  // Signed callback URL is built only after CAS, immediately before POST.
  // Never persisted to DB / job payload / providerRequestJson.
  const callBackUrl = resolveSignedSunoCallBackUrl(record.id);

  // --- Exactly one vendor fetch after CAS ---
  let result: SubmitGenerationResult;
  const submitStarted = Date.now();

  try {
    result = await deps.provider.submitPreparedGeneration(prepared, {
      ...submitContextBase,
      callBackUrl,
    });
  } catch (error) {
    result = {
      kind: "ambiguous",
      message: error instanceof Error ? error.message : "submitPreparedGeneration threw after CAS",
    };
  }

  observeDuration(musicProviderSubmitDurationSeconds, submitStarted);

  await handleSubmitOnceResult(payload, attempt, job, submitAttemptId, result);
}

async function handleSubmitOnceResult(
  payload: MusicGenerateJobPayload,
  attempt: ProviderJobAttempt,
  job: Job<MusicGenerateJobPayload> | undefined,
  submitAttemptId: string,
  result: SubmitGenerationResult,
): Promise<void> {
  recordProviderSubmitAttempt(mapSubmitResultToMetric(result));

  switch (result.kind) {
    case "ok":
      await persistAcceptedTaskId(payload, job, attempt, submitAttemptId, result.taskId);
      return;
    case "failed_terminal":
      await transitionFailed(payload, submitAttemptId, result.code, result.message);
      throw new UnrecoverableError(result.message);
    case "retryable_capacity":
      await releaseToQueued(payload.recordId, submitAttemptId, result.code, result.message);
      if (isLastProviderJobAttempt(attempt)) {
        await transitionFailed(payload, submitAttemptId, result.code, result.message);
        throw new UnrecoverableError(result.message);
      }
      throw wrapProviderJobError(new Error(result.message), true);
    case "ambiguous":
      await markSubmitUnknown(payload.recordId, submitAttemptId, "AMBIGUOUS_SUBMIT", {
        code: result.code,
        message: result.message,
      });
      throw new UnrecoverableError(result.message);
    default: {
      const exhaustive: never = result;
      throw new Error(`Unhandled submit result: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function mapSubmitResultToMetric(result: SubmitGenerationResult): ProviderSubmitAttemptResult {
  switch (result.kind) {
    case "ok":
      return "submitted";
    case "ambiguous":
      return "submit_unknown";
    case "retryable_capacity":
      return "retryable_capacity";
    case "failed_terminal":
      return "failed";
    default: {
      const exhaustive: never = result;
      void exhaustive;
      return "failed";
    }
  }
}

async function claimDispatching(recordId: string, submitAttemptId: string): Promise<boolean> {
  const updated = await prisma.musicGeneration.updateMany({
    where: {
      id: recordId,
      submissionState: "queued",
      status: "pending",
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

async function persistAcceptedTaskId(
  payload: MusicGenerateJobPayload,
  job: Job<MusicGenerateJobPayload> | undefined,
  attempt: ProviderJobAttempt,
  submitAttemptId: string,
  taskId: string,
): Promise<void> {
  try {
    await persistProviderTaskId(payload.recordId, taskId, submitAttemptId);
  } catch (error) {
    await saveRecoveredTaskIdOnJob(job, payload, taskId);

    if (isLastProviderJobAttempt(attempt)) {
      await markSubmitUnknown(payload.recordId, submitAttemptId, "DB_UPDATE_AFTER_ACCEPT", {
        message: error instanceof Error ? error.message : "DB update failed after provider accept",
      });
      throw new UnrecoverableError("Accepted by provider but failed to persist providerTaskId");
    }

    throw wrapProviderJobError(
      error instanceof Error ? error : new Error("DB update failed after provider accept"),
      true,
    );
  }
}

async function persistProviderTaskId(
  recordId: string,
  taskId: string,
  submitAttemptId: string | null,
): Promise<void> {
  let lastError: unknown;

  for (let i = 0; i < DB_PERSIST_ATTEMPTS; i += 1) {
    try {
      const where = submitAttemptId
        ? {
            id: recordId,
            OR: [
              { submissionState: "dispatching" as const, submitAttemptId },
              { submissionState: "submit_unknown" as const, submitAttemptId },
              { submissionState: "queued" as const },
            ],
          }
        : { id: recordId, providerTaskId: { startsWith: "queue:" } };

      const updated = await prisma.musicGeneration.updateMany({
        where,
        data: {
          providerTaskId: taskId,
          submissionState: "submitted",
          submitCompletedAt: new Date(),
          status: "pending",
          submitErrorCode: null,
          submitErrorMessage: null,
        },
      });

      if (updated.count === 0) {
        const current = await prisma.musicGeneration.findUnique({ where: { id: recordId } });

        if (
          current?.submissionState === "submitted" &&
          current.providerTaskId === taskId
        ) {
          return;
        }

        if (current && !current.providerTaskId.startsWith("queue:")) {
          return;
        }
      } else {
        logLoadControl("suno_submit", {
          source: "worker",
          jobType: "music_generate",
          recordId,
          taskId,
          submissionState: "submitted",
        });
        return;
      }

      lastError = new Error("Conditional persist matched 0 rows");
    } catch (error) {
      lastError = error;
    }

    await sleep(DB_PERSIST_DELAY_MS * (i + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to persist providerTaskId");
}

async function saveRecoveredTaskIdOnJob(
  job: Job<MusicGenerateJobPayload> | undefined,
  payload: MusicGenerateJobPayload,
  taskId: string,
): Promise<void> {
  if (!job) {
    return;
  }

  try {
    await job.updateData({
      ...payload,
      recoveredProviderTaskId: taskId,
    });
  } catch {
    // Best-effort; submit_unknown remains the safety net.
  }
}

async function releaseToQueued(
  recordId: string,
  submitAttemptId: string,
  code: number,
  message: string,
): Promise<void> {
  await prisma.musicGeneration.updateMany({
    where: {
      id: recordId,
      submissionState: "dispatching",
      submitAttemptId,
    },
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
  errorCode: string,
  detail: { code?: number; message: string },
): Promise<void> {
  const where = submitAttemptId
    ? {
        id: recordId,
        submissionState: { in: ["dispatching" as const, "submit_unknown" as const] },
        submitAttemptId,
      }
    : {
        id: recordId,
        submissionState: "dispatching" as const,
      };

  await prisma.musicGeneration.updateMany({
    where,
    data: {
      submissionState: "submit_unknown",
      submitErrorCode: detail.code ? `${errorCode}:${detail.code}` : errorCode,
      submitErrorMessage: detail.message.slice(0, 500),
    },
  });

  logLoadControl(
    "suno_submit",
    {
      source: "worker",
      recordId,
      submissionState: "submit_unknown",
      submitErrorCode: errorCode,
      message: detail.message.slice(0, 200),
    },
    "warn",
  );
}

async function transitionFailed(
  payload: MusicGenerateJobPayload,
  submitAttemptId: string,
  code: number,
  message: string,
): Promise<void> {
  const errorMessage = resolveMusicProviderUserErrorMessage(message);

  await prisma.musicGeneration.updateMany({
    where: {
      id: payload.recordId,
      submitAttemptId,
      submissionState: { in: ["dispatching", "queued"] },
    },
    data: {
      status: "failed",
      submissionState: "failed",
      submitCompletedAt: new Date(),
      submitErrorCode: String(code),
      submitErrorMessage: message.slice(0, 500),
      errorMessage,
      rawStatus: code === 405 || code === 430 || code === 455
        ? MUSIC_PROVIDER_CAPACITY_RAW_STATUS
        : undefined,
    },
  });

  await refundOriginalSpend({
    userId: payload.userId,
    spendIdempotencyKey: `generation:${payload.recordId}:spend`,
    refundIdempotencyKey: `generation:${payload.recordId}:refund`,
    reason: `${payload.spendReason}:provider_failed`,
    relatedEntityType: "music_generation",
    relatedEntityId: payload.recordId,
  }).catch(() => undefined);
}

async function markMusicGenerateFailed(
  payload: MusicGenerateJobPayload,
  error: unknown,
): Promise<void> {
  const rawMessage = error instanceof Error ? error.message : "Provider job failed";
  const errorMessage = resolveMusicProviderUserErrorMessage(rawMessage);

  await prisma.musicGeneration.updateMany({
    where: {
      id: payload.recordId,
      status: "pending",
      submissionState: { in: ["queued", "dispatching"] },
    },
    data: {
      status: "failed",
      submissionState: "failed",
      submitCompletedAt: new Date(),
      submitErrorCode: "PREFLIGHT_FAILED",
      submitErrorMessage: rawMessage.slice(0, 500),
      errorMessage,
    },
  });

  await refundOriginalSpend({
    userId: payload.userId,
    spendIdempotencyKey: `generation:${payload.recordId}:spend`,
    refundIdempotencyKey: `generation:${payload.recordId}:refund`,
    reason: `${payload.spendReason}:provider_failed`,
    relatedEntityType: "music_generation",
    relatedEntityId: payload.recordId,
  }).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type MusicGenerateRecord = MusicGeneration;
