"use client";

import type { MusicGenerationRecordDto } from "@ai-music/shared";
import { useFormatter, useTranslations } from "next-intl";
import { AudioPreviewPlayer } from "@/shared/ui/elevenlabs";
import { mtk } from "@/shared/theme/music-track-classes";
import { buildAudioDownloadFilename } from "@/shared/lib/build-audio-download-filename";
import { isTrackPlaybackAvailable } from "@/shared/lib/is-track-playback-available";
import { DeleteIconButton } from "@/shared/ui/delete-icon-button";
import { DownloadAudioButton } from "@/shared/ui/download-audio-button";
import { CollapsibleLyrics } from "@/shared/ui/collapsible-lyrics";
import { GenerationAlbumCoverSection } from "@/shared/ui/track-cover/generation-album-cover-section";
import { formatTrackTitleValue } from "@/entities/track";
import { resolveHistoryItemTitle } from "@/features/music-history/utils/history-item-grouping";
import { cn } from "@/lib/utils";

const STATUS_MESSAGE_KEYS = {
  pending: "status.pending",
  processing: "status.processing",
  completed: "status.completed",
  failed: "status.failed",
} as const;

type KnownStatus = keyof typeof STATUS_MESSAGE_KEYS;

function isKnownStatus(status: string): status is KnownStatus {
  return status in STATUS_MESSAGE_KEYS;
}

function formatDuration(durationSec: number | null): string | null {
  if (!durationSec) {
    return null;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.round(durationSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface HistoryRecordSectionProps {
  item: MusicGenerationRecordDto;
  variant: "root" | "remix";
  isDeleting: boolean;
  isSelected: boolean;
  openingEditorTrackId?: string | null;
  titleId: string;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onOpenEditor?: (trackId: string) => void;
}

export function HistoryRecordSection({
  item,
  variant,
  isDeleting,
  isSelected,
  openingEditorTrackId,
  titleId,
  onToggleSelect,
  onDelete,
  onDeleteTrack,
  onOpenEditor,
}: HistoryRecordSectionProps) {
  const t = useTranslations("History");
  const format = useFormatter();
  const itemTitle = resolveHistoryItemTitle(item);
  const statusLabel = isKnownStatus(item.status)
    ? t(STATUS_MESSAGE_KEYS[item.status])
    : t("status.unknown");
  const typeLabel = item.type === "song" ? t("type.song") : t("type.lyrics");
  const createdAtLabel = format.dateTime(new Date(item.createdAt), {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <section className={cn(variant === "remix" ? mtk.historyRemixSection : mtk.historyRootSection)}>
      <div className={mtk.historyHeader}>
        <label className={mtk.historyCheckboxLabel}>
          <input
            aria-labelledby={titleId}
            checked={isSelected}
            className={mtk.historyCheckbox}
            type="checkbox"
            onChange={() => onToggleSelect(item.id)}
          />
        </label>
        <div className={mtk.historyHeaderMain}>
          <div className={mtk.historyTitleRow}>
            <div className={mtk.historyTitleGroup}>
              {variant === "remix" ? (
                <span className={mtk.historyRemixBadge}>{t("remixBadge")}</span>
              ) : null}
              <h3 className={mtk.historyTitle} id={titleId}>
                {itemTitle}
              </h3>
            </div>
            <DeleteIconButton
              disabled={isDeleting}
              label={t("deleteRecord")}
              onClick={() => void onDelete(item.id)}
            />
          </div>
          <div className={mtk.historyTitleMeta}>
            <span className={mtk.historyBadge}>{statusLabel}</span>
            <p className={mtk.historyMeta}>
              {typeLabel} · {createdAtLabel}
              {item.rawStatus ? ` · ${item.rawStatus}` : ""}
            </p>
          </div>
        </div>
      </div>

      {item.type === "song" && item.tracks.length > 0 ? (
        <GenerationAlbumCoverSection
          albumCoverImages={item.albumCoverImages}
          defaultImageUrl={item.tracks[0]?.imageUrl}
          generationId={item.id}
          generationStatus={item.status}
          hasReadyTracks={item.tracks.some((track) =>
            isTrackPlaybackAvailable({
              audioUrl: track.audioUrl,
              persistenceState: track.persistenceState,
              playbackAvailable: track.playbackAvailable,
              audioStatus: track.audioStatus,
            }),
          )}
          musicProvider={item.provider}
          selectedAlbumCoverUrl={item.selectedAlbumCoverUrl}
          title={itemTitle}
        />
      ) : null}

      {item.tracks.map((track) => {
        const playbackAvailable = isTrackPlaybackAvailable({
          audioUrl: track.audioUrl,
          persistenceState: track.persistenceState,
          playbackAvailable: track.playbackAvailable,
          audioStatus: track.audioStatus,
        });

        return (
          <div
            className={cn(
              mtk.historyTrackUnit,
              variant === "root" ? mtk.historyTrackUnitRoot : mtk.historyTrackUnitRemix,
            )}
            key={track.id}
          >
            <div className={mtk.historyTrackHeader}>
              <div className={mtk.historyTrackMeta}>
                <p className={mtk.historyTrackTitle}>{formatTrackTitleValue(track.title)}</p>
                {formatDuration(track.durationSec) ? (
                  <span className={mtk.resultDuration}>{formatDuration(track.durationSec)}</span>
                ) : null}
              </div>
              <div className={mtk.resultActions}>
                {playbackAvailable && track.audioUrl ? (
                  <DownloadAudioButton
                    audioUrl={track.audioUrl}
                    className={mtk.resultDownloadButton}
                    filename={buildAudioDownloadFilename(track.title)}
                    label={t("download")}
                  />
                ) : null}
                <DeleteIconButton
                  disabled={isDeleting}
                  label={t("deleteTrack")}
                  onClick={() => void onDeleteTrack(track.id)}
                />
              </div>
            </div>
            {playbackAvailable && track.audioUrl ? (
              <AudioPreviewPlayer
                className={mtk.player}
                karaoke={{
                  trackId: track.id,
                  musicProvider: item.provider,
                  defaultExpanded: false,
                  lyricsText: track.lyricsText,
                }}
                src={track.audioUrl}
              />
            ) : item.type === "song" && item.status === "completed" ? (
              <p className={mtk.audioUnavailable}>{t("audioUnavailable")}</p>
            ) : null}
            {item.type === "song" && playbackAvailable && track.audioUrl && onOpenEditor ? (
              <button
                className={mtk.editorLink}
                disabled={openingEditorTrackId === track.id}
                type="button"
                onClick={() => onOpenEditor(track.id)}
              >
                {openingEditorTrackId === track.id ? t("openingEditor") : t("openEditor")}
              </button>
            ) : null}
          </div>
        );
      })}

      {item.lyrics?.map((lyricsItem, index) => (
        <CollapsibleLyrics
          defaultExpanded={false}
          key={`${item.id}-lyrics-${index}`}
          text={lyricsItem.text}
        />
      ))}

      {item.errorMessage ? <p className={mtk.error}>{item.errorMessage}</p> : null}
    </section>
  );
}
