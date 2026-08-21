"use client";

import {
  MUREKA_CREDIT_COSTS,
  MUREKA_VOCAL_CLONE_MAX_DURATION_SEC,
  MUREKA_VOCAL_CLONE_MIN_DURATION_SEC,
  type VoiceProfileDto,
} from "@ai-music/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { invalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";
import type { PersonalVoiceBlockedReason } from "@/features/voice/resolve-voice-creation-view";
import {
  resolvePersonalVoicePanelPresentation,
  resolveProfileForSample,
} from "@/features/voice/resolve-personal-voice-profile-panel";
import { voiceUi } from "@/features/voice/voice-classes";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import {
  useVoiceProfileQuery,
  voiceProfileQueryKey,
} from "@/shared/hooks/use-voice-profile-query";
import {
  buildApiErrorTranslations,
  parseApiError,
} from "@/shared/lib/parse-api-error";
import { useApi } from "@/shared/providers/api-provider";

const BLOCKED_REASON_KEYS = {
  loading: "blockedLoading",
  processing: "blockedProcessing",
  consent: "blockedConsent",
  duration: "blockedDuration",
} as const satisfies Record<PersonalVoiceBlockedReason, string>;

interface PersonalVoiceProfilePanelProps {
  voiceSampleId: string;
  /** Local validation result; while set, the paid create action is not offered. */
  blockedReason?: PersonalVoiceBlockedReason | null;
  /** Status refresh failed while cached profile state is still displayed. */
  showStaleWarning?: boolean;
}

export function PersonalVoiceProfilePanel({
  voiceSampleId,
  blockedReason = null,
  showStaleWarning = false,
}: PersonalVoiceProfilePanelProps) {
  const api = useApi();
  const authReady = useAuthReady();
  const queryClient = useQueryClient();
  const t = useTranslations("VoiceUpload.personalVoice");
  const tErrors = useTranslations("Errors");
  const profileQuery = useVoiceProfileQuery(authReady);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parseOptions = useMemo(
    () => ({
      includeUnauthorized: true,
      includeServerHint: true,
      translations: buildApiErrorTranslations(tErrors),
    }),
    [tErrors],
  );

  const profile = resolveProfileForSample(profileQuery.data, voiceSampleId);
  const presentation = resolvePersonalVoicePanelPresentation({
    profile,
    blockedReason,
  });

  async function handleCreate() {
    setIsCreating(true);
    setError(null);

    try {
      const created = await api.voiceProfiles.createMureka({
        voiceSampleId,
        consentConfirmed: true,
      });
      queryClient.setQueryData<VoiceProfileDto | null>(
        voiceProfileQueryKey,
        created,
      );
      await invalidateCreditsBalance(queryClient);
    } catch (createError) {
      setError(parseApiError(createError, tErrors("generic"), parseOptions));
      await profileQuery.refetch();
      await invalidateCreditsBalance(queryClient);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className={voiceUi.personalVoicePanel}>
      <div className={voiceUi.personalVoiceContent}>
        <h3 className={voiceUi.personalVoiceTitle}>{t("title")}</h3>
        <p className={voiceUi.creationSectionHint}>
          {t("description", {
            cost: MUREKA_CREDIT_COSTS.createPersonalVoice,
          })}
        </p>
      </div>

      {blockedReason && presentation.status !== "ready" ? (
        <p className={voiceUi.personalVoiceStatus} role="status">
          {t(BLOCKED_REASON_KEYS[blockedReason], {
            min: MUREKA_VOCAL_CLONE_MIN_DURATION_SEC,
            max: MUREKA_VOCAL_CLONE_MAX_DURATION_SEC,
          })}
        </p>
      ) : null}

      {presentation.status === "creating" ? (
        <p className={voiceUi.personalVoiceStatus} role="status">
          {t("creating")}
        </p>
      ) : null}
      {presentation.status === "ready" ? (
        <p className={voiceUi.personalVoiceReady} role="status">
          {t("ready")}
        </p>
      ) : null}
      {presentation.showFailedBanner ? (
        <p className={voiceUi.personalVoiceError} role="alert">
          {presentation.showRefundConfirmed ? t("failedRefunded") : t("failed")}
        </p>
      ) : null}
      {showStaleWarning && profile ? (
        <p className={voiceUi.personalVoiceStatus} role="status">
          {t(presentation.status === "creating" ? "staleWhileCreating" : "stale")}
        </p>
      ) : null}
      {error ? (
        <p className={voiceUi.personalVoiceError} role="alert">
          {error}
        </p>
      ) : null}

      <div className={voiceUi.personalVoiceActions}>
        {presentation.showCreateCta ? (
          <button
            className={voiceUi.personalVoiceButton}
            disabled={isCreating}
            type="button"
            onClick={() => void handleCreate()}
          >
            {isCreating
              ? t("starting")
              : presentation.createCtaMode === "retry"
                ? t("retry")
                : t("create")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
