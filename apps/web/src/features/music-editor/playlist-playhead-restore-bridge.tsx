"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePlaylistControls, usePlaylistData } from "@waveform-playlist/browser";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";

interface PlaylistPlayheadRestoreBridgeProps {
  providerKey: string;
  preservedPlayheadMsRef: RefObject<number>;
}

export function PlaylistPlayheadRestoreBridge({
  providerKey,
  preservedPlayheadMsRef,
}: PlaylistPlayheadRestoreBridgeProps) {
  const controls = usePlaylistControls();
  const { isReady } = usePlaylistData();
  const controlsRef = useRef(controls);
  const restoredProviderKeyRef = useRef<string | null>(null);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (restoredProviderKeyRef.current === providerKey) {
      return;
    }

    restoredProviderKeyRef.current = providerKey;

    const preservedMs =
      preservedPlayheadMsRef.current > 0
        ? preservedPlayheadMsRef.current
        : useAudioEditorStore.getState().currentTimeMs;

    if (preservedMs <= 0) {
      return;
    }

    const timeSec = preservedMs / 1000;
    controlsRef.current.seekTo(timeSec);
    controlsRef.current.setCurrentTime(timeSec);
    useAudioEditorStore.getState().setCurrentTime(preservedMs);
  }, [isReady, preservedPlayheadMsRef, providerKey]);

  return null;
}
