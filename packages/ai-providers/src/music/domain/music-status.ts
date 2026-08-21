export const MUSIC_GENERATION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export type MusicGenerationStatus = (typeof MUSIC_GENERATION_STATUSES)[number];

export function isMusicGenerationStatus(
  value: string,
): value is MusicGenerationStatus {
  return (MUSIC_GENERATION_STATUSES as readonly string[]).includes(value);
}
