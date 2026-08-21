"use client";

import { isTimelineRangeSelection } from "@ai-music/shared";
import { usePlaylistData, usePlaylistState } from "@waveform-playlist/browser";
import { useEffect } from "react";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import { resolveTimelineSelectionMatch } from "@/features/music-editor/utils/waveform-playlist-utils";

export function PlaylistTimelineSelectionBridge() {
  const { selectionStart, selectionEnd, selectedTrackId: playlistTrackId } =
    usePlaylistState();
  const { tracks, sampleRate } = usePlaylistData();
  const setTimelineSelection = useAudioEditorStore(
    (state) => state.setTimelineSelection,
  );

  useEffect(() => {
    if (!isTimelineRangeSelection(selectionStart, selectionEnd)) {
      setTimelineSelection(null);
      return;
    }

    const startSec = Math.min(selectionStart, selectionEnd);
    const endSec = Math.max(selectionStart, selectionEnd);
    const canResolveClipLayout = tracks.length > 0 && sampleRate > 0;
    const match = canResolveClipLayout
      ? resolveTimelineSelectionMatch(
          tracks,
          sampleRate,
          selectionStart,
          selectionEnd,
          {
            playlistTrackId,
            preferredRegionId: null,
          },
        )
      : null;

    setTimelineSelection({
      sec: { startSec, endSec },
      context: match
        ? {
            regionId: match.regionId,
            layoutStartSec: match.layoutStartSec,
            layoutEndSec: match.layoutEndSec,
          }
        : null,
    });
  }, [
    playlistTrackId,
    sampleRate,
    selectionEnd,
    selectionStart,
    setTimelineSelection,
    tracks,
  ]);

  return null;
}
