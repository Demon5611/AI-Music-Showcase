import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InsufficientCreditsLedgerError,
  lockUserCreditsInTransaction,
  prisma,
  refundCreditsInTransaction,
  spendCreditsInTransaction,
} from "@ai-music/db";
import type { Prisma, VoiceProfile, VoiceSample } from "@ai-music/db";
import {
  buildAudioengineVoiceProfileOperationKey,
  buildAudioengineVoiceProfileRefundKey,
  buildAudioengineVoiceProfileSpendKey,
  AUDIOENGINE_CREDIT_COST_UNITS,
  AUDIOENGINE_VOCAL_CLONE_MAX_BYTES,
  AUDIOENGINE_VOCAL_CLONE_MAX_DURATION_SEC,
  AUDIOENGINE_VOCAL_CLONE_MIN_DURATION_SEC,
  resolveAudioenginePersonalVoiceAvailability,
  VOICE_PROFILE_ACTIVE_STATUSES,
  VOICE_PROFILE_USER_VISIBLE_STATUSES,
  type CreateAudioengineVoiceProfileBody,
} from "@ai-music/shared";
import {
  BadRequestError,
  InsufficientCreditsError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../common/errors.js";
import {
  assertFfmpegAvailable,
  convertAudioFileToMp3,
} from "../../common/ffmpeg-audio.js";
import { getApiEnv } from "../../config/env.js";
import { enqueueAudioengineVocalCloneJob } from "../queue/audioengine-provider-job-queue.js";
import { isAudioengineWorkerListenHeartbeatFresh } from "../music/audioengine-worker-heartbeat.js";
import {
  buildVoiceSampleKey,
  getStorageService,
} from "../storage/storage.service.js";
import { toVoiceProfileDto } from "./mapper.js";

const PROVIDER = "audioengine";

function assertPersonalVoiceEnabled(): void {
  const env = getApiEnv();
  const availability = resolveAudioenginePersonalVoiceAvailability({
    appEnv: env.APP_ENV,
  });

  if (!availability.available) {
    throw new NotFoundError("Voice profile creation is not available");
  }
}

function assertVoiceSampleDuration(durationSec: number): void {
  if (
    durationSec < AUDIOENGINE_VOCAL_CLONE_MIN_DURATION_SEC ||
    durationSec > AUDIOENGINE_VOCAL_CLONE_MAX_DURATION_SEC
  ) {
    throw new BadRequestError(
      `Voice sample duration must be ${AUDIOENGINE_VOCAL_CLONE_MIN_DURATION_SEC}–` +
        `${AUDIOENGINE_VOCAL_CLONE_MAX_DURATION_SEC} seconds`,
      "VOICE_PROFILE_DURATION_INVALID",
    );
  }
}

function assertAudioSize(sizeBytes: number): void {
  if (sizeBytes >= AUDIOENGINE_VOCAL_CLONE_MAX_BYTES) {
    throw new BadRequestError(
      "Voice sample must be smaller than 10 MB",
      "VOICE_PROFILE_FILE_TOO_LARGE",
    );
  }
}

async function normalizeSampleToMp3(source: Buffer): Promise<Buffer> {
  await assertFfmpegAvailable();
  const workDir = await mkdtemp(join(tmpdir(), "ai-music-voice-profile-"));
  const inputPath = join(workDir, "source.audio");
  const outputPath = join(workDir, "normalized.mp3");

  try {
    await writeFile(inputPath, source);
    await convertAudioFileToMp3(inputPath, outputPath);
    const normalized = await readFile(outputPath);
    assertAudioSize(normalized.byteLength);
    return normalized;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError(
      "Voice sample could not be converted to MP3",
      "VOICE_PROFILE_AUDIO_INVALID",
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function persistNormalizedSample(
  sample: VoiceSample,
  normalized: Buffer,
): Promise<VoiceSample> {
  const storage = getStorageService();
  const normalizedKey = buildVoiceSampleKey(sample.userId, sample.id, "mp3");

  await storage.putObject({
    key: normalizedKey,
    body: normalized,
    contentType: "audio/mpeg",
    kind: "voice_sample",
    userId: sample.userId,
    entityType: "voice_sample",
    entityId: sample.id,
    visibility: "private",
  });

  try {
    const updated = await prisma.voiceSample.update({
      where: { id: sample.id },
      data: { r2Key: normalizedKey },
    });

    if (sample.r2Key !== normalizedKey) {
      await storage.deleteObject(sample.r2Key).catch(() => undefined);
    }
    return updated;
  } catch (error) {
    if (sample.r2Key !== normalizedKey) {
      await storage.deleteObject(normalizedKey).catch(() => undefined);
    }
    throw error;
  }
}

export async function getMyVoiceProfile(userId: string) {
  assertPersonalVoiceEnabled();

  // Ready profile is source of truth — never let an older failed row win.
  const ready = await prisma.voiceProfile.findFirst({
    where: {
      userId,
      provider: PROVIDER,
      deletedAt: null,
      status: "ready",
    },
    orderBy: { createdAt: "desc" },
  });

  if (ready) {
    return toVoiceProfileDto(ready);
  }

  const profile = await prisma.voiceProfile.findFirst({
    where: {
      userId,
      provider: PROVIDER,
      deletedAt: null,
      status: { in: [...VOICE_PROFILE_USER_VISIBLE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });

  return profile ? toVoiceProfileDto(profile) : null;
}

async function findActiveProfile(userId: string): Promise<VoiceProfile | null> {
  return prisma.voiceProfile.findFirst({
    where: {
      userId,
      provider: PROVIDER,
      deletedAt: null,
      status: { in: [...VOICE_PROFILE_ACTIVE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function loadEligibleSample(
  userId: string,
  voiceSampleId: string,
): Promise<{ sample: VoiceSample; normalizedBytes: number }> {
  const sample = await prisma.voiceSample.findFirst({
    where: { id: voiceSampleId, userId },
  });

  if (
    !sample ||
    !sample.consentConfirmed ||
    sample.status !== "ready" ||
    sample.r2Key === "pending"
  ) {
    throw new BadRequestError(
      "A ready, consented voice sample is required",
      "VOICE_SAMPLE_NOT_READY",
    );
  }

  assertVoiceSampleDuration(sample.durationSec);

  let source: Buffer;
  try {
    source = await getStorageService().get(sample.r2Key);
  } catch {
    throw new BadRequestError(
      "Voice sample audio is not available",
      "VOICE_SAMPLE_FILE_MISSING",
    );
  }

  assertAudioSize(source.byteLength);
  const normalized = await normalizeSampleToMp3(source);
  const normalizedSample = await persistNormalizedSample(sample, normalized);
  return {
    sample: normalizedSample,
    normalizedBytes: normalized.byteLength,
  };
}

interface CommitProfileInput {
  userId: string;
  sample: VoiceSample;
  normalizedBytes: number;
  operationKey: string;
  requestId?: string;
}

async function createProfileInTransaction(
  input: CommitProfileInput,
  tx: Prisma.TransactionClient,
) {
  await lockUserCreditsInTransaction(input.userId, tx);
  const lockedExisting = await tx.voiceProfile.findFirst({
    where: {
      userId: input.userId,
      provider: PROVIDER,
      deletedAt: null,
      status: { in: [...VOICE_PROFILE_ACTIVE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (lockedExisting) {
    return { profile: lockedExisting, created: false };
  }

  const voiceProfileId = randomUUID();
  const profile = await tx.voiceProfile.create({
    data: {
      id: voiceProfileId,
      userId: input.userId,
      provider: PROVIDER,
      externalId: `pending:${voiceProfileId}`,
      status: "creating",
      sourceVoiceSampleId: input.sample.id,
      metadata: {
        operationKey: input.operationKey,
        normalizedBytes: input.normalizedBytes,
        requestId: input.requestId ?? null,
      },
    },
  });
  await spendCreditsInTransaction(
    {
      userId: input.userId,
      amountUnits: AUDIOENGINE_CREDIT_COST_UNITS.createPersonalVoice,
      reason: "audioengine_voice_profile_create",
      idempotencyKey: buildAudioengineVoiceProfileSpendKey(profile.id),
      relatedEntityType: "voice_profile",
      relatedEntityId: profile.id,
    },
    tx,
  );
  return { profile, created: true };
}

async function commitProfile(input: CommitProfileInput) {
  try {
    return await prisma.$transaction((tx) =>
      createProfileInTransaction(input, tx),
    );
  } catch (error) {
    if (error instanceof InsufficientCreditsLedgerError) {
      throw new InsufficientCreditsError();
    }
    throw error;
  }
}

async function markFailedAndRefund(
  profileId: string,
  input: CommitProfileInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.voiceProfile.update({
      where: { id: profileId },
      data: {
        status: "failed",
        metadata: {
          operationKey: input.operationKey,
          normalizedBytes: input.normalizedBytes,
          requestId: input.requestId ?? null,
          failureCode: "enqueue_failed",
        },
      },
    });

    const spend = await tx.creditTransaction.findUnique({
      where: { idempotencyKey: buildAudioengineVoiceProfileSpendKey(profileId) },
      select: { amountUnits: true },
    });

    if (spend && spend.amountUnits < 0) {
      await refundCreditsInTransaction(
        {
          userId: input.userId,
          amountUnits: Math.abs(spend.amountUnits),
          reason: "audioengine_voice_profile_enqueue_failed",
          idempotencyKey: buildAudioengineVoiceProfileRefundKey(profileId),
          relatedEntityType: "voice_profile",
          relatedEntityId: profileId,
          sourceSpendIdempotencyKey: buildAudioengineVoiceProfileSpendKey(profileId),
        },
        tx,
      );
    }
  });
}

async function enqueueProfile(
  profile: VoiceProfile,
  input: CommitProfileInput,
): Promise<void> {
  try {
    await enqueueAudioengineVocalCloneJob({
      type: "audioengine_vocal_clone",
      userId: input.userId,
      voiceProfileId: profile.id,
      voiceSampleId: input.sample.id,
      spendReason: input.operationKey,
      requestId: input.requestId,
    });
  } catch {
    await markFailedAndRefund(profile.id, input);
    throw new ServiceUnavailableError("Voice profile creation could not be queued");
  }
}

export async function createAudioengineVoiceProfile(
  userId: string,
  input: CreateAudioengineVoiceProfileBody,
  requestId?: string,
) {
  assertPersonalVoiceEnabled();

  const env = getApiEnv();
  if (
    !resolveAudioenginePersonalVoiceAvailability({ appEnv: env.APP_ENV }).workerListenReady
  ) {
    throw new ServiceUnavailableError("Personal AI voice is not ready");
  }

  const heartbeatFresh = await isAudioengineWorkerListenHeartbeatFresh();
  if (!heartbeatFresh) {
    throw new ServiceUnavailableError("Personal AI voice is not ready");
  }

  const existing = await findActiveProfile(userId);
  if (existing) {
    return toVoiceProfileDto(existing);
  }

  const { sample, normalizedBytes } = await loadEligibleSample(
    userId,
    input.voiceSampleId,
  );
  const commitInput: CommitProfileInput = {
    userId,
    sample,
    normalizedBytes,
    operationKey: buildAudioengineVoiceProfileOperationKey(userId, sample.id),
    requestId,
  };
  const txResult = await commitProfile(commitInput);

  if (txResult.created) {
    await enqueueProfile(txResult.profile, commitInput);
  }
  return toVoiceProfileDto(txResult.profile);
}
