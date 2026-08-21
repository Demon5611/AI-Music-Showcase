"use client";

import { useTranslations } from "next-intl";
import {
  MAX_SELECTED_STYLE_CHIPS,
  MUSIC_STYLE_CHIP_OPTIONS,
  RECOMMENDED_STYLE_CHIPS_MIN,
  isStyleChipDisabled,
  isStyleChipSelected,
  parseStyleTags,
  toggleStyleChip,
} from "./music-style-chips";
import { MusicComboStyleChip } from "./music-combo-style-chip";
import { mc } from "@/features/music-create/music-create-classes";
import { DisabledTooltipWrap } from "@/shared/ui/tooltip";
import { cn } from "@/lib/utils";

interface MusicStyleChipsProps {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  showLabel?: boolean;
  allowCustomStyles?: boolean;
}

interface StyleChipOptionProps {
  chip: string;
  selected: boolean;
  disabled: boolean;
  lockedByPlan: boolean;
  onToggle: () => void;
}

function StyleChipOption({
  chip,
  selected,
  disabled,
  lockedByPlan,
  onToggle,
}: StyleChipOptionProps) {
  const t = useTranslations("MusicCreate.styles");
  const chipClassName = cn(selected ? mc.chipSelected : mc.chip, disabled && mc.chipDisabled);

  const label = (
    <label className={chipClassName}>
      <input
        aria-label={t("selected", { style: chip })}
        checked={selected}
        className={mc.chipInput}
        disabled={disabled}
        type="checkbox"
        onChange={onToggle}
      />
      {chip}
    </label>
  );

  if (lockedByPlan) {
    return (
      <DisabledTooltipWrap content={t("customTagsHint")} wide>
        {label}
      </DisabledTooltipWrap>
    );
  }

  return label;
}

export function MusicStyleChips({
  value,
  maxLength,
  onChange,
  showLabel = true,
  allowCustomStyles = true,
}: MusicStyleChipsProps) {
  const t = useTranslations("MusicCreate.styles");
  const selectedCount = parseStyleTags(value).length;

  return (
    <div className="mt-2">
      {showLabel ? (
        <span className={mc.fieldLabel} id="music-style-label">
          {t("sectionLabel")}
        </span>
      ) : null}
      <div
        aria-labelledby={showLabel ? "music-style-label" : undefined}
        className={cn(mc.chipRow, "mt-2")}
        role="group"
      >
        <MusicComboStyleChip maxLength={maxLength} value={value} onChange={onChange} />
        {MUSIC_STYLE_CHIP_OPTIONS.map((chip) => {
          const selected = isStyleChipSelected(value, chip);
          const lockedByPlan = !allowCustomStyles;
          const disabled =
            lockedByPlan ||
            isStyleChipDisabled(value, chip, MAX_SELECTED_STYLE_CHIPS, maxLength);

          return (
            <StyleChipOption
              key={chip}
              chip={chip}
              disabled={disabled}
              lockedByPlan={lockedByPlan}
              selected={selected}
              onToggle={() =>
                onChange(toggleStyleChip(value, chip, MAX_SELECTED_STYLE_CHIPS, maxLength))
              }
            />
          );
        })}
      </div>
      {allowCustomStyles ? (
        <p className={cn(mc.styleHint, "mt-2")}>
          {t("recommendedHint", {
            min: RECOMMENDED_STYLE_CHIPS_MIN,
            max: MAX_SELECTED_STYLE_CHIPS,
            selected: selectedCount,
          })}
        </p>
      ) : (
        <p className={cn(mc.styleHint, "mt-2")}>{t("freeComboOnly")}</p>
      )}
    </div>
  );
}
