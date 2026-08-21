"use client";

import type { MusicStatusResponseDto } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { mc } from "@/features/music-create/music-create-classes";
import { MusicGenerationLoader } from "@/features/music-create/music-generation-loader";
import { SongTrackResult } from "@/features/music-create/song-track-result";
import {
  countPendingSongVariantSlots,
  isMusicGenerationTrackPlayable,
  resolveMusicGenerationUiState,
  shouldShowMusicGenerationGlobalLoader,
} from "@/features/music-create/utils/music-generation-ui-readiness";
import { GenerationAlbumCoverSection } from "@/shared/ui/track-cover/generation-album-cover-section";

interface MusicCreateResultsProps {
  isGenerating: boolean;
  isPolling: boolean;
  isDeletingTrack: boolean;
  isOpeningEditor: boolean;
  openingEditorTrackId: string | null;
  taskId: string | null;
  status: MusicStatusResponseDto | null;
  songTracks: NonNullable<MusicStatusResponseDto["tracks"]>;
  onDeleteTrack: (trackId: string) => void;
  onOpenEditor: (trackId: string) => void;
}

export function MusicCreateResults({
  isGenerating,
  isPolling,
  isDeletingTrack,
  isOpeningEditor,
  openingEditorTrackId,
  taskId,
  status,
  songTracks,
  onDeleteTrack,
  onOpenEditor,
}: MusicCreateResultsProps) {
  const t = useTranslations("MusicCreate.results");
  const playableTracks = songTracks.filter(isMusicGenerationTrackPlayable);
  const uiState = resolveMusicGenerationUiState({
    isSubmitting: isGenerating,
    status,
    isPolling,
  });
  const showLoader = shouldShowMusicGenerationGlobalLoader(uiState);
  const pendingSlots = countPendingSongVariantSlots({
    status,
    isPolling,
  });

  return (
    <>
      {showLoader ? (
        <div className={mc.loaderWrap}>
          <MusicGenerationLoader
            isStarting={isGenerating}
            phaseHint={status?.phaseHint}
            queueEtaSec={status?.queueEtaSec}
            queuePhase={status?.queuePhase}
            status={status?.status}
            taskId={taskId}
          />
        </div>
      ) : null}

      {playableTracks.length > 0 ? (
        <div className={mc.tracksList}>
          {status?.recordId ? (
            <GenerationAlbumCoverSection
              albumCoverImages={status.albumCoverImages}
              defaultImageUrl={playableTracks[0]?.imageUrl}
              generationId={status.recordId}
              generationStatus={status.status}
              hasReadyTracks={playableTracks.length > 0}
              musicProvider={status.provider}
              selectedAlbumCoverUrl={status.selectedAlbumCoverUrl}
              title={playableTracks[0]?.title ?? t("trackFallback")}
            />
          ) : null}
          {playableTracks.map((track) =>
            track.audioUrl ? (
              <SongTrackResult
                key={track.id}
                audioUrl={track.audioUrl}
                canDelete={Boolean(track.canDelete)}
                durationSec={track.durationSec}
                isDeleting={isDeletingTrack}
                isOpeningEditor={isOpeningEditor && openingEditorTrackId === track.id}
                lyricsText={track.lyricsText}
                musicProvider={status?.provider}
                title={track.title}
                trackId={track.id}
                onDelete={() => onDeleteTrack(track.id)}
                onOpenEditor={(id) => onOpenEditor(id)}
              />
            ) : null,
          )}
          {Array.from({ length: pendingSlots.preparing }, (_, index) => (
            <div
              className={mc.trackPlaceholder}
              key={`preparing-variant-${index}`}
              role="status"
            >
              <span className={mc.submitSpinner} />
              <p className={mc.trackPlaceholderText}>{t("preparingSecond")}</p>
            </div>
          ))}
          {Array.from({ length: pendingSlots.failed }, (_, index) => (
            <p className={mc.trackVariantFailed} key={`failed-variant-${index}`} role="status">
              {t("secondFailed")}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
