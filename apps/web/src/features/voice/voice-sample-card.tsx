"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  isRecommendedVoiceSampleDuration,
  RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC,
  RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC,
  type VoiceSample,
} from "@ai-music/shared";
import { isVoiceSampleReadyForGeneration, needsPersonaReverification } from "@/entities/voice-sample";
import {
  buildVoiceSampleAudioUrl,
  formatVoiceSampleDate,
  formatVoiceSampleDuration,
  resolveVoiceSampleStatusMessageKey,
} from "@/entities/voice-sample/voice-sample-display";
import { voiceUi } from "@/features/voice/voice-classes";
import { cn } from "@/lib/utils";
import { AudioPreviewPlayer } from "@/shared/ui/elevenlabs";

interface VoiceSampleCardProps {
  sample: VoiceSample;
}

function resolveStatusBadgeClass(sample: VoiceSample): string {
  if (isVoiceSampleReadyForGeneration(sample)) {
    return voiceUi.sampleCardBadgeReady;
  }

  if (needsPersonaReverification(sample)) {
    return voiceUi.sampleCardBadgeVerification;
  }

  if (sample.voiceCloneStatus === "failed") {
    return voiceUi.sampleCardBadgeError;
  }

  if (sample.voiceCloneStatus === "awaiting_verification") {
    return voiceUi.sampleCardBadgeVerification;
  }

  if (sample.voiceCloneStatus === "preparing" || sample.voiceCloneStatus === "cloning") {
    return voiceUi.sampleCardBadgeWarning;
  }

  return voiceUi.sampleCardBadgePending;
}

export function VoiceSampleCard({ sample }: VoiceSampleCardProps) {
  const t = useTranslations("VoiceUpload");
  const locale = useLocale();
  const isReady = isVoiceSampleReadyForGeneration(sample);
  const isShortSample = !isRecommendedVoiceSampleDuration(sample.durationSec);
  const statusKey = resolveVoiceSampleStatusMessageKey(sample);
  const recommendedDuration = `${RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC}–${RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC}`;

  return (
    <article className={voiceUi.sampleCard}>
      <div className={voiceUi.sampleCardHeader}>
        <div className={voiceUi.sampleCardBody}>
          <h3 className={voiceUi.sampleCardTitle}>
            {t("sample.titleFromDate", {
              date: formatVoiceSampleDate(sample.createdAt, locale),
            })}
          </h3>
          <div className={voiceUi.sampleCardMeta}>
            <span className={resolveStatusBadgeClass(sample)}>{t(statusKey)}</span>
            <span>{formatVoiceSampleDuration(sample.durationSec)}</span>
          </div>
        </div>
      </div>
      <div className={voiceUi.sampleCardPlayerRow}>
        <AudioPreviewPlayer
          className={cn(voiceUi.sampleCardPlayer, isReady && voiceUi.sampleCardPlayerReady)}
          src={buildVoiceSampleAudioUrl(sample.id)}
        />
      </div>
      {isShortSample ? (
        <p className={voiceUi.sampleCardMeta}>
          {t("durationRecommendation", { duration: recommendedDuration })}
        </p>
      ) : null}
    </article>
  );
}
