"use client";

import { usePlaylistData } from "@waveform-playlist/browser";
import type { SongRegionDto } from "@ai-music/shared";
import { useEffect, type RefObject } from "react";
import { selectRegionLabel } from "@/features/music-editor/store/audio-editor-store";
import { applyClipRegionLabels } from "@/features/music-editor/utils/timeline-clip-dom-utils";

interface PlaylistClipLabelBridgeProps {
  regions: SongRegionDto[];
  regionsLayoutKey: string;
  containerRef: RefObject<HTMLElement | null>;
}

export function PlaylistClipLabelBridge({
  regions,
  regionsLayoutKey,
  containerRef,
}: PlaylistClipLabelBridgeProps) {
  const { tracks } = usePlaylistData();

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const labelByRegionId = new Map(
      regions.map((region) => [region.id, selectRegionLabel(region)]),
    );

    const syncLabels = () => {
      applyClipRegionLabels(container, tracks, labelByRegionId);
    };

    syncLabels();

    const observer = new MutationObserver(syncLabels);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [containerRef, regions, regionsLayoutKey, tracks]);

  return null;
}
