"use client";

import { useTranslations } from "next-intl";
import { Tooltip, DisabledTooltipWrap } from "@/shared/ui/tooltip";
import { me } from "@/features/music-editor/music-editor-classes";

interface RegionToolbarProps {
  disabled: boolean;
  regionSelected: boolean;
  lockedAdvancedOps?: boolean;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFadeIn: () => void;
  onFadeOut: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}

function RegionActionButton({
  label,
  tooltip,
  disabled,
  onClick,
  variant = "default",
}: {
  label: string;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
  variant?: "default" | "destructive";
}) {
  const className =
    variant === "destructive" ? me.toolButtonDestructive : me.toolButton;

  const button = (
    <button className={className} disabled={disabled} type="button" onClick={onClick}>
      {label}
    </button>
  );

  if (disabled) {
    return <DisabledTooltipWrap content={tooltip}>{button}</DisabledTooltipWrap>;
  }

  return <Tooltip content={tooltip}>{button}</Tooltip>;
}

export function RegionToolbar({
  disabled,
  regionSelected,
  lockedAdvancedOps = false,
  onSplit,
  onDelete,
  onDuplicate,
  onFadeIn,
  onFadeOut,
  onMoveLeft,
  onMoveRight,
}: RegionToolbarProps) {
  const t = useTranslations("Editor.region");
  const actionsDisabled = disabled || !regionSelected;
  const advancedLockedTooltip = t("advancedLocked");

  return (
    <div className={me.panel}>
      <h3 className={me.panelTitle}>{t("panelTitle")}</h3>

      {!regionSelected ? <p className={me.panelHint}>{t("selectFirst")}</p> : null}

      <div className={me.toolbarSection}>
        <div className={me.toolbarGrid}>
          <RegionActionButton
            disabled={actionsDisabled}
            label={t("split")}
            tooltip={t("splitTooltip")}
            onClick={onSplit}
          />
          <RegionActionButton
            disabled={actionsDisabled || lockedAdvancedOps}
            label={t("delete")}
            tooltip={lockedAdvancedOps ? advancedLockedTooltip : t("deleteTooltip")}
            variant="destructive"
            onClick={onDelete}
          />
          <RegionActionButton
            disabled={actionsDisabled || lockedAdvancedOps}
            label={t("duplicate")}
            tooltip={lockedAdvancedOps ? advancedLockedTooltip : t("duplicateTooltip")}
            onClick={onDuplicate}
          />
          <RegionActionButton
            disabled={actionsDisabled}
            label={t("fadeIn")}
            tooltip={t("fadeInTooltip")}
            onClick={onFadeIn}
          />
          <RegionActionButton
            disabled={actionsDisabled}
            label={t("fadeOut")}
            tooltip={t("fadeOutTooltip")}
            onClick={onFadeOut}
          />
          <RegionActionButton
            disabled={actionsDisabled}
            label={t("moveLeft")}
            tooltip={t("moveLeftTooltip")}
            onClick={onMoveLeft}
          />
          <RegionActionButton
            disabled={actionsDisabled}
            label={t("moveRight")}
            tooltip={t("moveRightTooltip")}
            onClick={onMoveRight}
          />
        </div>
      </div>
    </div>
  );
}
