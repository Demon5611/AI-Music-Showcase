"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { buildApiErrorTranslations, parseApiError } from "@/shared/lib/parse-api-error";
import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import { useApi } from "@/shared/providers/api-provider";
import { invalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";
import { checkContentAllowed, type MusicStatusResponseDto } from "@ai-music/shared";
import { buildMusicGenerateBody } from "@/features/music-create/utils/build-music-generate-body";
import { isMusicGenerationPollTerminal } from "@/features/music-create/utils/music-generation-ui-readiness";

const POLL_INTERVAL_FAST_MS = 4_000;
const POLL_INTERVAL_DEFAULT_MS = 12_000;
const POLL_FAST_PHASE_MS = 90_000;
const GENERATION_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export interface GenerateSongInput {
  prompt: string;
  style: string;
  title: string;
  durationSec: number;
  voiceSampleId: string | null;
  voiceProfileId: string | null;
  usePersonalVoice: boolean;
  lyricsLanguage?: string;
}

function hasBlockedContent(input: GenerateSongInput): boolean {
  return [input.prompt, input.style, input.title].some(
    (value) => !checkContentAllowed(value).allowed,
  );
}

export function useMusicGeneration() {
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const tErrors = useTranslations("Errors");
  const parseOptions = useMemo(
    () => ({
      includeUnauthorized: true,
      includeServerHint: true,
      translations: buildApiErrorTranslations(tErrors),
    }),
    [tErrors],
  );
  // Latest-value ref: keeps the mount-only status effect from refetching on every
  // render while still using up-to-date translations if the locale changes.
  const latestRef = useRef({ tErrors, parseOptions });
  latestRef.current = { tErrors, parseOptions };

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [activePollTaskId, setActivePollTaskId] = useState<string | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<MusicStatusResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeletingTrack, setIsDeletingTrack] = useState(false);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  const [openingEditorTrackId, setOpeningEditorTrackId] = useState<string | null>(null);

  useEffect(() => {
    void api.music
      .getTestStatus()
      .then((body) => {
        setConfigured(Boolean(body.configured));
        setStatusLoadError(null);
      })
      .catch((loadError) => {
        setConfigured(null);
        const { tErrors: currentTErrors, parseOptions: currentParseOptions } = latestRef.current;
        setStatusLoadError(
          parseApiError(loadError, currentTErrors("generic"), currentParseOptions),
        );
      });
  }, [api]);

  const refreshHistory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["music-history"] });
  }, [queryClient]);

  const statusQuery = usePollingQuery({
    queryKey: ["music-status", activePollTaskId],
    queryFn: async () => {
      if (!activePollTaskId) {
        throw new Error("Missing generation task id");
      }

      if (pollStartedAt && Date.now() - pollStartedAt > GENERATION_POLL_TIMEOUT_MS) {
        throw new Error(tErrors("generationTimeout"));
      }

      const body = await api.music.status(activePollTaskId);

      return body;
    },
    enabled: Boolean(activePollTaskId),
    isTerminal: isMusicGenerationPollTerminal,
    intervalMs: POLL_INTERVAL_DEFAULT_MS,
    resolveIntervalMs: (data) => {
      if (!pollStartedAt) {
        return POLL_INTERVAL_DEFAULT_MS;
      }

      const elapsedMs = Date.now() - pollStartedAt;
      const hasStreamProgress =
        data?.phaseHint === "finalizing" ||
        data?.phaseHint === "persisting" ||
        Boolean(data?.tracks?.some((track) => track.audioUrl));

      if (hasStreamProgress || elapsedMs >= POLL_FAST_PHASE_MS) {
        return POLL_INTERVAL_DEFAULT_MS;
      }

      return POLL_INTERVAL_FAST_MS;
    },
  });

  useEffect(() => {
    if (statusQuery.error) {
      setError(parseApiError(statusQuery.error, tErrors("generic"), parseOptions));
      setActivePollTaskId(null);
      return;
    }

    const body = statusQuery.data;
    if (!body) {
      return;
    }

    setStatus(body);

    if (body.status === "failed") {
      setActivePollTaskId(null);
      void queryClient.invalidateQueries({ queryKey: ["music-history"] });
      void invalidateCreditsBalance(queryClient);
      setError(
        body.errorMessage
          ? parseApiError(new Error(body.errorMessage), tErrors("generateTrackFailed"), parseOptions)
          : tErrors("generateTrackFailed"),
      );
      return;
    }

    if (isMusicGenerationPollTerminal(body)) {
      setActivePollTaskId(null);
      void queryClient.invalidateQueries({ queryKey: ["music-history"] });
    }
  }, [queryClient, statusQuery.data, statusQuery.error, tErrors, parseOptions]);

  const generate = useCallback(
    async (input: GenerateSongInput) => {
      if (hasBlockedContent(input)) {
        setError(tErrors("contentModeration"));
        return;
      }

      setError(null);
      setIsGenerating(true);
      setStatus(null);
      setTaskId(null);
      setActivePollTaskId(null);
      setPollStartedAt(null);

      try {
        const idempotencyKey = crypto.randomUUID();
        const requestBody = buildMusicGenerateBody(input);

        const body = await api.music.generate(requestBody, idempotencyKey);

        setTaskId(body.recordId);
        setStatus({
          recordId: body.recordId,
          taskId: body.recordId,
          status: "pending",
          provider: body.provider,
          phaseHint: "queued",
        });
        setActivePollTaskId(body.recordId);
        setPollStartedAt(Date.now());
        void invalidateCreditsBalance(queryClient);
      } catch (generateError) {
        setError(parseApiError(generateError, tErrors("generic"), parseOptions));
      } finally {
        setIsGenerating(false);
      }
    },
    [api, queryClient, tErrors, parseOptions],
  );

  const openEditor = useCallback(
    async (trackId: string) => {
      setIsOpeningEditor(true);
      setOpeningEditorTrackId(trackId);
      setError(null);

      try {
        const result = await api.musicEditor.initEditor(trackId);
        router.push(`/music-editor/${result.songId}`);
      } catch (editorError) {
        setError(parseApiError(editorError, tErrors("generic"), parseOptions));
      } finally {
        setIsOpeningEditor(false);
        setOpeningEditorTrackId(null);
      }
    },
    [api, router, tErrors, parseOptions],
  );

  const deleteTrack = useCallback(
    async (trackId: string) => {
      setIsDeletingTrack(true);
      setError(null);

      try {
        await api.music.deleteTrack(trackId);
        setStatus((current) =>
          current
            ? {
                ...current,
                tracks: current.tracks?.filter((track) => track.id !== trackId),
              }
            : current,
        );
        await refreshHistory();
      } catch (deleteError) {
        setError(parseApiError(deleteError, tErrors("generic"), parseOptions));
      } finally {
        setIsDeletingTrack(false);
      }
    },
    [api, refreshHistory, tErrors, parseOptions],
  );

  const isPolling = Boolean(activePollTaskId);

  return {
    configured,
    statusLoadError,
    taskId,
    status,
    error,
    isGenerating,
    isDeletingTrack,
    isOpeningEditor,
    openingEditorTrackId,
    isPolling,
    isBusy: isGenerating || isPolling,
    songTracks: status?.tracks ?? [],
    generate,
    openEditor,
    deleteTrack,
  };
}
