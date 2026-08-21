"use client";

import { useTranslations } from "next-intl";
import { Tooltip } from "@/shared/ui/tooltip";
import { formatTimeMs } from "@/features/music-editor/utils/format-time";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import { me } from "@/features/music-editor/music-editor-classes";

interface TransportControlsProps {
  disabled?: boolean;
}

export function TransportControls({ disabled = false }: TransportControlsProps) {
  const t = useTranslations("Editor.playback");
  const isPlaying = useAudioEditorStore((state) => state.isPlaying);
  const currentTimeMs = useAudioEditorStore((state) => state.currentTimeMs);
  const durationMs = useAudioEditorStore((state) => state.durationMs);
  const loopSelected = useAudioEditorStore((state) => state.loopSelected);
  const selectedRegionId = useAudioEditorStore((state) => state.selectedRegionId);
  const togglePlay = useAudioEditorStore((state) => state.togglePlay);
  const stop = useAudioEditorStore((state) => state.stop);
  const toggleLoopSelected = useAudioEditorStore((state) => state.toggleLoopSelected);
  const setZoom = useAudioEditorStore((state) => state.setZoom);
  const zoom = useAudioEditorStore((state) => state.zoom);

  return (
    <div className={me.transportBar}>
      <Tooltip content={t("playPauseTooltip")}>
        <button
          className={me.transportButton}
          disabled={disabled}
          type="button"
          onClick={togglePlay}
        >
          {isPlaying ? t("pause") : t("play")}
        </button>
      </Tooltip>

      <Tooltip content={t("stopTooltip")}>
        <button
          className={me.transportButton}
          disabled={disabled}
          type="button"
          onClick={stop}
        >
          {t("stop")}
        </button>
      </Tooltip>

      <Tooltip content={t("loopTooltip")}>
        <button
          className={
            loopSelected ? me.transportButtonActive : me.transportButton
          }
          disabled={disabled || !selectedRegionId}
          type="button"
          onClick={toggleLoopSelected}
        >
          {t("loopSelected")}
        </button>
      </Tooltip>

      <span className={me.transportTime}>
        {formatTimeMs(currentTimeMs)} / {formatTimeMs(durationMs)}
      </span>

      <div className={me.transportZoom}>
        <Tooltip content={t("zoomOutTooltip")}>
          <button
            className={me.transportButton}
            disabled={disabled}
            type="button"
            onClick={() => setZoom(zoom - 10)}
          >
            {t("zoomOut")}
          </button>
        </Tooltip>
        <Tooltip content={t("zoomInTooltip")}>
          <button
            className={me.transportButton}
            disabled={disabled}
            type="button"
            onClick={() => setZoom(zoom + 10)}
          >
            {t("zoomIn")}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
