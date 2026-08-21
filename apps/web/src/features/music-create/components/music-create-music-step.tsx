"use client";

import type { GenerateSongInput } from "@/features/music-create/hooks/use-music-generation";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { mc } from "@/features/music-create/music-create-classes";
import { MusicStyleChips } from "@/features/music-create/music-style-chips-panel";
import {
  CharCounter,
  IconChevronDown,
  IconChevronLeft,
  IconClock,
  IconWand,
} from "@/features/music-create/components/music-create-icons";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ALL_DURATION_OPTIONS,
  FREE_TIER_DEFAULT_COMBO_STYLE,
  FREE_TIER_DEFAULT_DURATION_SEC,
  canAffordTrackGeneration,
  checkContentAllowed,
  formatCreditsFromUnits,
  getDurationOptionsForPlan,
  isComboStylePreset,
  isDurationAllowedForPlan,
  isVocalGender,
  resolveMusicGenerateCostUnits,
  resolveLyricsDurationSecForPlan,
  resolveManualLyricsMaxLength,
  type LyricsLanguage,
} from "@ai-music/shared";
import {
  formatLocalizedDurationHintSec,
  formatLocalizedDurationOptionLabel,
} from "@/features/music-create/localized-duration";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/shared/providers/api-provider";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { useEffect, useState } from "react";

const STYLE_MAX_LENGTH = 200;
const TITLE_MAX_LENGTH = 100;

interface MusicCreateMusicStepProps {
  configured: boolean | null;
  canGenerateWithVoice: boolean;
  isBusy: boolean;
  isGenerating: boolean;
  title: string;
  style: string;
  prompt: string;
  durationSec: number;
  lyricsLanguage: LyricsLanguage;
  voiceProfileId: string | null;
  personalVoiceEnabled: boolean;
  usePersonalVoice: boolean;
  onTitleChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onBack: () => void;
  onGenerate: (input: GenerateSongInput) => void;
  onUsePersonalVoiceChange: (value: boolean) => void;
}

export function MusicCreateMusicStep({
  configured,
  canGenerateWithVoice,
  isBusy,
  isGenerating,
  title,
  style,
  prompt,
  durationSec,
  lyricsLanguage,
  voiceProfileId,
  personalVoiceEnabled,
  usePersonalVoice,
  onTitleChange,
  onStyleChange,
  onPromptChange,
  onDurationChange,
  onBack,
  onGenerate,
  onUsePersonalVoiceChange,
}: MusicCreateMusicStepProps) {
  const t = useTranslations("MusicCreate");
  const tErrors = useTranslations("Errors");
  const tValidation = useTranslations("Validation");
  const api = useApi();
  const authReady = useAuthReady();
  const userQuery = useQuery({
    queryKey: ["users", "me"],
    queryFn: () => api.users.getMe(),
    enabled: authReady,
  });
  const vocalGender =
    userQuery.data?.vocalGender && isVocalGender(userQuery.data.vocalGender)
      ? userQuery.data.vocalGender
      : null;
  const subscriptionQuery = useSubscriptionQuery();
  const planId = subscriptionQuery.data?.planId ?? "free";
  const isSimplifiedGeneration =
    subscriptionQuery.data?.entitlements.features.musicGeneration === "simplified";
  const allowedDurationOptions = getDurationOptionsForPlan(planId);
  const creditsBalance = subscriptionQuery.data?.creditsBalance ?? 0;
  const generationCostUnits = resolveMusicGenerateCostUnits({
    usePersonalVoice,
  });
  const hasEnoughCredits = canAffordTrackGeneration(creditsBalance, generationCostUnits);
  const [durationNotice, setDurationNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isSimplifiedGeneration) {
      return;
    }

    if (!isDurationAllowedForPlan(planId, durationSec)) {
      onDurationChange(FREE_TIER_DEFAULT_DURATION_SEC);
    }
  }, [durationSec, isSimplifiedGeneration, onDurationChange, planId]);

  useEffect(() => {
    if (!isSimplifiedGeneration) {
      return;
    }

    if (!isComboStylePreset(style)) {
      onStyleChange(FREE_TIER_DEFAULT_COMBO_STYLE);
    }
  }, [isSimplifiedGeneration, onStyleChange, style]);

  function handleDurationChange(nextValue: number) {
    if (!isDurationAllowedForPlan(planId, nextValue)) {
      setDurationNotice(t("musicStep.durationLockedHint"));
      onDurationChange(FREE_TIER_DEFAULT_DURATION_SEC);
      return;
    }

    setDurationNotice(null);
    onDurationChange(nextValue);
  }

  const lyricsDurationSec = resolveLyricsDurationSecForPlan(planId, durationSec);
  const manualLyricsMaxLength = resolveManualLyricsMaxLength(planId, durationSec);
  const trimmedPrompt = prompt.trim();
  const hasManualLyrics = trimmedPrompt.length > 0;
  const lyricsModerationResult = checkContentAllowed(prompt);
  const lyricsModerationError =
    hasManualLyrics && !lyricsModerationResult.allowed
      ? tErrors("contentModeration")
      : null;
  const lyricsLengthError =
    hasManualLyrics && trimmedPrompt.length > manualLyricsMaxLength
      ? tValidation("lyricsTooLong", {
          seconds: lyricsDurationSec,
          max: manualLyricsMaxLength,
        })
      : null;
  const hasLyricsError = Boolean(lyricsLengthError || lyricsModerationError);

  return (
    <div className={mc.fieldStack}>
      <div className={mc.wizardStepHeader}>
        <span className={mc.wizardStepBadge}>{t("stepOf", { current: 2, total: 2 })}</span>
        <h2 className={mc.wizardStepTitle}>{t("musicStep.title")}</h2>
        <p className={mc.wizardStepHint}>
          {vocalGender
            ? t("musicStep.descriptionWithGender", { gender: t(`gender.${vocalGender}`) })
            : t("musicStep.description")}
        </p>
      </div>

      <label className="block">
        <span className={mc.fieldLabel}>{t("musicStep.lyricsLabel")}</span>
        <div className="relative w-full">
          <textarea
            className={cn(mc.textareaLarge, isBusy && mc.fieldDisabled)}
            disabled={isBusy}
            maxLength={manualLyricsMaxLength}
            placeholder={t("lyricsStep.manualPlaceholder")}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
          />
          <div className={mc.counterPosLarge}>
            <CharCounter current={prompt.length} max={manualLyricsMaxLength} />
          </div>
        </div>
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
        {lyricsLengthError ? (
          <p className={cn(mc.errorInline, "mt-2")} role="alert">
            {lyricsLengthError}
          </p>
        ) : null}
        {lyricsModerationError ? (
          <p className={cn(mc.errorInline, "mt-2")} role="alert">
            {lyricsModerationError}
          </p>
        ) : null}
      </label>

      <label className="block">
        <span className={mc.fieldLabel}>{t("musicStep.titleLabel")}</span>
        <input
          className={mc.input}
          maxLength={TITLE_MAX_LENGTH}
          placeholder={t("musicStep.titlePlaceholder")}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>

      <div>
        <span className={mc.fieldLabel} id="music-style-label">
          {t("musicStep.styleLabel")}
        </span>
        <MusicStyleChips
          allowCustomStyles={!isSimplifiedGeneration}
          maxLength={STYLE_MAX_LENGTH}
          showLabel={false}
          value={style}
          onChange={onStyleChange}
        />
        <div className="relative mt-2">
          <textarea
            aria-labelledby="music-style-label"
            className={cn(
              mc.textarea,
              mc.textareaStyle,
              isSimplifiedGeneration && mc.styleReadonly,
            )}
            disabled={isSimplifiedGeneration}
            maxLength={STYLE_MAX_LENGTH}
            placeholder={t("musicStep.stylePlaceholder")}
            readOnly={isSimplifiedGeneration}
            value={style}
            onChange={(event) => onStyleChange(event.target.value)}
          />
          <div className={mc.counterPos}>
            <CharCounter current={style.length} max={STYLE_MAX_LENGTH} />
          </div>
        </div>
      </div>

      <label className="block">
        <span className={mc.fieldLabel}>{t("musicStep.durationLabel")}</span>
        <div className={mc.durationWrap}>
          <span aria-hidden="true" className={mc.durationIcon}>
            <IconClock />
          </span>
          <select
            className={mc.select}
            value={durationSec}
            onChange={(event) => handleDurationChange(Number(event.target.value))}
          >
            {ALL_DURATION_OPTIONS.map((value) => {
              const isAllowed = allowedDurationOptions.includes(value);
              const label = formatLocalizedDurationOptionLabel(t, value, planId);

              return (
                <option key={value} disabled={!isAllowed} value={value}>
                  {isAllowed ? label : `${label} (${t("musicStep.paidPlanHint")})`}
                </option>
              );
            })}
          </select>
          <span aria-hidden="true" className={mc.durationChevron}>
            <IconChevronDown />
          </span>
        </div>
        {isSimplifiedGeneration ? (
          <p className={cn(mc.styleHint, "mt-2")}>{t("musicStep.freeDurationOnly")}</p>
        ) : null}
        {durationNotice ? (
          <p className={cn(mc.planNotice, "mt-2")} role="status">
            {durationNotice}{" "}
            <Link className={mc.planNoticeLink} href="/pricing">
              {t("musicStep.pricingLink")}
            </Link>
          </p>
        ) : null}
      </label>

      {personalVoiceEnabled && voiceProfileId ? (
        <div className={mc.personalVoiceToggleGroup}>
          <label className={mc.personalVoiceToggle}>
            <input
              checked={usePersonalVoice}
              className={mc.personalVoiceCheckbox}
              disabled={isBusy}
              type="checkbox"
              onChange={(event) =>
                onUsePersonalVoiceChange(event.target.checked)
              }
            />
            <span className={mc.personalVoiceToggleText}>
              <span className={mc.personalVoiceToggleTitle}>
                {t("musicStep.personalVoiceLabel")}
              </span>
              <span className={mc.personalVoiceToggleHint}>
                {usePersonalVoice
                  ? t("musicStep.personalVoiceEnabledHint")
                  : t("musicStep.personalVoiceDisabledHint")}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <p className={mc.generationCostHint}>
        {t("musicStep.costBalance", {
          cost: formatCreditsFromUnits(generationCostUnits),
          balance: creditsBalance,
        })}
        {!hasEnoughCredits ? (
          <>
            {" "}
            <Link className={mc.planNoticeLink} href="/pricing">
              {t("musicStep.topUp")}
            </Link>
          </>
        ) : null}
      </p>

      <div className={mc.wizardActions}>
        <button
          className={cn(mc.secondaryButton, "inline-flex items-center justify-center gap-2")}
          disabled={isBusy}
          type="button"
          onClick={onBack}
        >
          <IconChevronLeft />
          {t("musicStep.backToLyrics")}
        </button>
        <button
          className={cn(mc.submit, "inline-flex items-center justify-center gap-2")}
          disabled={
            isBusy ||
            configured !== true ||
            !canGenerateWithVoice ||
            !prompt.trim() ||
            !hasEnoughCredits ||
            hasLyricsError
          }
          type="button"
          onClick={() =>
            void onGenerate({
              prompt,
              style,
              title,
              durationSec,
              voiceSampleId: null,
              voiceProfileId: usePersonalVoice ? voiceProfileId : null,
              usePersonalVoice,
              lyricsLanguage,
            })
          }
        >
          {isGenerating ? (
            <>
              <span aria-hidden="true" className={mc.submitSpinner} />
              {t("musicStep.starting")}
            </>
          ) : (
            <>
              <IconWand />
              {t("musicStep.submit")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
