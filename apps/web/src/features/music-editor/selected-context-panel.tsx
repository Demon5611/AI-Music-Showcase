"use client";

import { useTranslations } from "next-intl";
import { Tooltip } from "@/shared/ui/tooltip";
import {
  selectRegionLabel,
  selectSelectedRegion,
  useAudioEditorStore,
} from "@/features/music-editor/store/audio-editor-store";
import { formatTimeRangeMs } from "@/features/music-editor/utils/format-time";
import { me } from "@/features/music-editor/music-editor-classes";

export function SelectedContextPanel() {
  const t = useTranslations("Editor.context");
  const tCommon = useTranslations("Common");
  const selectedRegion = useAudioEditorStore(selectSelectedRegion);
  const linkedTracks = useAudioEditorStore((state) => state.linkedTracks);
  const selectedTrackId = useAudioEditorStore((state) => state.selectedTrackId);
  const timelineSelectionSec = useAudioEditorStore(
    (state) => state.timelineSelectionSec,
  );
  const tracks = useAudioEditorStore((state) => state.tracks);

  const trackLabel = linkedTracks
    ? t("linkedTracks")
    : tracks.find((track) => track.id === selectedTrackId)?.label ?? tCommon("emptyValue");

  return (
    <Tooltip block content={t("tooltip")}>
      <div className={me.contextPanel}>
        <p className={me.contextTitle}>{t("editing")}</p>
        {selectedRegion ? (
          <div className={me.contextGrid}>
            <span>{t("track", { label: trackLabel })}</span>
            <span>{t("region", { label: selectRegionLabel(selectedRegion) })}</span>
            <span>
              {t("time", {
                range: formatTimeRangeMs(selectedRegion.startMs, selectedRegion.endMs),
              })}
            </span>
            {timelineSelectionSec ? (
              <span>
                {t("selection", {
                  range: formatTimeRangeMs(
                    Math.round(timelineSelectionSec.startSec * 1000),
                    Math.round(timelineSelectionSec.endSec * 1000),
                  ),
                })}
              </span>
            ) : null}
          </div>
        ) : (
          <p className={me.panelHint}>{t("emptyHint")}</p>
        )}
      </div>
    </Tooltip>
  );
}
