"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipTrack } from "@waveform-playlist/core";
import type { EditOperation, EditorTrackId, SongRegionDto } from "@ai-music/shared";
import {
  resolveActiveVoicePresetFromOperations,
  resolveVoicePresetDsp,
  VOICE_PRESET_DSP_VERSION,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import {
  AUDIO_CONTEXT_OPTIONS,
  buildRegionTrack,
  type RegionMixPreviewOverlay,
  type TimelineStemSource,
} from "@/features/music-editor/utils/waveform-playlist-utils";
import { applyVoicePresetToAudioBuffer } from "@/shared/lib/voice-preset-webaudio";

function buildSourcesKey(sources: TimelineStemSource[]): string {
  return sources.map((source) => `${source.id}:${source.url}`).join("|");
}

function buildBufferCacheKey(sourceId: EditorTrackId, url: string): string {
  return `${sourceId}::${url}`;
}

const stemBufferCache = new Map<string, AudioBuffer>();
const vocalPresetCache = new Map<string, AudioBuffer>();

function buildVocalPresetCacheKey(
  url: string,
  presetId: ReturnType<typeof resolveActiveVoicePresetFromOperations>,
): string {
  return `v${VOICE_PRESET_DSP_VERSION}::${url}::${presetId}`;
}

function readCachedBuffers(
  sources: TimelineStemSource[],
): Map<EditorTrackId, AudioBuffer> {
  const cached = new Map<EditorTrackId, AudioBuffer>();

  for (const source of sources) {
    const buffer = stemBufferCache.get(buildBufferCacheKey(source.id, source.url));

    if (buffer) {
      cached.set(source.id, buffer);
    }
  }

  return cached;
}

function useStemAudioBuffers(sources: TimelineStemSource[]): {
  buffersBySourceId: Map<EditorTrackId, AudioBuffer>;
  isLoading: boolean;
  error: string | null;
  ready: boolean;
} {
  const tErrors = useTranslations("Errors");
  const sourcesKey = buildSourcesKey(sources);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const initialCachedBuffers = readCachedBuffers(sources);
  const [buffersBySourceId, setBuffersBySourceId] = useState<
    Map<EditorTrackId, AudioBuffer>
  >(initialCachedBuffers);
  const [isLoading, setIsLoading] = useState(
    sources.length > 0 && initialCachedBuffers.size !== sources.length,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentSources = sourcesRef.current;

    if (currentSources.length === 0) {
      setBuffersBySourceId(new Map());
      setIsLoading(false);
      setError(null);
      return;
    }

    const cachedBuffers = readCachedBuffers(currentSources);

    if (cachedBuffers.size === currentSources.length) {
      setBuffersBySourceId(cachedBuffers);
      setIsLoading(false);
      setError(null);
      return;
    }

    setBuffersBySourceId((current) =>
      cachedBuffers.size > 0 ? cachedBuffers : current,
    );
    setIsLoading(true);
    setError(null);

    const abortController = new AbortController();
    const audioContext = new window.AudioContext(AUDIO_CONTEXT_OPTIONS);

    async function loadBuffers(): Promise<void> {
      try {
        const entries = await Promise.all(
          currentSources.map(async (source) => {
            const cacheKey = buildBufferCacheKey(source.id, source.url);
            const cachedBuffer = stemBufferCache.get(cacheKey);

            if (cachedBuffer) {
              return [source.id, cachedBuffer] as const;
            }

            const response = await fetch(source.url, {
              signal: abortController.signal,
            });

            if (!response.ok) {
              throw new Error(`Audio request failed: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            stemBufferCache.set(cacheKey, audioBuffer);

            return [source.id, audioBuffer] as const;
          }),
        );

        setBuffersBySourceId(new Map(entries));
      } catch {
        if (abortController.signal.aborted) {
          return;
        }

        setError(tErrors("editorAudioLoadFailed"));
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadBuffers();

    return () => {
      abortController.abort();
      void audioContext.close();
    };
  }, [sourcesKey, tErrors]);

  const ready =
    !isLoading &&
    sources.length > 0 &&
    buffersBySourceId.size === sources.length;

  return { buffersBySourceId, isLoading, error, ready };
}

function buildMixPreviewSignature(mixPreview?: RegionMixPreviewOverlay): string {
  if (!mixPreview?.selectedRegionId) {
    return "";
  }

  return [
    mixPreview.selectedRegionId,
    (["vocal", "instrumental"] as const)
      .map((trackId) => {
        const state = mixPreview.previewTracks[trackId];

        return [trackId, state.gainDb, state.muted].join(":");
      })
      .join("|"),
  ].join("::");
}

export function useRegionPlaylistTracks(
  sources: TimelineStemSource[],
  regions: SongRegionDto[],
  operations: EditOperation[],
  mixPreview?: RegionMixPreviewOverlay,
): {
  tracks: ClipTrack[];
  isLoading: boolean;
  error: string | null;
} {
  const { buffersBySourceId, isLoading, error, ready } =
    useStemAudioBuffers(sources);
  const lastStableTracksRef = useRef<ClipTrack[]>([]);
  const mixPreviewSignature = buildMixPreviewSignature(mixPreview);
  const activeVoicePresetId = resolveActiveVoicePresetFromOperations(operations);
  const [processedVocalBuffer, setProcessedVocalBuffer] = useState<AudioBuffer | null>(null);
  const [isProcessingVocalPreset, setIsProcessingVocalPreset] = useState(false);

  const vocalSourceUrl = sources.find((source) => source.id === "vocal")?.url ?? null;
  const rawVocalBuffer = buffersBySourceId.get("vocal") ?? null;

  useEffect(() => {
    if (!rawVocalBuffer || !vocalSourceUrl) {
      setProcessedVocalBuffer(null);
      setIsProcessingVocalPreset(false);
      return;
    }

    const presetId = activeVoicePresetId;
    const cacheKey = buildVocalPresetCacheKey(vocalSourceUrl, presetId);
    const cached = vocalPresetCache.get(cacheKey);

    if (cached) {
      setProcessedVocalBuffer(cached);
      setIsProcessingVocalPreset(false);
      return;
    }

    let cancelled = false;
    setIsProcessingVocalPreset(true);

    void applyVoicePresetToAudioBuffer(rawVocalBuffer, resolveVoicePresetDsp(presetId))
      .then((buffer) => {
        if (cancelled) {
          return;
        }

        vocalPresetCache.set(cacheKey, buffer);
        setProcessedVocalBuffer(buffer);
      })
      .catch(() => {
        if (!cancelled) {
          setProcessedVocalBuffer(rawVocalBuffer);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProcessingVocalPreset(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeVoicePresetId, rawVocalBuffer, vocalSourceUrl]);

  const tracks = useMemo(() => {
    if (regions.length === 0) {
      lastStableTracksRef.current = [];
      return [];
    }

    if (!ready) {
      return lastStableTracksRef.current;
    }

    if (rawVocalBuffer && isProcessingVocalPreset && !processedVocalBuffer) {
      return lastStableTracksRef.current;
    }

    const nextTracks = sources
      .map((source) => {
        const audioBuffer =
          source.id === "vocal"
            ? (processedVocalBuffer ?? buffersBySourceId.get(source.id))
            : buffersBySourceId.get(source.id);

        if (!audioBuffer) {
          return null;
        }

        return buildRegionTrack(
          source,
          audioBuffer,
          regions,
          operations,
          mixPreview,
        );
      })
      .filter((track): track is ClipTrack => track !== null);

    lastStableTracksRef.current = nextTracks;
    return nextTracks;
  }, [
    buffersBySourceId,
    isProcessingVocalPreset,
    mixPreviewSignature,
    operations,
    processedVocalBuffer,
    rawVocalBuffer,
    ready,
    regions,
    sources,
  ]);

  return {
    tracks,
    isLoading: (isLoading && lastStableTracksRef.current.length === 0) || isProcessingVocalPreset,
    error,
  };
}
