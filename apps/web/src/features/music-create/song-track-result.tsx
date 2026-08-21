"use client";

import { useTranslations } from "next-intl";
import { mtk } from "@/shared/theme/music-track-classes";
import { buildAudioDownloadFilename } from "@/shared/lib/build-audio-download-filename";
import { DeleteIconButton } from "@/shared/ui/delete-icon-button";
import { DownloadAudioButton } from "@/shared/ui/download-audio-button";
import { AudioPreviewPlayer } from "@/shared/ui/elevenlabs";

interface SongTrackResultProps {
  trackId?: string;
  /** Persisted generation provider for Karaoke capability gate. */
  musicProvider?: string | null;
  title: string;
  audioUrl: string;
  lyricsText?: string;
  durationSec?: number;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete?: () => void;
  onOpenEditor?: (trackId: string) => void;
  isOpeningEditor?: boolean;
}

function formatDuration(durationSec?: number): string | null {
  if (!durationSec) {
    return null;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.round(durationSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function SongTrackResult({
  trackId,
  musicProvider,
  title,
  audioUrl,
  lyricsText,
  durationSec,
  canDelete,
  isDeleting,
  onDelete,
  onOpenEditor,
  isOpeningEditor,
}: SongTrackResultProps) {
  const t = useTranslations("MusicCreate.results");
  const durationLabel = formatDuration(durationSec);

  return (
    <div className={mtk.resultPlayer}>
      <div className={mtk.resultHeader}>
        <div className={mtk.resultMeta}>
          <p className={mtk.resultTitle}>{title}</p>
          {durationLabel ? (
            <span className={mtk.resultDuration}>{durationLabel}</span>
          ) : null}
        </div>
        <div className={mtk.resultActions}>
          <DownloadAudioButton
            audioUrl={audioUrl}
            className={mtk.resultDownloadButton}
            filename={buildAudioDownloadFilename(title)}
            label={t("download")}
          />
          {canDelete && onDelete ? (
            <DeleteIconButton
              disabled={isDeleting}
              label={t("deleteTrack")}
              onClick={onDelete}
            />
          ) : null}
        </div>
      </div>
      <AudioPreviewPlayer
        className={mtk.player}
        karaoke={{
          trackId,
          musicProvider,
          lyricsText,
        }}
        src={audioUrl}
      />
      {trackId && onOpenEditor ? (
        <button
          className={mtk.editorLink}
          disabled={isOpeningEditor}
          type="button"
          onClick={() => onOpenEditor(trackId)}
        >
          {isOpeningEditor ? t("openingEditor") : t("openEditor")}
        </button>
      ) : null}
    </div>
  );
}
