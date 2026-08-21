import type { GenerationJob, GenerationStatus } from "@ai-music/shared";

export type { GenerationJob, GenerationStatus };

export function isGenerationComplete(status: GenerationStatus): boolean {
  return status === "completed";
}

export function isGenerationFailed(status: GenerationStatus): boolean {
  return status === "failed";
}

export function isGenerationTerminal(status: GenerationStatus): boolean {
  return isGenerationComplete(status) || isGenerationFailed(status);
}
