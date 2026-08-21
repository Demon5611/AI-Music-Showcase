"use client";

import type { VocalGender } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { voiceUi } from "@/features/voice/voice-classes";

interface VoiceGenderSelectProps {
  disabled?: boolean;
  value: VocalGender | null;
  onChange: (value: VocalGender) => void;
}

function GenderButton({
  active,
  children,
  disabled,
  onSelect,
}: {
  active: boolean;
  children: string;
  disabled: boolean;
  onSelect: () => void;
}) {
  const className = active ? voiceUi.genderButtonActive : voiceUi.genderButton;

  if (active) {
    return (
      <button
        aria-pressed="true"
        className={className}
        disabled={disabled}
        type="button"
        onClick={onSelect}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      aria-pressed="false"
      className={className}
      disabled={disabled}
      type="button"
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

export function VoiceGenderSelect({
  disabled = false,
  value,
  onChange,
}: VoiceGenderSelectProps) {
  const t = useTranslations("VoiceUpload");
  const tGender = useTranslations("MusicCreate.gender");

  return (
    <div className={voiceUi.genderSelect} role="group" aria-label={t("genderAria")}>
      <span className={voiceUi.genderLabel}>{t("genderLabel")}</span>
      <div className={voiceUi.genderButtons}>
        {(["m", "f"] as const).map((gender) => (
          <GenderButton
            key={gender}
            active={value === gender}
            disabled={disabled}
            onSelect={() => onChange(gender)}
          >
            {tGender(`${gender}Short`)}
          </GenderButton>
        ))}
      </div>
    </div>
  );
}
