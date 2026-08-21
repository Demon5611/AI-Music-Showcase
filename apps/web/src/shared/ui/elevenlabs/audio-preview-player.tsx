"use client";

import { useEffect } from "react";
import {
  AudioPlayerButton,
  AudioPlayerProgress,
  AudioPlayerProvider,
  AudioPlayerTime,
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/ui/audio-player";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthenticatedBlobUrl } from "@/shared/ui/authenticated-blob-url";
import { TrackKaraokeSection } from "@/shared/ui/karaoke/track-karaoke-section";
import styles from "@/shared/ui/elevenlabs/elevenlabs-ui.module.css";

interface AudioPreviewKaraokeOptions {
  trackId?: string;
  musicProvider?: string | null;
  lyricsText?: string | null;
  defaultExpanded?: boolean;
}

interface AudioPreviewPlayerProps {
  src: string;
  className?: string;
  karaoke?: AudioPreviewKaraokeOptions;
}

function AudioPreviewControls({ playbackUrl }: { playbackUrl: string }) {
  const player = useAudioPlayer();

  useEffect(() => {
    void player.setActiveItem({ id: playbackUrl, src: playbackUrl });
  }, [playbackUrl, player]);

  return (
    <div className={styles.audioPreview}>
      <AudioPlayerButton variant="outline" size="icon-sm" />
      <div className={styles.audioPreviewTimeline}>
        <AudioPlayerProgress />
      </div>
      <div className={styles.audioPreviewTime}>
        <AudioPlayerTime />
      </div>
    </div>
  );
}

function AudioPreviewKaraokeFooter({
  trackId,
  musicProvider,
  lyricsText,
  defaultExpanded,
}: AudioPreviewKaraokeOptions) {
  const currentTimeSec = useAudioPlayerTime();

  return (
    <TrackKaraokeSection
      currentTimeSec={currentTimeSec}
      defaultExpanded={defaultExpanded}
      lyricsText={lyricsText}
      musicProvider={musicProvider}
      trackId={trackId}
    />
  );
}

export function AudioPreviewPlayer({ src, className, karaoke }: AudioPreviewPlayerProps) {
  return (
    <div className={className}>
      <AuthenticatedBlobUrl src={src}>
        {(playbackUrl) => {
          if (!playbackUrl) {
            return <Skeleton className={styles.playerSkeleton} />;
          }

          return (
            <AudioPlayerProvider>
              <AudioPreviewControls playbackUrl={playbackUrl} />
              {karaoke ? <AudioPreviewKaraokeFooter {...karaoke} /> : null}
            </AudioPlayerProvider>
          );
        }}
      </AuthenticatedBlobUrl>
    </div>
  );
}
