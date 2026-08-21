import { prisma, refundCredits } from "@ai-music/db";
import type { GenerationJobPayload, GenerationStatus } from "@ai-music/shared";
import { generateSongWithSunoVoice } from "./convert-voice.js";
import { preprocessVoice } from "./preprocess-voice.js";
import { uploadGenerationResult } from "./upload-result.js";

async function updateJobStatus(
  jobId: string,
  status: GenerationStatus,
  errorMessage?: string,
) {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function processGenerationJob(
  payload: GenerationJobPayload,
): Promise<void> {
  const job = await prisma.generationJob.findUnique({
    where: { id: payload.jobId },
    include: { voiceSample: true },
  });

  if (!job || job.status === "completed" || job.status === "failed") {
    return;
  }

  try {
    await updateJobStatus(payload.jobId, "preprocessing_voice");
    const { voiceSample } = await preprocessVoice(job.voiceSample);

    await updateJobStatus(payload.jobId, "generating_song");
    const resultBuffer = await generateSongWithSunoVoice(job, voiceSample);

    await updateJobStatus(payload.jobId, "uploading_result");
    await uploadGenerationResult(job, resultBuffer);

    await updateJobStatus(payload.jobId, "completed");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";

    await updateJobStatus(payload.jobId, "failed", message);
    await refundCredits({
      userId: payload.userId,
      amountUnits: job.creditsCostUnits,
      reason: "generation_failed",
      idempotencyKey: `generation:${payload.jobId}:refund`,
      relatedEntityType: "generation_job",
      relatedEntityId: payload.jobId,
      sourceSpendIdempotencyKey: `generation:${payload.jobId}:spend`,
    });
  }
}
