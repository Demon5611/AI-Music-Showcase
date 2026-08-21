import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";

export function clampTimeMs(timeMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return Math.max(0, timeMs);
  }

  return Math.min(durationMs, Math.max(0, timeMs));
}

export function seekTimeline(timeMs: number): void {
  const { durationMs, setCurrentTime, playbackController } =
    useAudioEditorStore.getState();
  const clamped = clampTimeMs(timeMs, durationMs);

  setCurrentTime(clamped);
  playbackController?.seek(clamped);
}
