"use client";

import { parseStemSeparationNotice } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { me } from "@/features/music-editor/music-editor-classes";
import { PlanGatedWrap } from "@/shared/ui/plan-gated";

interface EditorStemNoticeProps {
  notice: string;
  disabled?: boolean;
  isRetrying?: boolean;
  onRetry: () => void;
}

export function EditorStemNotice({
  notice,
  disabled = false,
  isRetrying = false,
  onRetry,
}: EditorStemNoticeProps) {
  const t = useTranslations("Editor.stems");
  const parsedNotice = parseStemSeparationNotice(notice);

  if (!parsedNotice) {
    return null;
  }

  const isPlanRestricted = parsedNotice.kind === "plan_restricted";

  return (
    <div className={me.stemNoticeCard} role="status">
      <p className={me.stemNoticeTitle}>
        {isPlanRestricted ? t("planRestrictedTitle") : t("failedTitle")}
      </p>
      <p className={me.stemNoticeMessage}>
        {isPlanRestricted ? t("planRestrictedMessage") : t("failedMessage")}
      </p>
      <div className={me.stemNoticeActions}>
        {isPlanRestricted ? (
          <Link className={me.stemNoticeLink} href="/pricing">
            {t("viewPricing")}
          </Link>
        ) : (
          <PlanGatedWrap feature="stemSeparation">
            <button
              className={me.primaryButton}
              disabled={disabled || isRetrying}
              type="button"
              onClick={onRetry}
            >
              {isRetrying ? t("retrying") : t("retry")}
            </button>
          </PlanGatedWrap>
        )}
      </div>
    </div>
  );
}
