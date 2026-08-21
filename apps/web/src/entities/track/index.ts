import type { Track } from "@ai-music/shared";

export type { Track };

export function formatTrackTitleValue(title: string): string {
  return title.trim() || "Untitled track";
}

export function formatTrackTitle(track: Track): string {
  return formatTrackTitleValue(track.title);
}
