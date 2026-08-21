"use client";

import { buildApiErrorTranslations, parseApiError } from "@/shared/lib/parse-api-error";
import type { VoiceSample } from "@ai-music/shared";
import {
  isStaleVerifyPhraseExpiredError,
  isVerifyPhraseExpired,
  MIN_VOICE_VERIFY_DURATION_SEC,
} from "@ai-music/shared";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isVoiceSampleReadyForGeneration, isVoiceCloneCancelled, needsPersonaReverification, resolveVoiceSampleSnapshot, shouldHoldVoiceVerifyTransition } from "@/entities/voice-sample";
import { resolveVoiceCloneErrorForDisplay } from "@/features/voice/lib/resolve-voice-clone-error-display";
import { useVoiceRecorder } from "@/features/voice/use-voice-recorder";
import type { Locale } from "@/i18n/routing";
import { SunoVoiceVerifyTipsPanel } from "@/features/voice/voice-recording-tips-panel";
import { VoiceVerifyPhraseCountdown } from "@/features/voice/voice-verify-phrase-countdown";
import { voiceUi } from "@/features/voice/voice-classes";
import { useAuthReady, useAuthSession } from "@/shared/hooks/use-auth-ready";
import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import { useApi } from "@/shared/providers/api-provider";
import { VoiceCloneWaitingPanel } from "@/features/voice/voice-clone-waiting-panel";
import { appShell } from "@/shared/theme/app-theme";
import { AuthGate } from "@/shared/ui/auth-gate";
import { cn } from "@/lib/utils";

const STATUS_POLL_MS = 3_000;
const PHRASE_SYNC_POLL_MS = 15_000;
const MAX_STATUS_POLLS = 120;
const STUCK_WAIT_SEC = 120;

type VerifyTranslate = (
  key:
    | "preparing"
    | "idleHint"
    | "preparingHint"
    | "awaitingRecordingHint"
    | "cloningHint"
    | "readyHint"
    | "failedMismatch"
    | "failedGeneric"
    | "fallbackHint"
    | "pollTimeoutCloning"
    | "pollTimeoutPrepare",
) => string;

class SunoVoicePollTimeoutError extends Error {
  constructor(public readonly cloneStatus: VoiceSample["voiceCloneStatus"]) {
    super("Suno voice poll timeout");
    this.name = "SunoVoicePollTimeoutError";
  }
}

export interface SunoVoiceVerifyFlowProps {
  sampleId: string | null;
  variant?: "page" | "inline";
  onVoiceReady?: () => void;
  onRecordNewSample?: () => void;
  onSampleChange?: (sample: VoiceSample) => void;
}

function isVoiceMismatchMessage(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();

  return (
    normalized.includes("не совпал") ||
    normalized.includes("voices sound different")
  );
}

function resolveStatusLabel(sample: VoiceSample | null, t: VerifyTranslate): string {
  if (!sample) {
    return t("preparing");
  }

  switch (sample.voiceCloneStatus) {
    case "pending":
      return t("idleHint");
    case "preparing":
      return t("preparingHint");
    case "awaiting_verification":
      return t("awaitingRecordingHint");
    case "cloning":
      return t("cloningHint");
    case "ready":
      if (needsPersonaReverification(sample)) {
        return t("failedMismatch");
      }

      return t("readyHint");
    case "failed":
      return t("failedGeneric");
    default:
      return t("fallbackHint");
  }
}

function isRecoverableVoiceCloneFailure(sample: VoiceSample): boolean {
  if (sample.voiceCloneStatus !== "failed" || isVoiceCloneCancelled(sample)) {
    return false;
  }

  const message = sample.voiceCloneError ?? "";

  return (
    message.includes("Фраза верификации истекла") ||
    message.includes("не вернул текст фразы") ||
    message.includes("не выдал фразу") ||
    message.includes("Повторить верификацию")
  );
}

function shouldClearVerificationSubmitted(sample: VoiceSample | null): boolean {
  if (!sample) {
    return true;
  }

  if (
    sample.voiceCloneStatus === "pending" ||
    isVoiceCloneCancelled(sample) ||
    isVoiceSampleReadyForGeneration(sample)
  ) {
    return true;
  }

  if (
    sample.voiceCloneStatus === "failed" &&
    !isRecoverableVoiceCloneFailure(sample)
  ) {
    return true;
  }

  return false;
}

function isProcessingStatus(status: VoiceSample["voiceCloneStatus"]): boolean {
  return status === "preparing" || status === "cloning";
}

function shouldPollVoiceStatus(status: VoiceSample["voiceCloneStatus"]): boolean {
  return isProcessingStatus(status) || status === "awaiting_verification";
}

function resolvePollIntervalMs(status: VoiceSample["voiceCloneStatus"] | undefined): number {
  return status === "awaiting_verification" ? PHRASE_SYNC_POLL_MS : STATUS_POLL_MS;
}

function resolvePollTimeoutMessage(
  queryError: Error | null | undefined,
  t: VerifyTranslate,
): string | null {
  if (!(queryError instanceof SunoVoicePollTimeoutError)) {
    return null;
  }

  return queryError.cloneStatus === "cloning"
    ? t("pollTimeoutCloning")
    : t("pollTimeoutPrepare");
}

export function SunoVoiceVerifyFlow({
  sampleId,
  variant = "page",
  onVoiceReady,
  onRecordNewSample,
  onSampleChange,
}: SunoVoiceVerifyFlowProps) {
  const api = useApi();
  const locale = useLocale() as Locale;
  const tVerify = useTranslations("Generation.verify");
  const tVoice = useTranslations("VoiceUpload");
  const tv = useTranslations("Validation");
  const tc = useTranslations("Common");
  const te = useTranslations("Errors");
  const apiErrorTranslations = useMemo(() => buildApiErrorTranslations(te), [te]);
  const voiceSetupErrorFallback = useMemo(() => te("voiceSetupFailed"), [te]);
  const localizeCloneError = useCallback(
    (message: string | null | undefined) =>
      resolveVoiceCloneErrorForDisplay(message, locale, tVerify),
    [locale, tVerify],
  );
  const queryClient = useQueryClient();
  const router = useRouter();
  const authReady = useAuthReady();
  const { isLoaded, isSignedIn } = useAuthSession();
  const isInline = variant === "inline";
  const [sample, setSample] = useState<VoiceSample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetryingPrepare, setIsRetryingPrepare] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [pollRequested, setPollRequested] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [waitElapsedSec, setWaitElapsedSec] = useState(0);
  const [phraseTickMs, setPhraseTickMs] = useState(() => Date.now());
  const pollCountRef = useRef(0);
  const bootstrappedSampleIdRef = useRef<string | null>(null);
  const prepareInFlightRef = useRef(false);
  const onVoiceReadyRef = useRef(onVoiceReady);
  const onRecordNewSampleRef = useRef(onRecordNewSample);
  const onSampleChangeRef = useRef(onSampleChange);
  const apiRef = useRef(api);

  useEffect(() => {
    apiRef.current = api;
    onVoiceReadyRef.current = onVoiceReady;
    onRecordNewSampleRef.current = onRecordNewSample;
    onSampleChangeRef.current = onSampleChange;
  }, [api, onVoiceReady, onRecordNewSample, onSampleChange]);

  const {
    elapsedSec,
    error: recorderError,
    isRecording,
    startRecording,
    stopRecording,
  } = useVoiceRecorder();

  const stopPolling = useCallback(() => {
    setPollRequested(false);
  }, []);

  const startPolling = useCallback((debugReason: string) => {
    pollCountRef.current = 0;
    setPollRequested(true);
  }, []);

  const applyVoiceSampleState = useCallback(
    (incoming: VoiceSample) => {
      setSample((previous) => {
        const merged = resolveVoiceSampleSnapshot(incoming, previous) ?? incoming;

        if (sampleId) {
          queryClient.setQueryData(["suno-voice-status", sampleId], merged);
        }

        return merged;
      });
    },
    [queryClient, sampleId],
  );

  const resumeStatusPolling = useCallback(
    (debugReason: string) => {
      if (!sampleId) {
        return;
      }

      setError(null);
      pollCountRef.current = 0;
      void queryClient.removeQueries({ queryKey: ["suno-voice-status", sampleId] });
      startPolling(debugReason);
    },
    [queryClient, sampleId, startPolling],
  );

  const handleWaitElapsedChange = useCallback((elapsedSec: number) => {
    setWaitElapsedSec(elapsedSec);
  }, []);

  const handleVoiceReady = useCallback(() => {
    if (onVoiceReadyRef.current) {
      onVoiceReadyRef.current();
      return;
    }

    router.push("/music-create");
  }, [router]);

  const statusQuery = usePollingQuery({
    queryKey: ["suno-voice-status", sampleId],
    queryFn: async () => {
      if (!sampleId) {
        throw new Error(tv("voiceSampleMissing"));
      }

      pollCountRef.current += 1;
      const next = await api.voiceSamples.getSunoVoiceStatus(sampleId);

      if (pollCountRef.current > MAX_STATUS_POLLS) {
        throw new SunoVoicePollTimeoutError(next.voiceCloneStatus);
      }

      return next;
    },
    enabled: authReady && Boolean(sampleId) && pollRequested,
    isTerminal: (data) => Boolean(data && !shouldPollVoiceStatus(data.voiceCloneStatus)),
    intervalMs: STATUS_POLL_MS,
    resolveIntervalMs: (data) => resolvePollIntervalMs(data?.voiceCloneStatus),
  });

  const resolvedSample = resolveVoiceSampleSnapshot(statusQuery.data, sample);
  const pollError = statusQuery.error
    ? (resolvePollTimeoutMessage(statusQuery.error, tVerify) ??
      parseApiError(statusQuery.error, voiceSetupErrorFallback, {
        translations: apiErrorTranslations,
      }))
    : null;
  const activeVerificationSubmitted =
    verificationSubmitted && !shouldClearVerificationSubmitted(resolvedSample);
  const holdVerifyTransition = shouldHoldVoiceVerifyTransition(
    activeVerificationSubmitted,
    resolvedSample?.voiceCloneStatus,
  );
  const isWaitingForSuno =
    isSubmitting ||
    holdVerifyTransition ||
    (isProcessingStatus(resolvedSample?.voiceCloneStatus ?? "pending") && !isBootstrapping);

  useEffect(() => {
    if (!statusQuery.data) {
      return;
    }

    applyVoiceSampleState(statusQuery.data);

    if (
      statusQuery.data.voiceCloneStatus !== "failed" ||
      isVoiceCloneCancelled(statusQuery.data)
    ) {
      if (statusQuery.data.voiceCloneStatus !== "failed") {
        setError(null);
      }
    }

    if (isVoiceCloneCancelled(statusQuery.data)) {
      stopPolling();
    }
  }, [applyVoiceSampleState, statusQuery.data, stopPolling]);

  useEffect(() => {
    if (!resolvedSample) {
      return;
    }

    onSampleChangeRef.current?.(resolvedSample);
  }, [resolvedSample]);

  useEffect(() => {
    if (resolvedSample?.voiceCloneStatus !== "awaiting_verification") {
      return;
    }

    const timer = setInterval(() => setPhraseTickMs(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [resolvedSample?.voiceCloneStatus, resolvedSample?.voiceCloneStartedAt]);

  useEffect(() => {
    if (!resolvedSample || !isVoiceSampleReadyForGeneration(resolvedSample) || isInline) {
      return;
    }

    handleVoiceReady();
  }, [handleVoiceReady, isInline, resolvedSample]);

  useEffect(() => {
    if (!authReady || !sampleId) {
      return;
    }

    if (bootstrappedSampleIdRef.current === sampleId) {
      setIsBootstrapping(false);
      return;
    }

    if (prepareInFlightRef.current) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);
      setError(null);

      try {
        const current = await apiRef.current.voiceSamples.getSunoVoiceStatus(sampleId!);

        if (cancelled) {
          return;
        }

        applyVoiceSampleState(current);

        if (isVoiceSampleReadyForGeneration(current)) {
          handleVoiceReady();
          bootstrappedSampleIdRef.current = sampleId;
          return;
        }

        if (current.voiceCloneStatus === "failed") {
          if (isVoiceCloneCancelled(current)) {
            bootstrappedSampleIdRef.current = sampleId;
            return;
          }

          if (isRecoverableVoiceCloneFailure(current)) {
            // Stay on failed UI — user restarts via button; polling sync kept failing state.
          }

          bootstrappedSampleIdRef.current = sampleId;
          return;
        }

        if (current.voiceCloneStatus === "pending") {
          bootstrappedSampleIdRef.current = sampleId;
          return;
        }

        if (
          current.voiceCloneStatus === "preparing" ||
          current.voiceCloneStatus === "cloning"
        ) {
          applyVoiceSampleState(current);
          startPolling("bootstrap:preparing-or-cloning");
          bootstrappedSampleIdRef.current = sampleId;
          return;
        }

        if (current.voiceCloneStatus === "awaiting_verification") {
          startPolling("bootstrap:awaiting-verification");
          bootstrappedSampleIdRef.current = sampleId;
          return;
        }

        bootstrappedSampleIdRef.current = sampleId;
      } catch (bootstrapError) {
        if (!cancelled) {
          bootstrappedSampleIdRef.current = null;
          setError(
            parseApiError(bootstrapError, voiceSetupErrorFallback, {
              translations: apiErrorTranslations,
            }),
          );
        }
      } finally {
        setIsBootstrapping(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    apiErrorTranslations,
    applyVoiceSampleState,
    authReady,
    handleVoiceReady,
    sampleId,
    startPolling,
    voiceSetupErrorFallback,
  ]);

  async function handleVerifySubmit() {
    if (!sampleId) {
      setError(tv("voiceSampleMissing"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const recording = await stopRecording();

      if (!recording) {
        setError(tv("verifyPhraseRequired"));
        return;
      }

      if (recording.durationSec < MIN_VOICE_VERIFY_DURATION_SEC) {
        setError(
          tv("verifyRecordingTooShort", { seconds: MIN_VOICE_VERIFY_DURATION_SEC }),
        );
        return;
      }

      const formData = new FormData();
      formData.append("soundFile", recording.file);
      formData.append("durationSec", String(recording.durationSec));

      setVerificationSubmitted(true);
      void queryClient.cancelQueries({ queryKey: ["suno-voice-status", sampleId] });

      const verified = await api.voiceSamples.verifySunoVoice(sampleId, formData);
      applyVoiceSampleState(verified);

      if (isVoiceSampleReadyForGeneration(verified)) {
        handleVoiceReady();
        return;
      }

      if (verified.voiceCloneStatus === "cloning") {
        void queryClient.removeQueries({ queryKey: ["suno-voice-status", sampleId] });
        startPolling("verify-submit:cloning");
        return;
      }

      if (verified.voiceCloneStatus === "awaiting_verification") {
        setError(te("verifyCloneNotStarted"));
      }
    } catch (submitError) {
      setVerificationSubmitted(false);
      const message = parseApiError(submitError, voiceSetupErrorFallback, {
        translations: apiErrorTranslations,
      });

      try {
        const refreshed = await api.voiceSamples.getSunoVoiceStatus(sampleId);
        applyVoiceSampleState(refreshed);

        if (refreshed.voiceCloneStatus === "failed") {
          stopPolling();
          setError(message);
        } else if (
          isStaleVerifyPhraseExpiredError(
            message,
            refreshed.voiceCloneStartedAt,
            refreshed.voiceCloneStatus,
          )
        ) {
          // API reports "expired" while the client TTL is still live — avoid a duplicate red banner over the countdown.
          setError(te("verifySubmitFailed"));
        } else {
          setError(message);
        }
      } catch {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function runPrepare(restart: boolean, debugReason: string) {
    if (!sampleId || isRetryingPrepare) {
      return;
    }

    setError(null);
    pollCountRef.current = 0;
    setIsBootstrapping(true);
    setIsRetryingPrepare(true);
    prepareInFlightRef.current = true;
    stopPolling();
    bootstrappedSampleIdRef.current = sampleId;

    void queryClient.removeQueries({ queryKey: ["suno-voice-status", sampleId] });

    void apiRef.current.voiceSamples
      .prepareSunoVoice(sampleId, restart ? { restart: true } : undefined)
      .then((next) => {
        applyVoiceSampleState(next);

        if (isVoiceSampleReadyForGeneration(next)) {
          handleVoiceReady();
          return;
        }

        if (isProcessingStatus(next.voiceCloneStatus)) {
          startPolling(debugReason);
          return;
        }

        if (next.voiceCloneStatus === "awaiting_verification") {
          startPolling(`${debugReason}:awaiting`);
        }
      })
      .catch((retryError) =>
        setError(
          parseApiError(retryError, voiceSetupErrorFallback, {
            translations: apiErrorTranslations,
          }),
        ),
      )
      .finally(() => {
        setIsBootstrapping(false);
        setIsRetryingPrepare(false);
        prepareInFlightRef.current = false;
        bootstrappedSampleIdRef.current = sampleId;
      });
  }

  function handleStartPrepare() {
    runPrepare(false, "start-prepare:processing");
  }

  function handleRetryPrepare() {
    if (!sampleId || isRetryingPrepare) {
      return;
    }

    const phraseExpired = isVerifyPhraseExpired(resolvedSample?.voiceCloneStartedAt);

    if (
      !phraseExpired &&
      resolvedSample?.voiceCloneStatus === "awaiting_verification" &&
      resolvedSample.sunoValidatePhrase?.trim()
    ) {
      setError(null);
      resumeStatusPolling("retry:resume-awaiting");
      return;
    }

    runPrepare(true, "retry-prepare:processing");
  }

  function handleStopVerification() {
    if (!sampleId || isCancelling) {
      return;
    }

    setError(null);
    setIsCancelling(true);
    stopPolling();
    setIsSubmitting(false);

    void queryClient.cancelQueries({ queryKey: ["suno-voice-status", sampleId] });
    void queryClient.removeQueries({ queryKey: ["suno-voice-status", sampleId] });

    void apiRef.current.voiceSamples
      .cancelSunoVoice(sampleId)
      .then((cancelled) => {
        applyVoiceSampleState(cancelled);
        bootstrappedSampleIdRef.current = sampleId;
      })
      .catch((cancelError) => {
        setError(
          parseApiError(cancelError, voiceSetupErrorFallback, {
            translations: apiErrorTranslations,
          }),
        );
      })
      .finally(() => {
        setIsCancelling(false);
      });
  }

  function handleRecordNewSample() {
    if (onRecordNewSampleRef.current) {
      onRecordNewSampleRef.current();
      return;
    }

    router.push("/");
  }

  const shellClassName = isInline ? voiceUi.verifyInlineShell : appShell.formPage;
  const formClassName = isInline
    ? voiceUi.verifyInlineForm
    : cn(appShell.formPageForm, "max-w-xl");
  const titleClassName = isInline ? voiceUi.verifyInlineTitle : appShell.formPageTitle;
  const descriptionClassName = isInline
    ? voiceUi.verifyInlineDescription
    : appShell.formPageDescription;

  function renderShell(content: ReactNode) {
    return <div className={shellClassName}>{content}</div>;
  }

  if (!isLoaded) {
    return renderShell(
      <div className={formClassName}>
        {!isInline ? <h1 className={titleClassName}>{tVerify("pageTitle")}</h1> : null}
        <VoiceCloneWaitingPanel active label={tVerify("loading")} />
      </div>,
    );
  }

  if (!isSignedIn) {
    return renderShell(
      <div className={formClassName}>
        {!isInline ? <h1 className={titleClassName}>{tVerify("pageTitle")}</h1> : null}
        <AuthGate
          hint={tVoice("authHintVerify")}
          layout="inline"
          title={tVoice("authTitleVerify")}
        />
      </div>,
    );
  }

  if (!sampleId) {
    return renderShell(<p className={appShell.formError}>{tv("voiceSampleMissing")}</p>);
  }

  const isAwaitingVerification =
    resolvedSample?.voiceCloneStatus === "awaiting_verification";
  const phraseExpired =
    isAwaitingVerification &&
    !isBootstrapping &&
    !isSubmitting &&
    !holdVerifyTransition &&
    isVerifyPhraseExpired(resolvedSample?.voiceCloneStartedAt, phraseTickMs);
  const showRecorder =
    isAwaitingVerification && !isSubmitting && !holdVerifyTransition && !phraseExpired;
  const isBusy =
    isSubmitting ||
    isCancelling ||
    isProcessingStatus(resolvedSample?.voiceCloneStatus ?? "pending");
  const isReady = resolvedSample ? isVoiceSampleReadyForGeneration(resolvedSample) : false;
  const showWaitingPanel = isBootstrapping || isWaitingForSuno;
  const rawCloneOrClientError =
    error ??
    pollError ??
    (resolvedSample?.voiceCloneStatus === "failed"
      ? resolvedSample.voiceCloneError ?? voiceSetupErrorFallback
      : null);
  const rawDisplayError = showWaitingPanel
    ? null
    : localizeCloneError(rawCloneOrClientError);
  const displayError = isStaleVerifyPhraseExpiredError(
    rawDisplayError,
    resolvedSample?.voiceCloneStartedAt,
    resolvedSample?.voiceCloneStatus,
    phraseTickMs,
  )
    ? null
    : rawDisplayError;
  const cloneFailed = resolvedSample?.voiceCloneStatus === "failed";
  const showFailedActions = Boolean(displayError) || cloneFailed;
  const showStuckActions =
    (isWaitingForSuno || isBootstrapping) && waitElapsedSec >= STUCK_WAIT_SEC;
  const needsReverify = resolvedSample
    ? needsPersonaReverification(resolvedSample)
    : false;
  const showStartVerification =
    resolvedSample?.voiceCloneStatus === "pending" && !showWaitingPanel && !isReady;
  const showRecoveryActions =
    showFailedActions ||
    showStuckActions ||
    needsReverify ||
    phraseExpired ||
    (resolvedSample ? isRecoverableVoiceCloneFailure(resolvedSample) : false);
  const showVoiceMismatchHint = isVoiceMismatchMessage(rawCloneOrClientError);
  const waitingLabel = isBootstrapping
    ? tVerify("preparingAiVoice")
    : isSubmitting
      ? tVerify("sendingVerify")
      : holdVerifyTransition && resolvedSample?.voiceCloneStatus === "awaiting_verification"
        ? tVerify("creatingVoice")
        : resolveStatusLabel(resolvedSample, tVerify);

  const shellContent = (
    <div className={formClassName}>
        {isInline ? (
          <h2 className={titleClassName}>{tVerify("inlineTitle")}</h2>
        ) : (
          <h1 className={titleClassName}>{tVerify("pageTitle")}</h1>
        )}
        {showWaitingPanel ? null : (
          <p className={descriptionClassName}>
            {phraseExpired
              ? tVerify("phraseExpiredBanner")
              : resolveStatusLabel(resolvedSample, tVerify)}
          </p>
        )}

        {showWaitingPanel ? (
          <>
            <VoiceCloneWaitingPanel
              active={showWaitingPanel}
              label={waitingLabel}
              onElapsedChange={handleWaitElapsedChange}
            />
            <div className={voiceUi.formActions}>
              <button
                className={voiceUi.upload.toolButtonDestructive}
                disabled={isCancelling}
                type="button"
                onClick={handleStopVerification}
              >
                {isCancelling ? tVerify("stopping") : tc("stop")}
              </button>
            </div>
          </>
        ) : null}

        {resolvedSample?.sunoValidatePhrase &&
        resolvedSample.voiceCloneStatus === "awaiting_verification" &&
        !showWaitingPanel ? (
          <div className={voiceUi.consentContent}>
            <span className={voiceUi.consentTitle}>{tVerify("phraseLabel")}</span>
            <span className={voiceUi.consentPhrase}>{resolvedSample.sunoValidatePhrase}</span>
            <VoiceVerifyPhraseCountdown
              nowMs={phraseTickMs}
              startedAt={resolvedSample.voiceCloneStartedAt}
            />
          </div>
        ) : null}

        {showRecorder ? <SunoVoiceVerifyTipsPanel /> : null}

        {displayError ? (
          <p className={appShell.formError} role="alert">
            {displayError}
          </p>
        ) : null}

        {recorderError ? (
          <p className={appShell.formError} role="alert">
            {recorderError}
          </p>
        ) : null}

        {showRecorder ? (
          <div className={appShell.formField}>
            {!isRecording ? (
              <button
                className={appShell.formSubmit}
                disabled={isBusy}
                type="button"
                onClick={() => {
                  void startRecording();
                }}
              >
                {tVerify("startRecording")}
              </button>
            ) : (
              <button
                className={appShell.formSubmit}
                disabled={isBusy}
                type="button"
                onClick={() => {
                  void handleVerifySubmit();
                }}
              >
                {isSubmitting
                  ? tVerify("submitting")
                  : tVerify("stopAndSubmit", { seconds: elapsedSec })}
              </button>
            )}
          </div>
        ) : null}

        {isReady && isInline ? (
          <div className={voiceUi.verifyReadyActions}>
            <p className={descriptionClassName}>{tVerify("verifiedReady")}</p>
            <Link className={appShell.formSubmit} href="/music-create">
              {tVerify("goToCreate")}
            </Link>
          </div>
        ) : null}

        {showStartVerification ? (
          <div className={voiceUi.formActions}>
            <button
              className={appShell.formSubmit}
              disabled={isBootstrapping || isRetryingPrepare}
              type="button"
              onClick={handleStartPrepare}
            >
              {isRetryingPrepare ? tVerify("starting") : tVerify("startVerification")}
            </button>
            <button
              className={appShell.btnSecondaryOutline}
              disabled={isBootstrapping || isRetryingPrepare}
              type="button"
              onClick={handleRecordNewSample}
            >
              {tVerify("recordNewSample")}
            </button>
          </div>
        ) : null}

        {showRecoveryActions ? (
          <>
            {showVoiceMismatchHint ? (
              <p className={descriptionClassName}>{tVerify("voiceMismatchHint")}</p>
            ) : null}
            <div className={voiceUi.formActions}>
              <button
                className={appShell.formSubmit}
                disabled={isBootstrapping || isRetryingPrepare}
                type="button"
                onClick={handleRetryPrepare}
              >
                {isRetryingPrepare ? tVerify("starting") : tVerify("retryVerification")}
              </button>
              <button
                className={appShell.btnSecondaryOutline}
                disabled={isBootstrapping || isRetryingPrepare}
                type="button"
                onClick={handleRecordNewSample}
              >
                {tVerify("recordNewSample")}
              </button>
            </div>
          </>
        ) : null}
    </div>
  );

  return renderShell(shellContent);
}
