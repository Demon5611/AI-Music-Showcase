"use client";

import { useTranslations } from "next-intl";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { mc } from "@/features/music-create/music-create-classes";
import { MusicLyricsFromPrompt } from "@/features/music-create/music-lyrics-from-prompt";
import {
  CharCounter,
  IconChevronRight,
} from "@/features/music-create/components/music-create-icons";
import { cn } from "@/lib/utils";
import {
  checkContentAllowed,
  resolveLyricsDurationSecForPlan,
  resolveManualLyricsMaxLength,
  type LyricsLanguage,
} from "@ai-music/shared";
import {
  formatLocalizedDurationHintSec,
  resolveLocalizedLyricsDurationHint,
} from "@/features/music-create/localized-duration";
import { DisabledTooltipWrap } from "@/shared/ui/tooltip";
import { LyricsLanguageSelect } from "@/features/music-create/components/lyrics-language-select";

interface MusicCreateLyricsStepProps {
  configured: boolean | null;
  durationSec: number;
  isBusy: boolean;
  lyricsBrief: string;
  lyricsLanguage: LyricsLanguage;
  prompt: string;
  onLyricsBriefChange: (value: string) => void;
  onLyricsLanguageChange: (value: LyricsLanguage) => void;
  onManualLyricsChange: (value: string) => void;
  onApplyGeneratedLyrics: (text: string, suggestedTitle?: string) => void;
  onContinue: () => void;
}

export function MusicCreateLyricsStep({
  configured,
  durationSec,
  isBusy,
  lyricsBrief,
  lyricsLanguage,
  prompt,
  onLyricsBriefChange,
  onLyricsLanguageChange,
  onManualLyricsChange,
  onApplyGeneratedLyrics,
  onContinue,
}: MusicCreateLyricsStepProps) {
  const t = useTranslations("MusicCreate");
  const tCommon = useTranslations("Common");
  const tValidation = useTranslations("Validation");
  const tErrors = useTranslations("Errors");
  const manualLyricsLockedHint = t("lyricsStep.clearBriefFirst");
  const promptLyricsLockedHint = t("lyricsStep.clearLyricsFirst");
  const subscriptionQuery = useSubscriptionQuery();
  const planId = subscriptionQuery.data?.planId ?? "free";
  const isSimplifiedGeneration =
    subscriptionQuery.data?.entitlements.features.musicGeneration === "simplified";
  const lyricsDurationSec = resolveLyricsDurationSecForPlan(planId, durationSec);
  const lyricsDurationHint = resolveLocalizedLyricsDurationHint(t, planId, durationSec);
  const manualLyricsMaxLength = resolveManualLyricsMaxLength(planId, durationSec);
  const hasLyricsBrief = lyricsBrief.trim().length > 0;
  const hasManualLyrics = prompt.trim().length > 0;
  const manualLyricsLocked = hasLyricsBrief && !hasManualLyrics;
  const manualLyricsModerationResult = checkContentAllowed(prompt);
  const manualLyricsModerationError = manualLyricsModerationResult.allowed
    ? null
    : tErrors("contentModeration");
  const manualLyricsLengthError =
    hasManualLyrics && prompt.trim().length > manualLyricsMaxLength
      ? tValidation("lyricsTooLong", {
          seconds: lyricsDurationSec,
          max: manualLyricsMaxLength,
        })
      : null;
  const canContinue =
    hasManualLyrics && !manualLyricsModerationError && !manualLyricsLengthError;

  function handleContinue() {
    if (manualLyricsModerationError || manualLyricsLengthError) {
      return;
    }

    onContinue();
  }

  return (
    <div className={mc.fieldStack}>
      <div className={mc.wizardStepHeader}>
        <span className={mc.wizardStepBadge}>{t("stepOf", { current: 1, total: 2 })}</span>
        <h2 className={mc.wizardStepTitle}>{t("lyricsStep.title")}</h2>
        <p className={mc.wizardStepHint}>{t("lyricsStep.description")}</p>
      </div>

      <LyricsLanguageSelect
        value={lyricsLanguage}
        disabled={isBusy}
        onChange={onLyricsLanguageChange}
      />

      <MusicLyricsFromPrompt
        configured={configured === true}
        disabled={isBusy || hasManualLyrics}
        lockedHint={promptLyricsLockedHint}
        lyricsBrief={lyricsBrief}
        lyricsDurationHint={lyricsDurationHint}
        lyricsDurationSec={lyricsDurationSec}
        lyricsLanguage={lyricsLanguage}
        onLyricsBriefChange={onLyricsBriefChange}
        onApply={onApplyGeneratedLyrics}
      />

      <p className={mc.lyricsOrDivider} aria-hidden>
        {tCommon("or")}
      </p>

      <label className="block">
        <span className={mc.fieldLabel}>{t("lyricsStep.manualLabel")}</span>
        {manualLyricsLocked ? (
          <DisabledTooltipWrap block content={manualLyricsLockedHint} wide>
            <div className="relative w-full">
              <textarea
                aria-describedby="manual-lyrics-locked-hint"
                className={cn(mc.textareaLarge, mc.fieldDisabled)}
                disabled
                maxLength={manualLyricsMaxLength}
                placeholder={t("lyricsStep.manualPlaceholder")}
                value={prompt}
              />
              <div className={mc.counterPosLarge}>
                <CharCounter current={prompt.length} max={manualLyricsMaxLength} />
              </div>
            </div>
          </DisabledTooltipWrap>
        ) : (
          <div className="relative w-full">
            <textarea
              className={cn(mc.textareaLarge, isBusy && mc.fieldDisabled)}
              disabled={isBusy}
              maxLength={manualLyricsMaxLength}
              placeholder={t("lyricsStep.manualPlaceholder")}
              value={prompt}
              onChange={(event) => onManualLyricsChange(event.target.value)}
            />
            <div className={mc.counterPosLarge}>
              <CharCounter current={prompt.length} max={manualLyricsMaxLength} />
            </div>
          </div>
        )}
        <p className={cn(mc.meta, "mt-2")}>
          {isSimplifiedGeneration
            ? t("lyricsStep.limitFree", {
                max: manualLyricsMaxLength,
                durationHint: formatLocalizedDurationHintSec(t, lyricsDurationSec),
              })
            : t("lyricsStep.limitPaid", {
                max: manualLyricsMaxLength,
                durationHint: formatLocalizedDurationHintSec(t, lyricsDurationSec),
              })}
        </p>
        {manualLyricsLocked ? (
          <p className={cn(mc.meta, "mt-1")} id="manual-lyrics-locked-hint">
            {manualLyricsLockedHint}
          </p>
        ) : null}
        {manualLyricsLengthError ? (
          <p className={cn(mc.errorInline, "mt-2")} role="alert">
            {manualLyricsLengthError}
          </p>
        ) : null}
        {hasManualLyrics && manualLyricsModerationError ? (
          <p className={cn(mc.errorInline, "mt-2")} role="alert">
            {manualLyricsModerationError}
          </p>
        ) : null}
      </label>

      <button
        className={cn(mc.submit, "inline-flex items-center justify-center gap-2")}
        disabled={isBusy || !canContinue}
        type="button"
        onClick={handleContinue}
      >
        {t("lyricsStep.continueToMusic")}
        <IconChevronRight />
      </button>
    </div>
  );
}
