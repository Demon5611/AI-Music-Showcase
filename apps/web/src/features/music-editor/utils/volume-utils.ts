import type { EditorTrackId } from "@ai-music/shared";

export const TRACK_VOLUME_MIN_DB = -12;
export const TRACK_VOLUME_MAX_DB = 12;
export const TRACK_VOLUME_STEP_DB = 1;

export function clampTrackVolumeDb(gainDb: number): number {
  return Math.min(
    TRACK_VOLUME_MAX_DB,
    Math.max(TRACK_VOLUME_MIN_DB, Math.round(gainDb)),
  );
}

export function resolveVolumeKeyboardDelta(event: KeyboardEvent): number | null {
  if (
    event.code === "ArrowUp" ||
    event.key === "ArrowUp" ||
    event.key === "+" ||
    event.key === "="
  ) {
    return TRACK_VOLUME_STEP_DB;
  }

  if (event.code === "ArrowDown" || event.key === "ArrowDown" || event.key === "-") {
    return -TRACK_VOLUME_STEP_DB;
  }

  return null;
}

export const TRACK_VOLUME_COMMIT_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

export function resolveVolumeTrackId(selectedTrackId: EditorTrackId | null): EditorTrackId {
  return selectedTrackId ?? "vocal";
}
