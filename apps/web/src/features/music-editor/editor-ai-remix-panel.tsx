"use client";

import {
  MUSIC_STYLES,
  OPERATION_COST_CREDITS,
  formatCredits,
  type MusicStyleId,
  type MusicStatusResponseDto,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { MusicGenerationLoader } from "@/features/music-create/music-generation-loader";
import { useInvalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";
import { me } from "@/features/music-editor/music-editor-classes";
import {
  isEditorRemixSourcePlayable,
  resolveFirstPlayableRemixTrackId,
} from "@/features/music-editor/utils/resolve-editor-remix-eligibility";
import { useAudioEditorStore } from "@/features/music-editor/store/audio-editor-store";
import { buildApiErrorTranslations, parseApiError } from "@/shared/lib/parse-api-error";
import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import { useApi } from "@/shared/providers/api-provider";
import { PlanGatedWrap } from "@/shared/ui/plan-gated";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 8_000;
const REMIX_COST_LABEL = formatCredits(OPERATION_COST_CREDITS.generateTrack);

function isRemixStatusTerminal(data: MusicStatusResponseDto | undefined): boolean {
  return data?.status === "completed" || data?.status === "failed";
}

export function EditorAiRemixPanel() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidateCreditsBalance = useInvalidateCreditsBalance();
  const t = useTranslations("Editor.remix");
  const tErrors = useTranslations("Errors");
  const errorTranslations = buildApiErrorTranslations(tErrors);
  const handledTerminalRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);

  const sourceTrackId = useAudioEditorStore((state) => state.sourceTrackId);
  const masterAudioUrl = useAudioEditorStore((state) => state.masterAudioUrl);

  const sourcePlayable = isEditorRemixSourcePlayable({ sourceTrackId, masterAudioUrl });

  const [selectedStyleId, setSelectedStyleId] = useState<MusicStyleId>("pop");
  const [activePollTaskId, setActivePollTaskId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpeningRemix, setIsOpeningRemix] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const statusQuery = usePollingQuery({
    queryKey: ["music-remix-status", activePollTaskId],
    queryFn: () => api.music.status(activePollTaskId!),
    enabled: Boolean(activePollTaskId),
    isTerminal: isRemixStatusTerminal,
    intervalMs: POLL_INTERVAL_MS,
  });

  const remixStatus = statusQuery.data;

  const pollError = statusQuery.error
    ? parseApiError(statusQuery.error, tErrors("remixStatusFailed"), {
        includeUnauthorized: true,
        includeServerHint: true,
        translations: errorTranslations,
      })
    : remixStatus?.status === "failed"
      ? (remixStatus.errorMessage ?? tErrors("remixCreateFailed"))
      : null;

  const displayError = submitError ?? pollError;

  const isPollTerminal =
    remixStatus?.status === "completed" ||
    remixStatus?.status === "failed" ||
    Boolean(statusQuery.error);

  const isBusy = isSubmitting || (Boolean(activePollTaskId) && !isPollTerminal);
  const isPolling = Boolean(activePollTaskId) && !isPollTerminal;
  const isCompleted = remixStatus?.status === "completed" && Boolean(activePollTaskId);
  const remixTrackId = isCompleted
    ? resolveFirstPlayableRemixTrackId(remixStatus?.tracks)
    : null;

  useEffect(() => {
    handledTerminalRef.current = null;
  }, [activePollTaskId]);

  useEffect(() => {
    if (!activePollTaskId || !remixStatus) {
      return;
    }

    if (remixStatus.status !== "completed" && remixStatus.status !== "failed") {
      return;
    }

    const terminalKey = `${activePollTaskId}:${remixStatus.status}`;
    if (handledTerminalRef.current === terminalKey) {
      return;
    }

    handledTerminalRef.current = terminalKey;

    if (remixStatus.status === "completed") {
      void queryClient.invalidateQueries({ queryKey: ["music-history"] });
    }

    if (remixStatus.status === "failed") {
      void invalidateCreditsBalance();
    }
  }, [activePollTaskId, invalidateCreditsBalance, queryClient, remixStatus]);

  const handleRemix = useCallback(async () => {
    if (!sourcePlayable || !sourceTrackId || submitLockRef.current || isBusy) {
      return;
    }

    submitLockRef.current = true;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await api.music.remixTrack(sourceTrackId, { styleId: selectedStyleId });
      setActivePollTaskId(result.recordId);
      await invalidateCreditsBalance();
    } catch (remixError) {
      setSubmitError(
        parseApiError(remixError, tErrors("remixCreateFailed"), {
          includeUnauthorized: true,
          includeServerHint: true,
          translations: errorTranslations,
        }),
      );
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  }, [
    api,
    errorTranslations,
    invalidateCreditsBalance,
    isBusy,
    selectedStyleId,
    sourcePlayable,
    sourceTrackId,
    tErrors,
  ]);

  const handleOpenRemix = useCallback(async () => {
    if (!remixTrackId || isOpeningRemix) {
      return;
    }

    setIsOpeningRemix(true);
    setSubmitError(null);

    try {
      const result = await api.musicEditor.initEditor(remixTrackId);
      router.push(`/music-editor/${result.songId}`);
    } catch (openError) {
      setSubmitError(
        parseApiError(openError, tErrors("openEditorFailed"), {
          includeUnauthorized: true,
          includeServerHint: true,
          translations: errorTranslations,
        }),
      );
    } finally {
      setIsOpeningRemix(false);
    }
  }, [api, errorTranslations, isOpeningRemix, remixTrackId, router, tErrors]);

  return (
    <div className={me.remixPanel}>
      <p className={me.remixTitle}>{t("title")}</p>
      <p className={me.remixDescription}>{t("description")}</p>

      {!sourcePlayable ? (
        <p className={me.remixUnavailable} role="status">
          {t("unavailableAudio")}
        </p>
      ) : null}

      <PlanGatedWrap feature="aiRemix" wide>
        <div className={me.remixControls}>
          <div className={me.remixStyles} role="group" aria-label={t("styleAria")}>
            {MUSIC_STYLES.map((style) => {
              const isActive = selectedStyleId === style.id;

              return (
                <button
                  key={style.id}
                  aria-pressed={isActive}
                  className={cn(me.remixStyleChip, isActive && me.remixStyleChipActive)}
                  disabled={!sourcePlayable || isBusy}
                  type="button"
                  onClick={() => setSelectedStyleId(style.id)}
                >
                  {style.label}
                </button>
              );
            })}
          </div>
          <button
            className={me.primaryButton}
            disabled={!sourcePlayable || isBusy}
            type="button"
            onClick={() => void handleRemix()}
          >
            {isBusy ? t("creating") : t("create", { cost: REMIX_COST_LABEL })}
          </button>
        </div>
      </PlanGatedWrap>

      {isBusy ? (
        <div className={me.remixLoaderWrap}>
          <MusicGenerationLoader
            isStarting={isSubmitting}
            phaseHint={remixStatus?.phaseHint}
            queueEtaSec={remixStatus?.queueEtaSec}
            queuePhase={remixStatus?.queuePhase}
            status={remixStatus?.status}
            taskId={isPolling ? activePollTaskId : null}
          />
        </div>
      ) : null}

      {isCompleted ? (
        <div className={me.remixSuccess} role="status">
          <p className={me.remixSuccessTitle}>{t("success")}</p>
          <div className={me.remixSuccessActions}>
            {remixTrackId ? (
              <button
                className={me.primaryButton}
                disabled={isOpeningRemix}
                type="button"
                onClick={() => void handleOpenRemix()}
              >
                {isOpeningRemix ? t("openingRemix") : t("openRemix")}
              </button>
            ) : null}
            <Link className={me.secondaryButton} href="/history">
              {t("goToHistory")}
            </Link>
          </div>
        </div>
      ) : null}

      {displayError ? <p className={me.error}>{displayError}</p> : null}
    </div>
  );
}
