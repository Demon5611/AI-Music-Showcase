"use client";

import { isTimelineRangeSelection } from "@ai-music/shared";
import {
  usePlaylistControls,
  usePlaylistData,
  usePlaylistState,
} from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import type { EditorTrackId } from "@ai-music/shared";
import { useEffect, useRef, type RefObject } from "react";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import {
  parseTimelineClipId,
  resolvePlaylistTrackForEditorTrack,
  resolveTimelineSelectionMatch,
} from "@/features/music-editor/utils/waveform-playlist-utils";
import {
  resolveClickTimeSec,
  resolveClipIdFromTarget,
} from "@/features/music-editor/utils/timeline-clip-dom-utils";

interface PlaylistRegionBridgeProps {
  selectedRegionId: string | null;
  regionsLayoutKey: string;
  containerRef: RefObject<HTMLElement | null>;
}

const EXPLICIT_SELECTION_GUARD_MS = 400;

function collapseTimeSelection(
  setSelection: (start: number, end: number) => void,
): void {
  const timeSec = useAudioEditorStore.getState().currentTimeMs / 1000;
  setSelection(timeSec, timeSec);
}

function resolveRegionFromTimelineSelection(
  tracks: ClipTrack[],
  sampleRate: number,
  selectionStartSec: number,
  selectionEndSec: number,
  playlistTrackId: string | null,
  preferredRegionId: string | null,
): { regionId: string; trackId: EditorTrackId } | null {
  const match = resolveTimelineSelectionMatch(
    tracks,
    sampleRate,
    selectionStartSec,
    selectionEndSec,
    {
      playlistTrackId,
      preferredRegionId,
    },
  );

  if (!match) {
    return null;
  }

  return {
    regionId: match.regionId,
    trackId: match.trackId,
  };
}

function resolveRegionFromPointer(
  container: HTMLElement,
  tracks: ClipTrack[],
  sampleRate: number,
  samplesPerPixel: number,
  clientX: number,
  clientY: number,
  playlistTrackId: string | null,
): { regionId: string; trackId: EditorTrackId } | null {
  const hitTarget = document.elementFromPoint(clientX, clientY);
  const clipId =
    hitTarget instanceof Element ? resolveClipIdFromTarget(hitTarget) : null;
  const parsedFromHeader = clipId ? parseTimelineClipId(clipId) : null;

  if (parsedFromHeader) {
    return parsedFromHeader;
  }

  const clickTimeSec = resolveClickTimeSec(container, samplesPerPixel, sampleRate, clientX);

  if (clickTimeSec === null) {
    return null;
  }

  const match = resolveTimelineSelectionMatch(tracks, sampleRate, clickTimeSec, clickTimeSec, {
    playlistTrackId,
    preferredRegionId: null,
  });

  if (!match) {
    return null;
  }

  return {
    regionId: match.regionId,
    trackId: match.trackId,
  };
}

export function PlaylistRegionBridge({
  selectedRegionId,
  regionsLayoutKey,
  containerRef,
}: PlaylistRegionBridgeProps) {
  const controls = usePlaylistControls();
  const { tracks, sampleRate, samplesPerPixel } = usePlaylistData();
  const { selectionStart, selectionEnd, selectedTrackId: playlistTrackId } =
    usePlaylistState();
  const controlsRef = useRef(controls);
  const selectTimelineTarget = useAudioEditorStore((state) => state.selectTimelineTarget);
  const selectTimelineTargetRef = useRef(selectTimelineTarget);
  const tracksRef = useRef(tracks);
  const sampleRateRef = useRef(sampleRate);
  const samplesPerPixelRef = useRef(samplesPerPixel);
  const playlistTrackIdRef = useRef(playlistTrackId);
  const selectionStartRef = useRef(selectionStart);
  const selectionEndRef = useRef(selectionEnd);
  const ignorePlaylistSyncUntilRef = useRef(0);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    tracksRef.current = tracks;
    sampleRateRef.current = sampleRate;
    samplesPerPixelRef.current = samplesPerPixel;
    playlistTrackIdRef.current = playlistTrackId;
    selectionStartRef.current = selectionStart;
    selectionEndRef.current = selectionEnd;
  }, [playlistTrackId, sampleRate, samplesPerPixel, selectionEnd, selectionStart, tracks]);

  useEffect(() => {
    selectTimelineTargetRef.current = selectTimelineTarget;
  }, [selectTimelineTarget]);

  useEffect(() => {
    collapseTimeSelection(controlsRef.current.setSelection);
  }, [regionsLayoutKey]);

  useEffect(() => {
    if (selectedRegionId !== null) {
      return;
    }

    collapseTimeSelection(controlsRef.current.setSelection);
  }, [selectedRegionId]);

  function applyTimelineTarget(regionId: string, trackId: EditorTrackId): void {
    const editorState = useAudioEditorStore.getState();

    if (editorState.selectedRegionId === regionId && editorState.selectedTrackId === trackId) {
      return;
    }

    ignorePlaylistSyncUntilRef.current = performance.now() + EXPLICIT_SELECTION_GUARD_MS;
    selectTimelineTargetRef.current(regionId, trackId);
  }

  function syncRegionFromPlaylistSelection(): void {
    if (performance.now() < ignorePlaylistSyncUntilRef.current) {
      return;
    }

    if (!tracksRef.current.length || sampleRateRef.current <= 0) {
      return;
    }

    const selectionStartSec = selectionStartRef.current;
    const selectionEndSec = selectionEndRef.current;
    const isPointSelection = !isTimelineRangeSelection(selectionStartSec, selectionEndSec);
    const editorState = useAudioEditorStore.getState();
    const match = resolveRegionFromTimelineSelection(
      tracksRef.current,
      sampleRateRef.current,
      selectionStartSec,
      selectionEndSec,
      playlistTrackIdRef.current,
      isPointSelection ? null : editorState.selectedRegionId,
    );

    if (!match) {
      return;
    }

    const regionChanged = match.regionId !== editorState.selectedRegionId;
    const trackChanged = match.trackId !== editorState.selectedTrackId;

    if (regionChanged || trackChanged) {
      selectTimelineTargetRef.current(match.regionId, match.trackId);
    }
  }

  useEffect(() => {
    if (!tracks.length || sampleRate <= 0) {
      return;
    }

    syncRegionFromPlaylistSelection();
  }, [playlistTrackId, sampleRate, selectionEnd, selectionStart, tracks]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const timelineContainer = container;

    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-boundary-edge]")) {
        return;
      }

      if (target.closest("[data-stem-id]")) {
        return;
      }

      window.requestAnimationFrame(() => {
        const match = resolveRegionFromPointer(
          timelineContainer,
          tracksRef.current,
          sampleRateRef.current,
          samplesPerPixelRef.current,
          event.clientX,
          event.clientY,
          playlistTrackIdRef.current,
        );

        if (!match) {
          syncRegionFromPlaylistSelection();
          return;
        }

        const playlistTrack = resolvePlaylistTrackForEditorTrack(
          tracksRef.current,
          match.trackId,
        );

        if (playlistTrack) {
          controlsRef.current.setSelectedTrackId(playlistTrack.id);
        }

        applyTimelineTarget(match.regionId, match.trackId);
      });
    }

    container.addEventListener("mousedown", handleMouseDown);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
    };
  }, [containerRef]);

  return null;
}
