"use client";

import { useTranslations } from "next-intl";
import { TrackKaraokeSection } from "@/shared/ui/karaoke/track-karaoke-section";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import { me } from "@/features/music-editor/music-editor-classes";

export function EditorKaraokePanel() {
  const t = useTranslations("Editor");
  const trackId = useAudioEditorStore((state) => state.sourceTrackId);
  const musicProvider = useAudioEditorStore((state) => state.musicProvider);
  const lyricsText = useAudioEditorStore((state) => state.sourceLyricsText);
  const currentTimeMs = useAudioEditorStore((state) => state.currentTimeMs);

  if (!trackId || !lyricsText?.trim()) {
    return null;
  }

  return (
    <div className={me.panel}>
      <h3 className={me.panelTitle}>{t("karaokePanelTitle")}</h3>
      <TrackKaraokeSection
        currentTimeSec={currentTimeMs / 1000}
        defaultExpanded={false}
        lyricsText={lyricsText}
        musicProvider={musicProvider}
        trackId={trackId}
      />
    </div>
  );
}
