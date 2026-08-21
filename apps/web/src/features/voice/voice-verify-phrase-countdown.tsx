"use client";

import {
  formatVerifyPhraseCountdown,
  resolveVerifyPhraseRemainingSec,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { voiceUi } from "@/features/voice/voice-classes";

interface VoiceVerifyPhraseCountdownProps {
  startedAt: string | null;
  nowMs: number;
}

/** Countdown until the verification phrase expires (amber), with an explicit expired state. */
export function VoiceVerifyPhraseCountdown({
  startedAt,
  nowMs,
}: VoiceVerifyPhraseCountdownProps) {
  const t = useTranslations("Generation.verify");
  const remainingSec = resolveVerifyPhraseRemainingSec(startedAt, nowMs);

  if (remainingSec === null) {
    return null;
  }

  if (remainingSec <= 0) {
    return (
      <span className={voiceUi.phraseCountdownExpired} role="status">
        {t("countdownExpired")}
      </span>
    );
  }

  return (
    <span className={voiceUi.phraseCountdown} role="timer">
      {t("countdownLabel")}{" "}
      <span className={voiceUi.phraseCountdownTimer}>
        {formatVerifyPhraseCountdown(remainingSec)}
      </span>
    </span>
  );
}
