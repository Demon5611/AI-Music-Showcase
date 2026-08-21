"use client";

import { useTranslations } from "next-intl";
import {
  VOICE_RECORDING_TIP_DURATION_LABEL,
  VOICE_RECORDING_TIP_KEYS,
  VOICE_VERIFY_TIP_KEYS,
} from "@/features/voice/voice-recording-tips";
import { voiceUi } from "@/features/voice/voice-classes";

export function VoiceRecordingTipsPanel() {
  const t = useTranslations("VoiceUpload");

  return (
    <aside aria-label={t("tipsAria")} className={voiceUi.recordingTips}>
      <p className={voiceUi.recordingTipsTitle}>{t("tipsTitle")}</p>
      <ul className={voiceUi.recordingTipsList}>
        {VOICE_RECORDING_TIP_KEYS.map((key) => (
          <li key={key}>
            {t(`tips.${key}`, { duration: VOICE_RECORDING_TIP_DURATION_LABEL })}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function SunoVoiceVerifyTipsPanel() {
  const t = useTranslations("VoiceUpload");

  return (
    <aside aria-label={t("verifyTipsAria")} className={voiceUi.recordingTips}>
      <p className={voiceUi.recordingTipsTitle}>{t("verifyTipsTitle")}</p>
      <ul className={voiceUi.recordingTipsList}>
        {VOICE_VERIFY_TIP_KEYS.map((key) => (
          <li key={key}>{t(`verifyTips.${key}`)}</li>
        ))}
      </ul>
    </aside>
  );
}
