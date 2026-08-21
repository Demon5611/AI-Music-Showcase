"use client";

import { useTranslations } from "next-intl";
import {
  LYRICS_LANGUAGE_VALUES,
  type LyricsLanguage,
} from "@ai-music/shared";
import { mc } from "@/features/music-create/music-create-classes";

const SELECTABLE_LANGUAGES = LYRICS_LANGUAGE_VALUES;

interface LyricsLanguageSelectProps {
  value: LyricsLanguage;
  disabled?: boolean;
  onChange: (value: LyricsLanguage) => void;
}

export function LyricsLanguageSelect({
  value,
  disabled = false,
  onChange,
}: LyricsLanguageSelectProps) {
  const t = useTranslations("MusicCreate.lyricsLanguage");

  return (
    <div>
      <label className={mc.fieldLabel} htmlFor="lyrics-language">
        {t("label")}
      </label>
      <select
        id="lyrics-language"
        className={mc.select}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as LyricsLanguage)}
      >
        {SELECTABLE_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {t(`options.${code}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
