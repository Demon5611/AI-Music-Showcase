import type { GenerationJob } from "@ai-music/shared";

/**
 * Progress percentages only. User-facing status labels live in
 * `Generation.status` next-intl namespace.
 */
const GENERATION_STATUS_PROGRESS: Record<GenerationJob["status"], number> = {
  pending: 8,
  preprocessing_voice: 20,
  generating_lyrics: 35,
  generating_song: 55,
  converting_voice: 75,
  uploading_result: 90,
  completed: 100,
  failed: 0,
};

export function resolveGenerationProgress(status: GenerationJob["status"]): number {
  return GENERATION_STATUS_PROGRESS[status];
}

export function isGenerationInProgress(status: GenerationJob["status"]): boolean {
  return status !== "completed" && status !== "failed";
}
