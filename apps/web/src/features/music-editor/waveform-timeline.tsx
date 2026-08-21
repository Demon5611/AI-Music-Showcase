"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ClipInteractionProvider,
  Waveform,
  WaveformPlaylistProvider,
  usePlaybackAnimation,
  usePlaylistControls,
  usePlaylistData,
  usePlaylistState,
} from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import type { EditOperation, EditorTrackId, SongRegionDto } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { useRegionPlaylistTracks } from "@/features/music-editor/hooks/use-region-playlist-tracks";
import { PlaylistClipLabelBridge } from "@/features/music-editor/playlist-clip-label-bridge";
import { PlaylistPlayheadRestoreBridge } from "@/features/music-editor/playlist-playhead-restore-bridge";
import { PlaylistRegionBridge } from "@/features/music-editor/playlist-region-bridge";
import { PlaylistSelectedRegionHighlight } from "@/features/music-editor/playlist-selected-region-highlight";
import { PlaylistTimelineSelectionBridge } from "@/features/music-editor/playlist-timeline-selection-bridge";
import { TransportControls } from "@/features/music-editor/transport-controls";
import {
  useAudioEditorStore,
  type PlaybackController,
} from "@/features/music-editor/store/audio-editor-store";
import {
  AUDIO_CONTEXT_OPTIONS,
  clampTimeToPlaybackLoopBounds,
  computeTimelineLayoutDurationSec,
  dbToGain,
  buildPendingTimelineOperationKey,
  mirrorRegionClipEdits,
  resolvePlaybackLoopBounds,
  resolvePlaylistTrackForEditorTrack,
  resolveTimelineOperation,
  resolveTimelineZoomSettings,
  PLAYBACK_LOOP_WRAP_EPSILON_SEC,
  FIT_ZOOM_BASE,
  PLAYLIST_TRACK_CONTROL_WIDTH,
  TRACK_WAVE_HEIGHT,
  type PendingTimelineOperation,
  type TimelineStemSource,
} from "@/features/music-editor/utils/waveform-playlist-utils";
import { me } from "@/features/music-editor/music-editor-classes";
import playlistStyles from "@/features/music-editor/styles/music-editor-playlist.module.css";
import { cn } from "@/lib/utils";

interface WaveformTimelineProps {
  regions: SongRegionDto[];
  operations: EditOperation[];
  selectedRegionId: string | null;
  vocalPlaybackUrl: string | null;
  instrumentalPlaybackUrl: string | null;
  onSelectRegion: (regionId: string) => void;
  onResizeRegion: (regionId: string, startMs: number, endMs: number) => void;
  onMoveRegion: (regionId: string, targetIndex: number) => void;
  onResizeTrackRegion: (
    trackId: EditorTrackId,
    regionId: string,
    startMs: number,
    endMs: number,
  ) => void;
  onMoveTrackRegion: (trackId: EditorTrackId, regionId: string, targetIndex: number) => void;
  disabled?: boolean;
  lockedAdvancedOps?: boolean;
}

const TRACK_COLORS: Record<EditorTrackId, string> = {
  vocal: "#93c5fd",
  instrumental: "#86efac",
};

const PLAYLIST_TRACK_LABEL_CLASS: Record<EditorTrackId, string> = {
  vocal: me.playlistTrackLabelVocal,
  instrumental: me.playlistTrackLabelInstrumental,
};

const PLAYLIST_PROVIDER_THEME = {
  surfaceColor: "transparent",
  selectedTrackControlsBackground: "transparent",
} as const;

const PERSIST_DEBOUNCE_MS = 450;

function PlaylistTimelineZoomBridge({ providerKey }: { providerKey: string }) {
  const controls = usePlaylistControls();
  const { isReady } = usePlaylistData();
  const zoom = useAudioEditorStore((state) => state.zoom);
  const lastProviderKeyRef = useRef(providerKey);
  const lastAppliedZoomRef = useRef(FIT_ZOOM_BASE);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (lastProviderKeyRef.current !== providerKey) {
      lastProviderKeyRef.current = providerKey;
      lastAppliedZoomRef.current = FIT_ZOOM_BASE;
    }

    const deltaSteps = Math.round((zoom - lastAppliedZoomRef.current) / 10);

    if (deltaSteps > 0) {
      for (let step = 0; step < deltaSteps; step += 1) {
        controls.zoomIn();
      }
    } else if (deltaSteps < 0) {
      for (let step = 0; step < Math.abs(deltaSteps); step += 1) {
        controls.zoomOut();
      }
    }

    lastAppliedZoomRef.current = zoom;
  }, [controls, isReady, providerKey, zoom]);

  return null;
}

function PlaylistTrackStateBridge({ sources }: { sources: TimelineStemSource[] }) {
  const controls = usePlaylistControls();
  const { isReady, tracks } = usePlaylistData();
  const controlsRef = useRef(controls);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    if (!isReady || tracks.length === 0) {
      return;
    }

    sources.forEach((source, index) => {
      if (!tracks[index]) {
        return;
      }

      controlsRef.current.setTrackMute(index, false);
      controlsRef.current.setTrackSolo(index, false);
      controlsRef.current.setTrackVolume(index, dbToGain(0));
    });
  }, [isReady, sources, tracks]);

  return null;
}

function PlaylistTransportBridge() {
  const controls = usePlaylistControls();
  const data = usePlaylistData();
  const playback = usePlaybackAnimation();
  const controlsRef = useRef(controls);
  const playbackRef = useRef(playback);
  const tracksRef = useRef(data.tracks);
  const sampleRateRef = useRef(data.sampleRate);
  const setCurrentTime = useAudioEditorStore((state) => state.setCurrentTime);
  const setDuration = useAudioEditorStore((state) => state.setDuration);
  const setIsPlaying = useAudioEditorStore((state) => state.setIsPlaying);
  const setPlaybackController = useAudioEditorStore((state) => state.setPlaybackController);

  useEffect(() => {
    controlsRef.current = controls;
    playbackRef.current = playback;
  }, [controls, playback]);

  useEffect(() => {
    tracksRef.current = data.tracks;
    sampleRateRef.current = data.sampleRate;
  }, [data.sampleRate, data.tracks]);

  useEffect(() => {
    const layoutDurationSec = computeTimelineLayoutDurationSec(data.tracks);
    const durationSec = layoutDurationSec > 0 ? layoutDurationSec : data.duration;
    setDuration(Math.round(durationSec * 1000));
  }, [data.duration, data.tracks, setDuration]);

  useEffect(() => {
    playback.registerFrameCallback("music-editor-playlist", ({ time }) => {
      const editorState = useAudioEditorStore.getState();
      const loopBounds = resolvePlaybackLoopBounds({
        loopSelected: editorState.loopSelected,
        selectedRegionId: editorState.selectedRegionId,
        selectedTrackId: editorState.selectedTrackId,
        linkedTracks: editorState.linkedTracks,
        timelineSelectionSec: editorState.timelineSelectionSec,
        tracks: tracksRef.current,
        sampleRate: sampleRateRef.current,
      });

      if (
        editorState.isPlaying &&
        loopBounds &&
        time >= loopBounds.endSec - PLAYBACK_LOOP_WRAP_EPSILON_SEC
      ) {
        controlsRef.current.seekTo(loopBounds.startSec);
        controlsRef.current.setCurrentTime(loopBounds.startSec);
        setCurrentTime(Math.round(loopBounds.startSec * 1000));
        return;
      }

      setCurrentTime(Math.round(time * 1000));
    });

    return () => {
      playback.unregisterFrameCallback("music-editor-playlist");
    };
  }, [playback, setCurrentTime]);

  useEffect(() => {
    if (useAudioEditorStore.getState().isPlaying) {
      return;
    }

    const playbackMs = Math.round(playback.currentTime * 1000);
    const storeMs = useAudioEditorStore.getState().currentTimeMs;

    if (playbackMs === 0 && storeMs > 0) {
      return;
    }

    setCurrentTime(playbackMs);
  }, [playback.currentTime, setCurrentTime]);

  useEffect(() => {
    if (!data.isReady) {
      return;
    }

    const controller: PlaybackController = {
      play: () => {
        const editorState = useAudioEditorStore.getState();
        const fallbackStartSec = editorState.currentTimeMs / 1000;
        const playbackStartSec = playbackRef.current.currentTimeRef.current;
        let startSec = Number.isFinite(playbackStartSec) ? playbackStartSec : fallbackStartSec;
        const loopBounds = resolvePlaybackLoopBounds({
          loopSelected: editorState.loopSelected,
          selectedRegionId: editorState.selectedRegionId,
          selectedTrackId: editorState.selectedTrackId,
          linkedTracks: editorState.linkedTracks,
          timelineSelectionSec: editorState.timelineSelectionSec,
          tracks: tracksRef.current,
          sampleRate: sampleRateRef.current,
        });

        if (loopBounds) {
          startSec = clampTimeToPlaybackLoopBounds(startSec, loopBounds);
        }

        controlsRef.current.setCurrentTime(startSec);
        setCurrentTime(Math.round(startSec * 1000));
        void controlsRef.current.play(startSec).then(() => setIsPlaying(true));
      },
      pause: () => {
        controlsRef.current.pause();
        setIsPlaying(false);
      },
      stop: () => {
        controlsRef.current.stop();
        controlsRef.current.setCurrentTime(0);
        setCurrentTime(0);
        setIsPlaying(false);
      },
      seek: (ms) => {
        const timeSec = ms / 1000;
        controlsRef.current.seekTo(timeSec);
        controlsRef.current.setCurrentTime(timeSec);
        setCurrentTime(ms);
      },
      setZoom: () => undefined,
    };

    setPlaybackController(controller);

    return () => {
      setPlaybackController(null);
      setIsPlaying(false);
    };
  }, [data.isReady, setCurrentTime, setIsPlaying, setPlaybackController]);

  return null;
}

function PlaylistActiveTrackBridge({ sources }: { sources: TimelineStemSource[] }) {
  const controls = usePlaylistControls();
  const { tracks, isReady } = usePlaylistData();
  const { selectedTrackId: playlistTrackId } = usePlaylistState();
  const selectedTrackId = useAudioEditorStore((state) => state.selectedTrackId);
  const trackSelectionSource = useAudioEditorStore((state) => state.trackSelectionSource);
  const linkedTracks = useAudioEditorStore((state) => state.linkedTracks);

  useEffect(() => {
    if (!isReady || linkedTracks || trackSelectionSource !== "panel" || !selectedTrackId) {
      return;
    }

    const playlistTrack = resolvePlaylistTrackForEditorTrack(tracks, selectedTrackId, sources);

    if (!playlistTrack || playlistTrack.id === playlistTrackId) {
      return;
    }

    controls.setSelectedTrackId(playlistTrack.id);
  }, [
    controls,
    isReady,
    linkedTracks,
    playlistTrackId,
    selectedTrackId,
    sources,
    trackSelectionSource,
    tracks,
  ]);

  return null;
}

export function WaveformTimeline({
  regions,
  operations,
  selectedRegionId,
  vocalPlaybackUrl,
  instrumentalPlaybackUrl,
  onSelectRegion,
  onResizeRegion,
  onMoveRegion,
  onResizeTrackRegion,
  onMoveTrackRegion,
  disabled,
  lockedAdvancedOps = false,
}: WaveformTimelineProps) {
  const tTracks = useTranslations("Editor.tracks");
  const tTimeline = useTranslations("Editor.timeline");
  const linkedTracks = useAudioEditorStore((state) => state.linkedTracks);
  const setLinkedTracks = useAudioEditorStore((state) => state.setLinkedTracks);
  const previewTracks = useAudioEditorStore((state) => state.previewTracks);
  const mixPreview = useMemo(
    () => ({
      selectedRegionId,
      previewTracks,
    }),
    [previewTracks, selectedRegionId],
  );
  const sources = useMemo<TimelineStemSource[]>(() => {
    const nextSources: TimelineStemSource[] = [];

    if (vocalPlaybackUrl) {
      nextSources.push({
        id: "vocal",
        label: tTracks("vocal"),
        url: vocalPlaybackUrl,
        color: TRACK_COLORS.vocal,
      });
    }

    if (instrumentalPlaybackUrl) {
      nextSources.push({
        id: "instrumental",
        label: tTracks("instrumental"),
        url: instrumentalPlaybackUrl,
        color: TRACK_COLORS.instrumental,
      });
    }

    return nextSources;
  }, [instrumentalPlaybackUrl, tTracks, vocalPlaybackUrl]);
  const { tracks, isLoading, error } = useRegionPlaylistTracks(
    sources,
    regions,
    operations,
    mixPreview,
  );
  const regionsLayoutKey = useMemo(() => regions.map((region) => region.id).join("|"), [regions]);
  const preservedPlayheadMsRef = useRef(0);
  const [playlistTracks, setPlaylistTracks] = useState<ClipTrack[]>(tracks);
  const [isStructuralSync, setIsStructuralSync] = useState(false);
  const [timelineViewportWidthPx, setTimelineViewportWidthPx] = useState(0);
  const [stableTimelineWidthPx, setStableTimelineWidthPx] = useState(0);
  const [lastStableTimelineWidthPx, setLastStableTimelineWidthPx] = useState(0);
  const [timelineInitialized, setTimelineInitialized] = useState(false);
  const playlistShellRef = useRef<HTMLDivElement>(null);
  const pendingOperationRef = useRef<PendingTimelineOperation | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const suppressTracksChangeRef = useRef(false);
  const lastPersistedOperationKeyRef = useRef<string | null>(null);
  const providerTracks = isStructuralSync ? tracks : playlistTracks;

  const effectiveTimelineWidthPx =
    stableTimelineWidthPx > 0 ? stableTimelineWidthPx : lastStableTimelineWidthPx;
  const canMountTimeline = providerTracks.length > 0 && effectiveTimelineWidthPx > 0;

  const timelineReady = providerTracks.length > 0 && (canMountTimeline || timelineInitialized);
  const fitTimelineZoom = useMemo(
    () => resolveTimelineZoomSettings(providerTracks, effectiveTimelineWidthPx, FIT_ZOOM_BASE),
    [effectiveTimelineWidthPx, providerTracks],
  );
  const timelineProviderKey = `${regionsLayoutKey}:${fitTimelineZoom.samplesPerPixel}:${effectiveTimelineWidthPx}`;
  const isInitialTrackLoad = isLoading && providerTracks.length === 0;
  const transportDisabled = disabled || providerTracks.length === 0 || isInitialTrackLoad;

  const renderTrackControls = useCallback(
    (trackIndex: number) => {
      const source = sources[trackIndex];

      if (!source) {
        return null;
      }

      return (
        <div
          className={cn(me.playlistTrackLabel, PLAYLIST_TRACK_LABEL_CLASS[source.id])}
          data-stem-id={source.id}
          title={source.label}
        >
          {source.label}
        </div>
      );
    },
    [sources],
  );

  useLayoutEffect(() => {
    return () => {
      preservedPlayheadMsRef.current = useAudioEditorStore.getState().currentTimeMs;
    };
  }, [operations, regions]);

  useEffect(() => {
    setIsStructuralSync(true);
    pendingOperationRef.current = null;
    lastPersistedOperationKeyRef.current = null;

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, [regionsLayoutKey]);

  useEffect(() => {
    setPlaylistTracks(tracks);

    if (tracks.length === 0) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setIsStructuralSync(false);
    }, 400);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [tracks]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timelineViewportWidthPx <= 0) {
      setStableTimelineWidthPx(0);
      return;
    }

    const timerId = window.setTimeout(() => {
      setStableTimelineWidthPx(timelineViewportWidthPx);
      setLastStableTimelineWidthPx(timelineViewportWidthPx);
      setTimelineInitialized(true);
    }, 120);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [timelineViewportWidthPx]);

  useEffect(() => {
    const shell = playlistShellRef.current;

    if (!shell) {
      return;
    }

    const updateWidth = (): void => {
      setTimelineViewportWidthPx(shell.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(shell);

    return () => {
      observer.disconnect();
    };
  }, [tracks.length]);

  const persistTimelineOperation = useCallback(() => {
    const operation = pendingOperationRef.current;
    pendingOperationRef.current = null;

    if (!operation || disabled) {
      return;
    }

    if (operation.type === "resize" && lockedAdvancedOps) {
      suppressTracksChangeRef.current = true;
      setPlaylistTracks(tracks);
      return;
    }

    const operationKey = buildPendingTimelineOperationKey(operation);
    lastPersistedOperationKeyRef.current = operationKey;

    if (operation.type === "resize") {
      if ("trackId" in operation) {
        onResizeTrackRegion(
          operation.trackId,
          operation.regionId,
          operation.startMs,
          operation.endMs,
        );
      } else {
        onResizeRegion(operation.regionId, operation.startMs, operation.endMs);
      }
      return;
    }

    if ("trackId" in operation) {
      onMoveTrackRegion(operation.trackId, operation.regionId, operation.targetIndex);
      return;
    }

    onMoveRegion(operation.regionId, operation.targetIndex);
  }, [
    disabled,
    lockedAdvancedOps,
    onMoveRegion,
    onMoveTrackRegion,
    onResizeRegion,
    onResizeTrackRegion,
    tracks,
  ]);

  const handleTracksChange = useCallback(
    (nextTracks: ClipTrack[]) => {
      if (isStructuralSync) {
        return;
      }

      if (suppressTracksChangeRef.current) {
        suppressTracksChangeRef.current = false;
        return;
      }

      const nextPlaylistTracks = linkedTracks ? mirrorRegionClipEdits(nextTracks) : nextTracks;

      suppressTracksChangeRef.current = true;
      setPlaylistTracks(nextPlaylistTracks);

      const operation = resolveTimelineOperation(
        nextPlaylistTracks,
        regions,
        operations,
        linkedTracks,
      );

      if (!operation || disabled) {
        return;
      }

      if (operation.type === "resize" && lockedAdvancedOps) {
        suppressTracksChangeRef.current = true;
        setPlaylistTracks(tracks);
        return;
      }

      const operationKey = buildPendingTimelineOperationKey(operation);

      if (operationKey === lastPersistedOperationKeyRef.current) {
        return;
      }

      pendingOperationRef.current = operation;

      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }

      persistTimerRef.current = window.setTimeout(persistTimelineOperation, PERSIST_DEBOUNCE_MS);
    },
    [disabled, isStructuralSync, linkedTracks, lockedAdvancedOps, operations, persistTimelineOperation, regions, tracks],
  );

  return (
    <div className={me.timelineBlock} id="editor-timeline">
      <div className={me.timelineHeader}>
        <div className={me.timelineTitleRow}>
          <p className={me.blockLabel}>{tTimeline("title")}</p>
          <button
            className={linkedTracks ? me.timelineModeButtonActive : me.timelineModeButton}
            disabled={transportDisabled}
            type="button"
            onClick={() => setLinkedTracks(!linkedTracks)}
          >
            {linkedTracks ? tTimeline("linked") : tTimeline("independent")}
          </button>
        </div>
        <TransportControls disabled={transportDisabled} />
      </div>

      {error ? <p className={me.error}>{error}</p> : null}
      {isInitialTrackLoad ? (
        <p className={me.panelHint}>{tTimeline("loadingWaveform")}</p>
      ) : null}

      {providerTracks.length > 0 || isInitialTrackLoad ? (
        <div className={cn(me.playlistShell, playlistStyles.shell)} ref={playlistShellRef}>
          {!canMountTimeline && timelineReady ? (
            <p className={me.playlistShellHint}>{tTimeline("preparingTimeline")}</p>
          ) : null}
          {timelineReady ? (
            <WaveformPlaylistProvider
              key={timelineProviderKey}
              automaticScroll
              controls={{ show: true, width: PLAYLIST_TRACK_CONTROL_WIDTH }}
              mono
              sampleRate={AUDIO_CONTEXT_OPTIONS.sampleRate}
              samplesPerPixel={fitTimelineZoom.samplesPerPixel}
              theme={PLAYLIST_PROVIDER_THEME}
              zoomLevels={fitTimelineZoom.zoomLevels}
              timescale
              tracks={providerTracks}
              waveHeight={TRACK_WAVE_HEIGHT}
              onTracksChange={handleTracksChange}
            >
              <PlaylistTimelineZoomBridge providerKey={timelineProviderKey} />
              <PlaylistPlayheadRestoreBridge
                preservedPlayheadMsRef={preservedPlayheadMsRef}
                providerKey={timelineProviderKey}
              />
              <PlaylistTransportBridge />
              <PlaylistTimelineSelectionBridge />
              <PlaylistTrackStateBridge sources={sources} />
              <PlaylistActiveTrackBridge sources={sources} />
              <PlaylistSelectedRegionHighlight
                containerRef={playlistShellRef}
                regionsLayoutKey={regionsLayoutKey}
                selectedRegionId={selectedRegionId}
              />
              <PlaylistClipLabelBridge
                containerRef={playlistShellRef}
                regions={regions}
                regionsLayoutKey={regionsLayoutKey}
              />
              <PlaylistRegionBridge
                containerRef={playlistShellRef}
                regionsLayoutKey={regionsLayoutKey}
                selectedRegionId={selectedRegionId}
              />
              <ClipInteractionProvider touchOptimized>
                <Waveform
                  interactiveClips
                  renderTrackControls={renderTrackControls}
                  showClipHeaders
                  touchOptimized
                />
              </ClipInteractionProvider>
            </WaveformPlaylistProvider>
          ) : null}
        </div>
      ) : null}

      <p className={me.timelineHint}>
        {linkedTracks ? tTimeline("linkedHint") : tTimeline("independentHint")}{" "}
        {tTimeline("actionsHint")}
      </p>
    </div>
  );
}
