"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MUSIC_COMBO_STYLE_PRESETS,
  findComboStylePreset,
  type MusicComboStylePreset,
} from "./music-combo-style-presets";
import { resolveComboStyleMessageKey } from "@/features/music-create/combo-style-message-keys";
import { mc } from "@/features/music-create/music-create-classes";
import { Tooltip } from "@/shared/ui/tooltip";
import { cn } from "@/lib/utils";

interface MusicComboStyleChipProps {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}

export function MusicComboStyleChip({ value, maxLength, onChange }: MusicComboStyleChipProps) {
  const t = useTranslations("MusicCreate");
  const [open, setOpen] = useState(false);
  const activePreset = findComboStylePreset(value);

  function handleSelect(preset: MusicComboStylePreset) {
    if (preset.style.length <= maxLength) {
      onChange(preset.style);
    }

    setOpen(false);
  }

  const chipClassName = open || activePreset ? mc.chipSelected : mc.chip;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip content={t("styles.comboMismatchTooltip")} wide>
        <DropdownMenuTrigger className={chipClassName} type="button">
          {t("styles.comboTrigger")}
        </DropdownMenuTrigger>
      </Tooltip>

      <DropdownMenuContent
        align="end"
        className={cn(
          "min-w-[15rem] max-w-[min(20rem,90vw)] rounded-xl border-none bg-[#c6ddf7] p-2 shadow-lg",
        )}
      >
        {MUSIC_COMBO_STYLE_PRESETS.map((preset) => {
          const messageKey = resolveComboStyleMessageKey(preset);
          const label = messageKey ? t(`comboStyles.${messageKey}`) : preset.label;

          return (
            <DropdownMenuItem
              key={preset.label}
              className={
                activePreset?.label === preset.label
                  ? mc.comboPanelItemActive
                  : mc.comboPanelItem
              }
              onClick={() => handleSelect(preset)}
            >
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
