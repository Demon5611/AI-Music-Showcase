"use client";

import {
  VOICE_LANGUAGE_VALUES,
  type VoiceLanguage,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { voiceUi } from "@/features/voice/voice-classes";

interface VoiceLanguageSelectProps {
  disabled?: boolean;
  value: VoiceLanguage;
  onChange: (value: VoiceLanguage) => void;
}

export function VoiceLanguageSelect({
  disabled = false,
  value,
  onChange,
}: VoiceLanguageSelectProps) {
  const t = useTranslations("VoiceUpload.voiceLanguage");

  return (
    <div className={voiceUi.languageSelect}>
      <label className={voiceUi.languageLabel} htmlFor="voice-sample-language">
        {t("label")}
      </label>
      <select
        id="voice-sample-language"
        className={voiceUi.languageSelectControl}
        value={value}
        disabled={disabled}
        aria-describedby="voice-sample-language-helper"
        onChange={(event) => onChange(event.target.value as VoiceLanguage)}
      >
        {VOICE_LANGUAGE_VALUES.map((code) => (
          <option key={code} value={code}>
            {t(`options.${code}`)}
          </option>
        ))}
      </select>
      <p id="voice-sample-language-helper" className={voiceUi.languageHelper}>
        {t("helper")}
      </p>
    </div>
  );
}
