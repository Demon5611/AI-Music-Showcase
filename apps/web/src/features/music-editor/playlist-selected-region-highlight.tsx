"use client";

import { usePlaylistData } from "@waveform-playlist/browser";
import type { EditorTrackId } from "@ai-music/shared";
import { useEffect, type RefObject } from "react";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import { resolveClipContainersForRegion } from "@/features/music-editor/utils/timeline-clip-dom-utils";

interface PlaylistSelectedRegionHighlightProps {
  selectedRegionId: string | null;
  regionsLayoutKey: string;
  containerRef: RefObject<HTMLElement | null>;
}

function clearSelectedRegionMarkers(container: HTMLElement): void {
  container
    .querySelectorAll("[data-editor-region-selected]")
    .forEach((element) => {
      element.removeAttribute("data-editor-region-selected");
    });
}

function resolveHighlightTrackIds(
  linkedTracks: boolean,
  selectedTrackId: EditorTrackId | null,
  selectedRegionId: string | null,
): EditorTrackId[] | null {
  if (!selectedRegionId) {
    return null;
  }

  if (linkedTracks) {
    return ["vocal", "instrumental"];
  }

  if (selectedTrackId) {
    return [selectedTrackId];
  }

  return ["vocal", "instrumental"];
}

function applySelectedRegionHighlight(
  container: HTMLElement,
  tracks: ReturnType<typeof usePlaylistData>["tracks"],
  selectedRegionId: string | null,
): void {
  clearSelectedRegionMarkers(container);

  if (!selectedRegionId || tracks.length === 0) {
    return;
  }

  const { linkedTracks, selectedTrackId } = useAudioEditorStore.getState();
  const trackIds = resolveHighlightTrackIds(linkedTracks, selectedTrackId, selectedRegionId);
  const clipContainers = resolveClipContainersForRegion(
    container,
    tracks,
    selectedRegionId,
    trackIds,
  );

  clipContainers.forEach((clipContainer) => {
    clipContainer.setAttribute("data-editor-region-selected", "true");
  });
}

export function PlaylistSelectedRegionHighlight({
  selectedRegionId,
  regionsLayoutKey,
  containerRef,
}: PlaylistSelectedRegionHighlightProps) {
  const { tracks } = usePlaylistData();
  const linkedTracks = useAudioEditorStore((state) => state.linkedTracks);
  const selectedTrackId = useAudioEditorStore((state) => state.selectedTrackId);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let rafId: number | null = null;

    const scheduleHighlight = () => {
      if (rafId !== null) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applySelectedRegionHighlight(container, tracks, selectedRegionId);
      });
    };

    scheduleHighlight();

    const observer = new MutationObserver(scheduleHighlight);
    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      clearSelectedRegionMarkers(container);
    };
  }, [
    containerRef,
    linkedTracks,
    regionsLayoutKey,
    selectedRegionId,
    selectedTrackId,
    tracks,
  ]);

  return null;
}
