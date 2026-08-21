"use client";

import { useTranslations } from "next-intl";
import { me } from "@/features/music-editor/music-editor-classes";
import { PlanGatedWrap } from "@/shared/ui/plan-gated";

interface EditorStemSeparationPanelProps {
  phase: "absent" | "processing" | "ready" | "failed" | "unavailable" | null;
  available: boolean;
  costCredits: number;
  masterMissing: boolean;
  disabled?: boolean;
  isStarting?: boolean;
  onSeparate: () => void;
}

export function EditorStemSeparationPanel({
  phase,
  available,
  costCredits,
  masterMissing,
  disabled = false,
  isStarting = false,
  onSeparate,
}: EditorStemSeparationPanelProps) {
  const t = useTranslations("Editor.stems");

  if (masterMissing) {
    return (
      <div className={me.stemNoticeCard} role="status">
        <p className={me.stemNoticeTitle}>{t("masterMissingTitle")}</p>
        <p className={me.stemNoticeMessage}>{t("masterMissingMessage")}</p>
      </div>
    );
  }

  if (phase === "ready" || phase === "failed" || phase === "processing") {
    return null;
  }

  if (phase === "unavailable") {
    return (
      <div className={me.stemNoticeCard} role="status">
        <p className={me.stemNoticeMessage}>{t("unavailableForProvider")}</p>
      </div>
    );
  }

  if (!available || phase !== "absent") {
    return null;
  }

  return (
    <div className={me.stemNoticeCard} role="status">
      <p className={me.stemNoticeMessage}>{t("absentHint")}</p>
      <div className={me.stemNoticeActions}>
        <PlanGatedWrap feature="stemSeparation">
          <button
            className={me.primaryButton}
            disabled={disabled || isStarting}
            type="button"
            onClick={onSeparate}
          >
            {isStarting
              ? t("separating")
              : t("separateCta", { cost: costCredits })}
          </button>
        </PlanGatedWrap>
      </div>
    </div>
  );
}
