"use client";

import type { AudioTrackDto, EditorTrackId } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { me } from "@/features/music-editor/music-editor-classes";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import trackLaneStyles from "@/features/music-editor/styles/track-lane.module.css";
import { seekTimeline } from "@/features/music-editor/utils/timeline-sync";
import {
  clampTrackVolumeDb,
  TRACK_VOLUME_COMMIT_KEYS,
  TRACK_VOLUME_MAX_DB,
  TRACK_VOLUME_MIN_DB,
} from "@/features/music-editor/utils/volume-utils";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/shared/ui/tooltip";

interface TrackLaneProps {
  track: AudioTrackDto;
  disabled?: boolean;
  mixControlsDisabled?: boolean;
  /** When true, Mute is disabled independently of volume controls. */
  muteUnavailable?: boolean;
  regionSelected: boolean;
  onVolumeCommit: (trackId: EditorTrackId, gainDb: number) => void;
  onMuteToggle: (trackId: EditorTrackId, muted: boolean) => void;
}

function stopRowSelection(event: MouseEvent | PointerEvent) {
  event.stopPropagation();
}

function TrackProgressBar({ disabled, onSelect }: { disabled: boolean; onSelect: () => void }) {
  const t = useTranslations("Editor.tracks");
  const fillRef = useRef<HTMLSpanElement>(null);
  const currentTimeMs = useAudioEditorStore((state) => state.currentTimeMs);
  const durationMs = useAudioEditorStore((state) => state.durationMs);
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / durationMs)) : 0;

  useLayoutEffect(() => {
    fillRef.current?.style.setProperty("--track-progress", `${progress * 100}%`);
  }, [progress]);

  return (
    <button
      aria-label={t("seekAria")}
      className={me.trackProgressBar}
      disabled={disabled}
      type="button"
      onClick={() => {
        onSelect();
        seekTimeline(currentTimeMs);
      }}
    >
      <span
        ref={fillRef}
        className={cn(me.trackProgressFill, trackLaneStyles.trackProgressFill)}
      />
    </button>
  );
}

export function TrackLane({
  track,
  disabled = false,
  mixControlsDisabled = false,
  muteUnavailable = false,
  regionSelected,
  onVolumeCommit,
  onMuteToggle,
}: TrackLaneProps) {
  const t = useTranslations("Editor.tracks");
  const linkedTracks = useAudioEditorStore((state) => state.linkedTracks);
  const selectedTrackId = useAudioEditorStore((state) => state.selectedTrackId);
  const selectTrackFromPanel = useAudioEditorStore((state) => state.selectTrackFromPanel);
  const selected = linkedTracks || selectedTrackId === track.id;
  const preview = useAudioEditorStore((state) => state.previewTracks[track.id]);
  const setPreviewGain = useAudioEditorStore((state) => state.setPreviewGain);
  const pendingGainDbRef = useRef(preview.gainDb);
  const muteDisabled = mixControlsDisabled || muteUnavailable;
  const volumeDisabled = mixControlsDisabled || !regionSelected;
  const muteTooltip = muteUnavailable ? t("muteUnavailableTooltip") : t("muteTooltip");
  const trackTooltip =
    track.id === "vocal" ? t("vocalTooltip") : t("instrumentalTooltip");
  const displayLabel = track.id === "vocal" ? t("vocal") : t("instrumental");

  useEffect(() => {
    pendingGainDbRef.current = preview.gainDb;
  }, [preview.gainDb]);

  function handleSelect() {
    if (disabled) {
      return;
    }

    selectTrackFromPanel(track.id);
  }

  function selectTrackForControls() {
    if (!disabled) {
      selectTrackFromPanel(track.id);
    }
  }

  function commitVolume() {
    const nextGainDb = clampTrackVolumeDb(pendingGainDbRef.current);

    selectTrackForControls();
    onVolumeCommit(track.id, nextGainDb);
  }

  function handleVolumeChange(nextGainDb: number) {
    const clampedGainDb = clampTrackVolumeDb(nextGainDb);
    pendingGainDbRef.current = clampedGainDb;
    setPreviewGain(track.id, clampedGainDb);
  }

  function handleVolumeKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    if (!TRACK_VOLUME_COMMIT_KEYS.has(event.key)) {
      return;
    }

    commitVolume();
  }

  function handleRowPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) {
      return;
    }

    const target = event.target;

    if (target instanceof Element && target.closest("[data-track-controls]")) {
      return;
    }

    handleSelect();
  }

  return (
    <div
      className={selected ? me.trackLaneRowSelected : me.trackLaneRow}
      onPointerDown={handleRowPointerDown}
      onKeyDown={(event) => {
        if (disabled || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }

        event.preventDefault();
        handleSelect();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <Tooltip align="start" content={trackTooltip} side="right">
        <span className={me.trackLaneLabel}>{displayLabel}</span>
      </Tooltip>

      <div
        className={me.trackLaneControls}
        data-track-controls=""
        onClick={stopRowSelection}
        onPointerDown={stopRowSelection}
      >
        <Tooltip align="start" content={muteTooltip} side="bottom">
          <button
            className={preview.muted ? me.laneToggleActive : me.laneToggle}
            disabled={muteDisabled}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              selectTrackForControls();
              onMuteToggle(track.id, !preview.muted);
            }}
            onPointerDown={stopRowSelection}
          >
            {t("muteShort")}
          </button>
        </Tooltip>

        <Tooltip align="end" content={t("volumeTooltip")} side="bottom">
          <label className={me.trackVolumeLabel}>
            <input
              className={me.trackVolumeSlider}
              disabled={volumeDisabled}
              max={TRACK_VOLUME_MAX_DB}
              min={TRACK_VOLUME_MIN_DB}
              step={1}
              type="range"
              value={preview.gainDb}
              onChange={(event) => {
                handleVolumeChange(Number(event.target.value));
              }}
              onBlur={commitVolume}
              onKeyUp={handleVolumeKeyUp}
              onPointerUp={commitVolume}
            />
            <span>{preview.gainDb} dB</span>
          </label>
        </Tooltip>
      </div>

      <div
        className={me.trackWaveformWrap}
        onClick={stopRowSelection}
        onPointerDown={stopRowSelection}
      >
        <TrackProgressBar disabled={disabled} onSelect={handleSelect} />
      </div>
    </div>
  );
}
