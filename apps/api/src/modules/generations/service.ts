import { prisma } from "@ai-music/db";
import {
  OPERATION_COST_UNITS,
  type CreateGenerationInput,
} from "@ai-music/shared";
import { ForbiddenError, NotFoundError } from "../../common/errors.js";
import { assertMaxDuration, getQueuePriorityForUser } from "../billing/entitlements.service.js";
import { spendCredits, refundOriginalSpend } from "../credits/service.js";
import { enqueueGenerationJob } from "../queue/generation-queue.js";
import { toGenerationJobDto } from "./mapper.js";

export async function createGenerationJob(
  userId: string,
  input: CreateGenerationInput,
) {
  const voiceSample = await prisma.voiceSample.findFirst({
    where: { id: input.voiceSampleId, userId },
  });

  if (!voiceSample) {
    throw new NotFoundError("Voice sample not found");
  }

  if (!voiceSample.consentConfirmed || voiceSample.status !== "ready") {
    throw new ForbiddenError("Voice sample is not ready");
  }

  if (!voiceSample.sunoVoiceId || voiceSample.voiceCloneStatus !== "ready") {
    throw new ForbiddenError("Голос AI Music не готов");
  }

  await assertMaxDuration(userId, input.duration);

  const job = await prisma.generationJob.create({
    data: {
      userId,
      voiceSampleId: voiceSample.id,
      prompt: input.prompt,
      style: input.style,
      durationSec: input.duration,
      status: "pending",
      creditsCostUnits: OPERATION_COST_UNITS.generateTrack,
    },
  });

  await spendCredits({
    userId,
    amountUnits: OPERATION_COST_UNITS.generateTrack,
    reason: "generation_start",
    idempotencyKey: `generation:${job.id}:spend`,
    relatedEntityType: "generation_job",
    relatedEntityId: job.id,
  });

  try {
    const priority = await getQueuePriorityForUser(userId);
    await enqueueGenerationJob(
      {
        jobId: job.id,
        userId,
        voiceSampleId: voiceSample.id,
      },
      priority,
    );
  } catch (error) {
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "Failed to enqueue generation job",
      },
    });
    await refundOriginalSpend({
      userId,
      spendIdempotencyKey: `generation:${job.id}:spend`,
      refundIdempotencyKey: `generation:${job.id}:refund`,
      reason: "enqueue_failed",
      relatedEntityType: "generation_job",
      relatedEntityId: job.id,
    });
    throw error;
  }

  return { jobId: job.id };
}

export async function getGenerationJob(userId: string, jobId: string) {
  const job = await prisma.generationJob.findFirst({
    where: { id: jobId, userId },
  });

  if (!job) {
    throw new NotFoundError("Generation job not found");
  }

  return toGenerationJobDto(job);
}

export async function getGenerationJobStatus(userId: string, jobId: string) {
  const job = await prisma.generationJob.findFirst({
    where: { id: jobId, userId },
    select: { status: true },
  });

  if (!job) {
    throw new NotFoundError("Generation job not found");
  }

  return { status: job.status };
}
