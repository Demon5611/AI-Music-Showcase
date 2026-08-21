"use client";

import { parseApiError } from "@/shared/lib/parse-api-error";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useInvalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { EditorStemNotice } from "@/features/music-editor/editor-stem-notice";
import { EditorStemSeparationPanel } from "@/features/music-editor/editor-stem-separation-panel";
import { EditHistoryPanel } from "@/features/music-editor/edit-history-panel";
import { EditorAiRemixPanel } from "@/features/music-editor/editor-ai-remix-panel";
import { EditorKaraokePanel } from "@/features/music-editor/editor-karaoke-panel";
import { EditorHelpPanel } from "@/features/music-editor/editor-help-panel";
import { EditorHeader } from "@/features/music-editor/editor-header";
import { useEditorOperations } from "@/features/music-editor/hooks/use-editor-operations";
import { useEditorPolling } from "@/features/music-editor/hooks/use-editor-polling";
import { VoicePresetPanel } from "@/features/music-editor/voice-preset-panel";
import { VoicePresetDemo } from "@/features/music-editor/voice-preset-demo";
import { RegionToolbar } from "@/features/music-editor/region-toolbar";
import { RenderButton } from "@/features/music-editor/render-button";
import { SelectedContextPanel } from "@/features/music-editor/selected-context-panel";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import { TrackLane } from "@/features/music-editor/track-lane";
import { clearCachedEditorState } from "@/features/music-editor/utils/editor-session-cache";
import { me } from "@/features/music-editor/music-editor-classes";
import { cn } from "@/lib/utils";
import { useClientMounted } from "@/shared/hooks/use-client-mounted";
import { useApi } from "@/shared/providers/api-provider";
import {
  HintsVisibilityProvider,
  useHintsVisibility,
} from "@/shared/providers/hints-visibility-provider";
import { AuthenticatedBlobUrl } from "@/shared/ui/authenticated-blob-url";
import { RequireAuth } from "@/shared/ui/require-auth";
import { useEditorRegionShortcuts } from "./hooks/use-editor-region-shortcuts";
import { useEditorTransportShortcuts } from "./hooks/use-editor-transport-shortcuts";
import { useEditorInitialLoad } from "./hooks/use-editor-initial-load";
import { useEditorVolumeShortcuts } from "./hooks/use-editor-volume-shortcuts";

function TimelineLoadingHint() {
  const t = useTranslations("Editor.preparation");
  return <p className={me.panelHint}>{t("loadingTimeline")}</p>;
}

const WaveformTimeline = dynamic(
  () =>
    import("@/features/music-editor/waveform-timeline").then((module) => module.WaveformTimeline),
  {
    ssr: false,
    loading: () => <TimelineLoadingHint />,
  },
);

function DeferredWaveformTimeline(props: ComponentProps<typeof WaveformTimeline>) {
  const mounted = useClientMounted();

  if (!mounted) {
    return <TimelineLoadingHint />;
  }

  return <WaveformTimeline {...props} />;
}

interface AudioEditorProps {
  songId: string;
}

interface PlaybackUrls {
  vocal: string | null;
  instrumental: string | null;
}

const EDITOR_PREPARATION_ESTIMATE_SEC = 60;

function formatElapsedTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function useElapsedSeconds(): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  return elapsedSeconds;
}

function resolvePreparationProgress(elapsedSeconds: number): number {
  if (elapsedSeconds <= EDITOR_PREPARATION_ESTIMATE_SEC) {
    return Math.round((elapsedSeconds / EDITOR_PREPARATION_ESTIMATE_SEC) * 90);
  }

  const overtimeSeconds = elapsedSeconds - EDITOR_PREPARATION_ESTIMATE_SEC;
  return Math.min(99, 90 + Math.floor(overtimeSeconds / 20));
}

function EditorPreparationStatus({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  const t = useTranslations("Editor.preparation");
  const mounted = useClientMounted();
  const elapsedSeconds = useElapsedSeconds();
  const progress = resolvePreparationProgress(elapsedSeconds);
  const elapsedLabel = formatElapsedTime(elapsedSeconds);
  const estimateLabel = formatElapsedTime(EDITOR_PREPARATION_ESTIMATE_SEC);
  const isOvertime = elapsedSeconds > EDITOR_PREPARATION_ESTIMATE_SEC;
  const rootClassName = compact ? me.preparationStatusCompact : me.preparationStatus;

  return (
    <div className={rootClassName}>
      <div className={me.preparationHeader}>
        <span className={me.preparationSpinner} aria-hidden="true" />
        <div>
          <p className={me.preparationTitle}>{message}</p>
          <p className={me.preparationMeta}>
            {mounted
              ? isOvertime
                ? t("elapsedOvertime", { elapsed: elapsedLabel, estimate: estimateLabel })
                : t("elapsed", { elapsed: elapsedLabel, estimate: estimateLabel })
              : t("mayTakeMinute")}
          </p>
        </div>
      </div>

      <div className={me.preparationProgressRow}>
        <progress
          aria-label={t("progressAria")}
          className={me.preparationProgress}
          max={100}
          value={mounted ? progress : 0}
        />
        <span className={me.preparationProgressValue}>{mounted ? `${progress}%` : "0%"}</span>
      </div>
    </div>
  );
}

function PlaybackUrlBridge({
  vocalPlaybackUrl,
  instrumentalPlaybackUrl,
  onChange,
}: {
  vocalPlaybackUrl: string | null;
  instrumentalPlaybackUrl: string | null;
  onChange: (urls: PlaybackUrls) => void;
}) {
  const lastUrlsRef = useRef<PlaybackUrls>({
    vocal: null,
    instrumental: null,
  });

  useEffect(() => {
    const nextUrls: PlaybackUrls = {
      vocal: vocalPlaybackUrl ?? lastUrlsRef.current.vocal,
      instrumental: instrumentalPlaybackUrl ?? lastUrlsRef.current.instrumental,
    };

    lastUrlsRef.current = nextUrls;
    onChange(nextUrls);
  }, [instrumentalPlaybackUrl, onChange, vocalPlaybackUrl]);

  return null;
}

export function AudioEditor({ songId }: AudioEditorProps) {
  const t = useTranslations("Editor.auth");

  return (
    <RequireAuth hint={t("hint")} title={t("title")}>
      <HintsVisibilityProvider>
        <AudioEditorContent songId={songId} />
      </HintsVisibilityProvider>
    </RequireAuth>
  );
}

function AudioEditorContent({ songId }: AudioEditorProps) {
  const t = useTranslations("Editor");
  const tPrep = useTranslations("Editor.preparation");
  const tTracks = useTranslations("Editor.tracks");
  const tErrors = useTranslations("Errors");
  const api = useApi();
  const invalidateCreditsBalance = useInvalidateCreditsBalance();
  const subscriptionQuery = useSubscriptionQuery();
  const editorLevel = subscriptionQuery.data?.entitlements.features.editor ?? false;
  const lockedAdvancedOps = editorLevel === "lite";
  const { hintsVisible } = useHintsVisibility();
  const hydrate = useAudioEditorStore((state) => state.hydrate);
  const setError = useAudioEditorStore((state) => state.setError);
  const regions = useAudioEditorStore((state) => state.regions);
  const tracks = useAudioEditorStore((state) => state.tracks);
  const operations = useAudioEditorStore((state) => state.operations);
  const versions = useAudioEditorStore((state) => state.versions);
  const songStatus = useAudioEditorStore((state) => state.songStatus);
  const sourceTrackId = useAudioEditorStore((state) => state.sourceTrackId);
  const sourceLyricsText = useAudioEditorStore((state) => state.sourceLyricsText);
  const musicProvider = useAudioEditorStore((state) => state.musicProvider);
  const editorNotice = useAudioEditorStore((state) => state.editorNotice);
  const stemsReady = useAudioEditorStore((state) => state.stemsReady);
  const stemSeparationPhase = useAudioEditorStore((state) => state.stemSeparationPhase);
  const stemSeparationAvailable = useAudioEditorStore(
    (state) => state.stemSeparationAvailable,
  );
  const stemSeparationCostCredits = useAudioEditorStore(
    (state) => state.stemSeparationCostCredits,
  );
  const masterAudioUrl = useAudioEditorStore((state) => state.masterAudioUrl);
  const selectedRegionId = useAudioEditorStore((state) => state.selectedRegionId);
  const setSelectedRegion = useAudioEditorStore((state) => state.setSelectedRegion);
  const isBusy = useAudioEditorStore((state) => state.isBusy);
  const error = useAudioEditorStore((state) => state.error);

  const {
    setVolume,
    adjustVolume,
    muteTrack,
    splitRegion,
    duplicateRegion,
    fadeRegion,
    moveRegion,
    moveRegionToIndex,
    moveTrackRegionToIndex,
    deleteRegion,
    resizeRegion,
    resizeTrackRegion,
    undo,
    redo,
    applyVoicePreset,
  } = useEditorOperations();

  const { isProcessing } = useEditorPolling(songId);
  const { title } = useEditorInitialLoad(songId);
  const [isRendering, setIsRendering] = useState(false);
  const [isRetryingStems, setIsRetryingStems] = useState(false);
  const [isStartingStemSeparation, setIsStartingStemSeparation] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [playbackUrls, setPlaybackUrls] = useState<PlaybackUrls>({
    vocal: null,
    instrumental: null,
  });

  async function handleRetryStemSeparation() {
    setIsRetryingStems(true);
    setError(null);
    clearCachedEditorState(songId);

    try {
      const state = await api.musicEditor.retryStemSeparation(songId);
      hydrate(state);
      void invalidateCreditsBalance();
    } catch (retryError) {
      const message = parseApiError(retryError, tErrors("editorStemRetryFailed"), {
        preferFallback: true,
      });
      setError(message);
    } finally {
      setIsRetryingStems(false);
    }
  }

  async function handleSeparateStems() {
    if (isStartingStemSeparation || isRetryingStems) {
      return;
    }

    setIsStartingStemSeparation(true);
    setError(null);
    clearCachedEditorState(songId);

    try {
      const state = await api.musicEditor.separateStems(songId);
      hydrate(state);
      void invalidateCreditsBalance();
    } catch (separateError) {
      const message = parseApiError(separateError, tErrors("editorStemRetryFailed"), {
        preferFallback: true,
      });
      setError(message);
    } finally {
      setIsStartingStemSeparation(false);
    }
  }

  async function handleRender() {
    setIsRendering(true);
    setError(null);
    setRenderError(null);

    try {
      await api.musicEditor.render(songId);
      const state = await api.musicEditor.getEditorState(songId);
      hydrate(state);
    } catch (renderError) {
      const message = parseApiError(renderError, tErrors("editorRenderFailed"), {
        preferFallback: true,
      });
      setRenderError(message);
      setError(message);
    } finally {
      setIsRendering(false);
    }
  }

  const vocalTrack = tracks.find((track) => track.id === "vocal");
  const instrumentalTrack = tracks.find((track) => track.id === "instrumental");

  const editorReady = songStatus === "ready" && !isProcessing;
  const controlsDisabled = isBusy || !editorReady;
  const trackControlsDisabled = controlsDisabled;
  const trackMixControlsDisabled = !editorReady;
  const muteUnavailable = stemSeparationPhase === "unavailable";
  useEditorTransportShortcuts(controlsDisabled);
  useEditorVolumeShortcuts(controlsDisabled || trackMixControlsDisabled, adjustVolume);
  useEditorRegionShortcuts(controlsDisabled || lockedAdvancedOps, deleteRegion);

  const statusMessage = (() => {
    if (songStatus === "separating_stems") {
      return tPrep("separating");
    }

    return tPrep("preparing");
  })();

  return (
    <section className={cn(me.section, !hintsVisible && me.sectionHintsHidden)}>
      <EditorHeader title={title || t("titleFallback")} />

      <EditorHelpPanel />

      {!editorReady ? (
        <div className={me.statusCard}>
          <EditorPreparationStatus key={statusMessage} message={statusMessage} />
        </div>
      ) : null}

      {editorReady ? (
        <EditorStemSeparationPanel
          available={stemSeparationAvailable}
          costCredits={stemSeparationCostCredits}
          disabled={controlsDisabled}
          isStarting={isStartingStemSeparation}
          masterMissing={!masterAudioUrl}
          phase={stemSeparationPhase}
          onSeparate={() => void handleSeparateStems()}
        />
      ) : null}

      {editorReady && editorNotice ? (
        <EditorStemNotice
          disabled={controlsDisabled}
          isRetrying={isRetryingStems}
          notice={editorNotice}
          onRetry={() => void handleRetryStemSeparation()}
        />
      ) : null}

      <AuthenticatedBlobUrl src={vocalTrack?.audioUrl ?? null}>
        {(vocalPlaybackUrl) => (
          <AuthenticatedBlobUrl src={instrumentalTrack?.audioUrl ?? null}>
            {(instrumentalPlaybackUrl) => (
              <PlaybackUrlBridge
                instrumentalPlaybackUrl={instrumentalPlaybackUrl}
                vocalPlaybackUrl={vocalPlaybackUrl}
                onChange={setPlaybackUrls}
              />
            )}
          </AuthenticatedBlobUrl>
        )}
      </AuthenticatedBlobUrl>

      <DeferredWaveformTimeline
        disabled={controlsDisabled}
        instrumentalPlaybackUrl={playbackUrls.instrumental}
        lockedAdvancedOps={lockedAdvancedOps}
        onMoveRegion={moveRegionToIndex}
        onMoveTrackRegion={moveTrackRegionToIndex}
        onResizeRegion={resizeRegion}
        onResizeTrackRegion={resizeTrackRegion}
        operations={operations}
        regions={regions}
        selectedRegionId={selectedRegionId}
        vocalPlaybackUrl={playbackUrls.vocal}
        onSelectRegion={setSelectedRegion}
      />

      <div className={me.layout}>
        <div className={me.mainColumn}>
          <div className={me.panel}>
            <h3 className={me.panelTitle}>{tTracks("panelTitle")}</h3>
            {muteUnavailable ? (
              <p className={me.tracksMuteUnavailableHint} role="status">
                {tTracks("muteUnavailableHint")}
              </p>
            ) : null}
            {stemSeparationPhase === "processing" ? (
              <EditorPreparationStatus compact key={statusMessage} message={statusMessage} />
            ) : null}
            <div className={me.trackList}>
              {tracks.map((track) => (
                <TrackLane
                  key={track.id}
                  disabled={trackControlsDisabled}
                  mixControlsDisabled={trackMixControlsDisabled}
                  muteUnavailable={muteUnavailable}
                  regionSelected={Boolean(selectedRegionId)}
                  track={track}
                  onMuteToggle={muteTrack}
                  onVolumeCommit={setVolume}
                />
              ))}
            </div>
          </div>

          <SelectedContextPanel />

          <RegionToolbar
            disabled={controlsDisabled}
            lockedAdvancedOps={lockedAdvancedOps}
            regionSelected={Boolean(selectedRegionId)}
            onDelete={deleteRegion}
            onDuplicate={duplicateRegion}
            onFadeIn={() => fadeRegion("in")}
            onFadeOut={() => fadeRegion("out")}
            onMoveLeft={() => moveRegion("left")}
            onMoveRight={() => moveRegion("right")}
            onSplit={splitRegion}
          />

          {stemsReady ? (
            <div className={me.voicePresetsSection}>
              <VoicePresetPanel
                disabled={controlsDisabled}
                operations={operations}
                onApplyPreset={applyVoicePreset}
              />
              <VoicePresetDemo />
            </div>
          ) : null}
        </div>

        <div className={me.sideColumn}>
          <EditHistoryPanel
            disabled={controlsDisabled}
            operations={operations}
            onRedo={() => void redo()}
            onUndo={() => void undo()}
          />

          <EditorKaraokePanel />

          <EditorAiRemixPanel />

          <RenderButton
            disabled={controlsDisabled}
            isRendering={isRendering}
            musicProvider={musicProvider}
            renderError={renderError}
            songId={songId}
            songTitle={title || t("trackFilenameFallback")}
            sourceLyricsText={sourceLyricsText}
            sourceTrackId={sourceTrackId}
            versions={versions}
            onRender={() => void handleRender()}
          />
        </div>
      </div>

      {error ? <p className={me.error}>{error}</p> : null}
    </section>
  );
}
