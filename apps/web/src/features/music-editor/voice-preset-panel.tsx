"use client";

import {
  VOICE_PRESETS,
  resolveActiveVoicePresetFromOperations,
  type VoicePresetId,
  type VoicePresetSelection,
  type EditOperation,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { me } from "@/features/music-editor/music-editor-classes";
import { cn } from "@/lib/utils";
import { PlanGatedWrap } from "@/shared/ui/plan-gated";

interface VoicePresetPanelProps {
  operations: EditOperation[];
  disabled?: boolean;
  onApplyPreset: (presetId: VoicePresetSelection) => void;
}

export function VoicePresetPanel({
  operations,
  disabled = false,
  onApplyPreset,
}: VoicePresetPanelProps) {
  const t = useTranslations("Editor.voicePresets");
  const activePresetId = resolveActiveVoicePresetFromOperations(operations);

  function handleSelect(presetId: VoicePresetSelection) {
    if (disabled || presetId === activePresetId) {
      return;
    }

    onApplyPreset(presetId);
  }

  return (
    <div className={me.voicePresetPanel}>
      <p className={me.voicePresetLabel}>{t("title")}</p>
      <p className={me.panelHint}>{t("hint")}</p>
      <PlanGatedWrap feature="voicePresets" wide>
        <div className={me.voicePresetChips} role="group" aria-label={t("groupAria")}>
          <button
            aria-pressed={activePresetId === "none"}
            className={cn(
              me.voicePresetChip,
              activePresetId === "none" && me.voicePresetChipActive,
            )}
            disabled={disabled}
            type="button"
            onClick={() => handleSelect("none")}
          >
            {t("original")}
          </button>
          {VOICE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              aria-pressed={activePresetId === preset.id}
              className={cn(
                me.voicePresetChip,
                activePresetId === preset.id && me.voicePresetChipActive,
              )}
              disabled={disabled}
              title={t(`presets.${preset.id}.description`)}
              type="button"
              onClick={() => handleSelect(preset.id as VoicePresetId)}
            >
              {t(`presets.${preset.id}.label`)}
            </button>
          ))}
        </div>
      </PlanGatedWrap>
    </div>
  );
}
