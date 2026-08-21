"use client";

import type { EditOperation, EditorTrackId, VoicePresetSelection } from "@ai-music/shared";
import {
  DEFAULT_FADE_DURATION_MS,
  findRegionAtLayoutMs,
  isTimelineRangeSelection,
  resolveDeleteRangeForEditor,
  resolveDeleteRangeFromLayoutSelection,
  resolveSourceRangeForEditor,
  resolveSourceRangeForLayoutSelection,
  resolveSplitAtMsForEditor,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { clampTrackVolumeDb, resolveVolumeTrackId } from "@/features/music-editor/utils/volume-utils";
import { parseApiError } from "@/shared/lib/parse-api-error";
import { useApi } from "@/shared/providers/api-provider";
import {
  selectSelectedRegion,
  useAudioEditorStore,
  resolvePreviewTracks,
} from "@/features/music-editor/store/audio-editor-store";

function buildSelectionPayload(operation: EditOperation) {
  const state = useAudioEditorStore.getState();
  const operationTrackId = "trackId" in operation ? operation.trackId : null;
  const operationRegionId = "regionId" in operation ? operation.regionId : null;

  return {
    selectedRegionId: operationRegionId ?? state.selectedRegionId,
    selectedTrackId: operationTrackId ?? state.selectedTrackId,
  };
}

function resolveOperationTrackId(
  state: ReturnType<typeof useAudioEditorStore.getState>,
): EditorTrackId | null {
  if (state.selectedTrackId) {
    return state.selectedTrackId;
  }

  if (state.linkedTracks) {
    return "vocal";
  }

  return null;
}

function resolveFadeSourceRange(
  state: ReturnType<typeof useAudioEditorStore.getState>,
  region: NonNullable<ReturnType<typeof selectSelectedRegion>>,
): { rangeStartMs: number; rangeEndMs: number } | { fullRegion: true } | { error: string } {
  const selection = state.timelineSelectionSec;
  const selectionContext = state.timelineSelectionContext;
  const hasRangeSelection =
    selection !== null && isTimelineRangeSelection(selection.startSec, selection.endSec);

  if (!hasRangeSelection || !selection) {
    return { fullRegion: true };
  }

  const hasClipLayout =
    selectionContext !== null &&
    selectionContext.regionId === region.id &&
    selectionContext.layoutEndSec > selectionContext.layoutStartSec;

  const rangeResult = hasClipLayout
    ? resolveSourceRangeForLayoutSelection(
        region,
        selectionContext.layoutStartSec * 1000,
        selectionContext.layoutEndSec * 1000,
        selection.startSec * 1000,
        selection.endSec * 1000,
      )
    : resolveSourceRangeForEditor(
        state.regions,
        state.operations,
        region,
        selection.startSec * 1000,
        selection.endSec * 1000,
      );

  if ("error" in rangeResult) {
    return { error: rangeResult.error };
  }

  if ("fullRegion" in rangeResult) {
    return { fullRegion: true };
  }

  return {
    rangeStartMs: rangeResult.startMs,
    rangeEndMs: rangeResult.endMs,
  };
}

function ensureSelectedRegionId(): string | null {
  const state = useAudioEditorStore.getState();

  if (state.selectedRegionId) {
    return state.selectedRegionId;
  }

  const firstRegion = [...state.regions].sort(
    (left, right) => left.orderIndex - right.orderIndex,
  )[0];

  if (!firstRegion) {
    return null;
  }

  state.setSelectedRegion(firstRegion.id);
  return firstRegion.id;
}

export function useEditorOperations() {
  const tValidation = useTranslations("Editor.validation");
  const tErrors = useTranslations("Errors");
  const api = useApi();
  const songId = useAudioEditorStore((state) => state.songId);
  const selectedRegionId = useAudioEditorStore((state) => state.selectedRegionId);
  const selectedTrackId = useAudioEditorStore((state) => state.selectedTrackId);
  const hydrate = useAudioEditorStore((state) => state.hydrate);
  const setBusy = useAudioEditorStore((state) => state.setBusy);
  const setError = useAudioEditorStore((state) => state.setError);
  const setPreviewMute = useAudioEditorStore((state) => state.setPreviewMute);
  const setPreviewGain = useAudioEditorStore((state) => state.setPreviewGain);
  const syncPreviewTracksFromOperations = useAudioEditorStore(
    (state) => state.syncPreviewTracksFromOperations,
  );

  const applyOperation = useCallback(
    async (operation: EditOperation) => {
      if (!songId) {
        return;
      }

      setBusy(true);
      setError(null);

      try {
        const result = await api.musicEditor.applyOperation(songId, {
          operation,
          ...buildSelectionPayload(operation),
        });
        hydrate(result);
      } catch (error) {
        syncPreviewTracksFromOperations();
        setError(parseApiError(error, tErrors("editorOperationFailed"), { preferFallback: true }));
      } finally {
        setBusy(false);
      }
    },
    [api, hydrate, setBusy, setError, songId, syncPreviewTracksFromOperations, tErrors],
  );

  const undo = useCallback(async () => {
    if (!songId) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await api.musicEditor.undoLastOperation(songId);
      hydrate(result);
    } catch (error) {
      setError(parseApiError(error, tErrors("editorUndoFailed"), { preferFallback: true }));
    } finally {
      setBusy(false);
    }
  }, [api, hydrate, setBusy, setError, songId, tErrors]);

  const redo = useCallback(async () => {
    if (!songId) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await api.musicEditor.redoLastOperation(songId);
      hydrate(result);
    } catch (error) {
      setError(parseApiError(error, tErrors("editorRedoFailed"), { preferFallback: true }));
    } finally {
      setBusy(false);
    }
  }, [api, hydrate, setBusy, setError, songId, tErrors]);

  const setVolume = useCallback(
    (trackId: EditorTrackId, gainDb: number) => {
      const regionId = ensureSelectedRegionId();

      if (!regionId) {
        setError(tValidation("selectRegion"));
        return;
      }

      const nextGainDb = clampTrackVolumeDb(gainDb);
      const state = useAudioEditorStore.getState();
      const persistedGainDb = resolvePreviewTracks(state.operations, regionId)[trackId].gainDb;

      if (nextGainDb === persistedGainDb) {
        if (state.previewTracks[trackId].gainDb !== nextGainDb) {
          setPreviewGain(trackId, nextGainDb);
        }

        return;
      }

      setPreviewGain(trackId, nextGainDb);

      void applyOperation({
        type: "SET_VOLUME",
        trackId,
        regionId,
        gainDb: nextGainDb,
      });
    },
    [applyOperation, setError, setPreviewGain, tValidation],
  );

  const adjustVolume = useCallback(
    (deltaDb: number) => {
      const state = useAudioEditorStore.getState();
      const trackId = resolveVolumeTrackId(state.selectedTrackId);
      const regionId = ensureSelectedRegionId();

      if (!regionId) {
        setError(tValidation("selectRegion"));
        return;
      }

      setVolume(trackId, state.previewTracks[trackId].gainDb + deltaDb);
    },
    [setError, setVolume, tValidation],
  );

  const muteTrack = useCallback(
    (trackId: EditorTrackId, muted: boolean) => {
      setPreviewMute(trackId, muted);

      void applyOperation({
        type: "MUTE_TRACK",
        trackId,
        muted,
      });
    },
    [applyOperation, setPreviewMute],
  );

  const splitRegion = useCallback(() => {
    const state = useAudioEditorStore.getState();
    let region = selectSelectedRegion(state);

    if (!region) {
      const layoutMatch = findRegionAtLayoutMs(
        state.regions,
        state.operations,
        state.currentTimeMs,
      );

      if (!layoutMatch) {
        setError(tValidation("playheadInsideOrSelect"));
        return;
      }

      region = state.regions.find((item) => item.id === layoutMatch.regionId) ?? null;

      if (!region) {
        setError(tValidation("splitRegionUnknown"));
        return;
      }
    }

    const splitResult = resolveSplitAtMsForEditor(
      state.regions,
      state.operations,
      region,
      state.currentTimeMs,
    );

    if ("error" in splitResult) {
      setError(
        splitResult.error === "Playhead must be inside the selected region on the timeline"
          ? tValidation("playheadInsideSelected")
          : splitResult.error === "Playhead is too close to the region edge for split"
            ? tValidation("playheadTooClose")
            : splitResult.error === "Region is too short for split"
              ? tValidation("regionTooShort")
              : tValidation("splitFailed"),
      );
      return;
    }

    void applyOperation({
      type: "SPLIT_REGION",
      regionId: region.id,
      splitAtMs: splitResult.splitAtMs,
    });
  }, [applyOperation, setError, tValidation]);

  const duplicateRegion = useCallback(() => {
    if (!selectedRegionId) {
      setError(tValidation("selectRegionForDuplicate"));
      return;
    }

    void applyOperation({
      type: "DUPLICATE_REGION",
      regionId: selectedRegionId,
    });
  }, [applyOperation, selectedRegionId, setError, tValidation]);

  const resizeRegion = useCallback(
    (regionId: string, startMs: number, endMs: number) => {
      void applyOperation({
        type: "RESIZE_REGION",
        regionId,
        startMs,
        endMs,
      });
    },
    [applyOperation],
  );

  const resizeTrackRegion = useCallback(
    (trackId: EditorTrackId, regionId: string, startMs: number, endMs: number) => {
      void applyOperation({
        type: "RESIZE_TRACK_REGION",
        trackId,
        regionId,
        startMs,
        endMs,
      });
    },
    [applyOperation],
  );

  const fadeRegion = useCallback(
    (fadeType: "in" | "out") => {
      const state = useAudioEditorStore.getState();
      const selectionContext = state.timelineSelectionContext;
      let region = selectSelectedRegion(state);

      if (selectionContext?.regionId) {
        region = state.regions.find((item) => item.id === selectionContext.regionId) ?? region;
      }

      if (!region) {
        setError(tValidation("selectRegionForFade"));
        return;
      }

      const trackId = resolveOperationTrackId(state);

      if (!trackId) {
        setError(tValidation("selectTrackForFade"));
        return;
      }

      const fadeRange = resolveFadeSourceRange(state, region);

      if ("error" in fadeRange) {
        setError(
          fadeRange.error === "Selection is too short or outside the region"
            ? tValidation("fadeSelectInside")
            : tValidation("fadeRangeUnknown"),
        );
        return;
      }

      void applyOperation({
        type: "FADE",
        trackId,
        regionId: region.id,
        fadeType,
        durationMs: DEFAULT_FADE_DURATION_MS,
        ...("rangeStartMs" in fadeRange
          ? {
              rangeStartMs: fadeRange.rangeStartMs,
              rangeEndMs: fadeRange.rangeEndMs,
            }
          : {}),
      });
    },
    [applyOperation, setError, tValidation],
  );

  const moveRegion = useCallback(
    (direction: "left" | "right") => {
      const state = useAudioEditorStore.getState();
      const region = selectSelectedRegion(state);

      if (!region) {
        setError(tValidation("selectRegionForMove"));
        return;
      }

      const targetIndex =
        direction === "left" ? Math.max(0, region.orderIndex - 1) : region.orderIndex + 1;

      void applyOperation({
        type: "MOVE_REGION",
        regionId: region.id,
        targetIndex,
      });
    },
    [applyOperation, setError, tValidation],
  );

  const moveRegionToIndex = useCallback(
    (regionId: string, targetIndex: number) => {
      void applyOperation({
        type: "MOVE_REGION",
        regionId,
        targetIndex,
      });
    },
    [applyOperation],
  );

  const moveTrackRegionToIndex = useCallback(
    (trackId: EditorTrackId, regionId: string, targetIndex: number) => {
      void applyOperation({
        type: "MOVE_TRACK_REGION",
        trackId,
        regionId,
        targetIndex,
      });
    },
    [applyOperation],
  );

  const deleteRegion = useCallback(() => {
    const state = useAudioEditorStore.getState();
    const selection = state.timelineSelectionSec;
    const selectionContext = state.timelineSelectionContext;
    const hasRangeSelection =
      selection !== null && isTimelineRangeSelection(selection.startSec, selection.endSec);

    let region = selectSelectedRegion(state);

    if (hasRangeSelection && selectionContext?.regionId) {
      region = state.regions.find((item) => item.id === selectionContext.regionId) ?? region;
    }

    if (!region) {
      setError(tValidation("selectRegionForDelete"));
      return;
    }

    if (!hasRangeSelection) {
      void applyOperation({
        type: "DELETE_REGION",
        regionId: region.id,
      });
      return;
    }

    const hasClipLayout =
      selectionContext !== null &&
      selectionContext.regionId === region.id &&
      selectionContext.layoutEndSec > selectionContext.layoutStartSec;

    const rangeResult = hasClipLayout
      ? resolveDeleteRangeFromLayoutSelection(
          region,
          selectionContext.layoutStartSec * 1000,
          selectionContext.layoutEndSec * 1000,
          selection.startSec * 1000,
          selection.endSec * 1000,
        )
      : resolveDeleteRangeForEditor(
          state.regions,
          state.operations,
          region,
          selection.startSec * 1000,
          selection.endSec * 1000,
        );

    if ("error" in rangeResult) {
      setError(
        rangeResult.error === "Selection is too short or outside the region"
          ? tValidation("deleteSelectInside")
          : rangeResult.error === "Selected range is too short to delete"
            ? tValidation("deleteTooShort")
            : rangeResult.error === "Selection is too close to the region edge"
              ? tValidation("deleteTooCloseToEdge")
              : tValidation("deleteRangeUnknown"),
      );
      return;
    }

    if (rangeResult.fullRegion) {
      void applyOperation({
        type: "DELETE_REGION",
        regionId: region.id,
      });
      return;
    }

    void applyOperation({
      type: "DELETE_RANGE",
      regionId: region.id,
      startMs: rangeResult.startMs,
      endMs: rangeResult.endMs,
    });
  }, [applyOperation, setError, tValidation]);

  const applyVoicePreset = useCallback(
    (presetId: VoicePresetSelection) => {
      void applyOperation({
        type: "APPLY_VOICE_PRESET",
        trackId: "vocal",
        presetId,
      });
    },
    [applyOperation],
  );

  return {
    applyOperation,
    undo,
    redo,
    setVolume,
    adjustVolume,
    muteTrack,
    applyVoicePreset,
    splitRegion,
    duplicateRegion,
    resizeRegion,
    resizeTrackRegion,
    fadeRegion,
    moveRegion,
    moveRegionToIndex,
    moveTrackRegionToIndex,
    deleteRegion,
  };
}
