"use client";

import { parseApiError } from "@/shared/lib/parse-api-error";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import { shouldInvalidateCreditsAfterEditorStateChange } from "@/features/billing/lib/should-invalidate-credits-after-editor-state";
import { useInvalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";
import { useApi } from "@/shared/providers/api-provider";

const POLL_INTERVAL_MS = 5000;

export function useEditorPolling(songId: string) {
  const tErrors = useTranslations("Errors");
  const api = useApi();
  const invalidateCreditsBalance = useInvalidateCreditsBalance();
  const hydrate = useAudioEditorStore((store) => store.hydrate);
  const setError = useAudioEditorStore((store) => store.setError);
  const songStatus = useAudioEditorStore((store) => store.songStatus);
  const isStemProcessing = songStatus === "separating_stems";

  const refresh = useCallback(async () => {
    const previous = {
      songStatus: useAudioEditorStore.getState().songStatus,
    };

    try {
      const state = await api.musicEditor.getEditorState(songId);
      const next = {
        songStatus: state.song.status,
      };

      if (shouldInvalidateCreditsAfterEditorStateChange(previous, next)) {
        void invalidateCreditsBalance();
      }

      hydrate(state);
    } catch (error) {
      setError(
        parseApiError(error, tErrors("editorRefreshFailed"), {
          preferFallback: true,
        }),
      );
    }
  }, [api, hydrate, invalidateCreditsBalance, setError, songId, tErrors]);

  useEffect(() => {
    if (!isStemProcessing) {
      return;
    }

    void refresh();

    const timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [isStemProcessing, refresh]);

  return { isProcessing: isStemProcessing, refresh };
}
