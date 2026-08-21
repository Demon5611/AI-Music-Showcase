"use client";

import {
  MUREKA_VOCAL_CLONE_MAX_DURATION_SEC,
  MUREKA_VOCAL_CLONE_MIN_DURATION_SEC,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isVoiceSampleReadyForGeneration } from "@/entities/voice-sample";
import { SunoVoiceVerifyFlow } from "@/features/voice/suno-voice-verify-flow";
import { VoiceSampleCard } from "@/features/voice/voice-sample-card";
import { VoiceUploadPanel } from "@/features/voice/voice-upload-panel";
import { PersonalVoiceProfilePanel } from "@/features/voice/personal-voice-profile-panel";
import { resolveVoiceCreationView } from "@/features/voice/resolve-voice-creation-view";
import { voiceUi } from "@/features/voice/voice-classes";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { usePersonalVoiceCapability } from "@/shared/hooks/use-personal-voice-capability";
import { useVoiceProfileQuery } from "@/shared/hooks/use-voice-profile-query";
import { useApi } from "@/shared/providers/api-provider";
import { appShell } from "@/shared/theme/app-theme";
import { LoadingPanel } from "@/shared/ui/elevenlabs";
import { RequireAuth } from "@/shared/ui/require-auth";
import type { VoiceSample } from "@ai-music/shared";

type VoiceCreationVariant = "page" | "landing";

interface VoiceCreationPanelProps {
  variant?: VoiceCreationVariant;
}

export function VoiceCreationPanel({ variant = "landing" }: VoiceCreationPanelProps) {
  const isLanding = variant === "landing";
  const tLanding = useTranslations("Landing.voiceGate");
  const tVoice = useTranslations("VoiceUpload");

  return (
    <RequireAuth
      hint={isLanding ? tLanding("hint") : tVoice("pageAuthHint")}
      layout={isLanding ? "inline" : "page"}
      loadingFallback={isLanding ? <LoadingPanel lines={3} /> : <LoadingPanel />}
      title={isLanding ? tLanding("title") : tVoice("authTitle")}
    >
      <VoiceCreationPanelContent variant={variant} />
    </RequireAuth>
  );
}

function VoiceCreationPanelContent({ variant = "landing" }: VoiceCreationPanelProps) {
  const api = useApi();
  const authReady = useAuthReady();
  const t = useTranslations("VoiceUpload");
  const capabilityQuery = usePersonalVoiceCapability(authReady);
  // Feature off only when server explicitly says unavailable.
  // Load/error keeps mureka mode so we never silently degrade to Suno verify.
  const personalVoiceEnabled =
    capabilityQuery.isLoading || capabilityQuery.isError
      ? true
      : capabilityQuery.data?.available === true;
  const voiceProfileQuery = useVoiceProfileQuery(
    authReady && capabilityQuery.data?.available === true,
  );
  const [sample, setSample] = useState<VoiceSample | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(true);

  const loadLatestSample = useCallback(
    async (isCancelled: () => boolean) => {
      if (!authReady) {
        if (!isCancelled()) {
          setIsLoading(false);
        }
        return;
      }

      if (!isCancelled()) {
        setIsLoading(true);
      }

      try {
        const samples = await api.voiceSamples.list();
        if (isCancelled()) {
          return;
        }

        const latest = samples[0] ?? null;
        setSample(latest);
        setShowUploadForm(!latest || latest.voiceCloneStatus === "failed");
      } catch {
        if (!isCancelled()) {
          setSample(null);
        }
      } finally {
        if (!isCancelled()) {
          setIsLoading(false);
        }
      }
    },
    [api, authReady],
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => loadLatestSample(() => cancelled));

    return () => {
      cancelled = true;
    };
  }, [loadLatestSample]);

  function handleUploadSuccess(sampleId: string) {
    setShowUploadForm(false);
    void api.voiceSamples
      .list()
      .then((samples) => {
        const uploaded = samples.find((item) => item.id === sampleId) ?? samples[0] ?? null;
        setSample(uploaded);
      })
      .catch(() => {
        setSample(null);
      });
  }

  const handleVoiceReady = useCallback(() => {
    void loadLatestSample(() => false);
  }, [loadLatestSample]);

  const handleRecordNewSample = useCallback(() => {
    setShowUploadForm(true);
    setSample(null);
  }, []);

  const toggleUploadForm = useCallback(() => {
    setShowUploadForm((value) => !value);
  }, []);

  const handleSampleChange = useCallback((updated: VoiceSample) => {
    setSample(updated);
  }, []);

  if (isLoading) {
    return variant === "landing" ? <LoadingPanel lines={3} /> : <LoadingPanel />;
  }

  const view = resolveVoiceCreationView({
    personalVoiceEnabled,
    capability: {
      isLoading: capabilityQuery.isLoading || voiceProfileQuery.isLoading,
      isError: capabilityQuery.isError || voiceProfileQuery.isError,
      // `null` is a valid resolved value: the user has no profile yet.
      hasData:
        capabilityQuery.data !== undefined || voiceProfileQuery.data !== undefined,
    },
    sample: sample
      ? {
          status: sample.status,
          consentConfirmed: sample.consentConfirmed,
          durationSec: sample.durationSec,
          readyForGeneration: isVoiceSampleReadyForGeneration(sample),
        }
      : null,
    voiceProfileStatus:
      sample &&
      voiceProfileQuery.data?.sourceVoiceSampleId === sample.id
        ? (voiceProfileQuery.data.status ?? null)
        : null,
    durationBounds: {
      minSec: MUREKA_VOCAL_CLONE_MIN_DURATION_SEC,
      maxSec: MUREKA_VOCAL_CLONE_MAX_DURATION_SEC,
    },
  });
  return (
    <section className={voiceUi.creationSection}>
      <div className={voiceUi.creationSectionHeader}>
        <div className={voiceUi.creationSectionTitleRow}>
          <h2 className={voiceUi.creationSectionTitle}>{t("creationTitle")}</h2>
          <span className={voiceUi.creationOptionalBadge}>
            {t("creationOptionalLabel")}
          </span>
        </div>
        <p className={voiceUi.creationSectionHint}>{t("creationHint")}</p>
      </div>

      {sample ? <VoiceSampleCard sample={sample} /> : null}

      {view.showPersonalVoiceUnavailable ? (
        <p className={voiceUi.personalVoiceError} role="alert">
          {t("personalVoice.unavailable")}
        </p>
      ) : null}

      {sample && view.showPersonalVoicePanel ? (
        <PersonalVoiceProfilePanel
          blockedReason={view.personalVoiceBlockedReason}
          showStaleWarning={view.showPersonalVoiceStaleWarning}
          voiceSampleId={sample.id}
        />
      ) : null}

      {sample && view.showSunoVerification ? (
        <SunoVoiceVerifyFlow
          key={sample.id}
          sampleId={sample.id}
          variant="inline"
          onRecordNewSample={handleRecordNewSample}
          onSampleChange={handleSampleChange}
          onVoiceReady={handleVoiceReady}
        />
      ) : null}

      {view.showReadyCta ? (
        <div className={voiceUi.verifyReadyActions}>
          <p className={voiceUi.creationSectionHint}>{t("readyHint")}</p>
          <Link className={appShell.formSubmit} href="/music-create">
            {t("createTrack")}
          </Link>
        </div>
      ) : null}

      {sample ? (
        <button
          aria-controls="voice-upload-form-panel"
          aria-expanded={showUploadForm}
          className={cn(
            voiceUi.uploadFormToggle,
            showUploadForm && voiceUi.uploadFormToggleActive,
          )}
          type="button"
          onClick={toggleUploadForm}
        >
          {t("addNewSample")}
        </button>
      ) : null}

      <div hidden={Boolean(sample) && !showUploadForm} id="voice-upload-form-panel">
        {showUploadForm || !sample ? (
          <VoiceUploadPanel embedded variant={variant} onSuccess={handleUploadSuccess} />
        ) : null}
      </div>
    </section>
  );
}
