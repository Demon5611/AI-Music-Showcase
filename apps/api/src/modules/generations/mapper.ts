import type { GenerationJob as GenerationJobDto } from "@ai-music/shared";
import { unitsToCredits } from "@ai-music/shared";
import type { GenerationJob } from "@ai-music/db";

export function toGenerationJobDto(job: GenerationJob): GenerationJobDto {
  return {
    id: job.id,
    userId: job.userId,
    voiceSampleId: job.voiceSampleId,
    trackId: job.trackId,
    prompt: job.prompt,
    style: job.style,
    durationSec: job.durationSec,
    status: job.status as GenerationJobDto["status"],
    errorMessage: job.errorMessage,
    providerJobId: job.providerJobId,
    creditsCost: unitsToCredits(job.creditsCostUnits),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
