"use client";

import {
  buildApiErrorTranslations,
  parseApiError,
  type ParseApiErrorOptions,
} from "@/shared/lib/parse-api-error";
import type { MusicLyricsStatusResponseDto } from "@ai-music/shared";
import {
  buildLyricsLanguageInstruction,
  checkContentAllowed,
  formatCreditsFromUnits,
  isVocalGender,
  LYRICS_LANGUAGE_ENGLISH_NAMES,
  OPERATION_COST_UNITS,
  resolveLyricsBriefMaxLength,
  truncateLyricsForDuration,
  unitsToCredits,
  type LyricsLanguage,
  type ResolvedLyricsLanguage,
} from "@ai-music/shared";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { useInvalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";
import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import { AiProcessingStatus } from "@/shared/ui/elevenlabs/ai-processing-status";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { useApi } from "@/shared/providers/api-provider";
import { mc } from "@/features/music-create/music-create-classes";
import { CharCounter } from "@/features/music-create/components/music-create-icons";
import { DisabledTooltipWrap } from "@/shared/ui/tooltip";
import { cn } from "@/lib/utils";

const LYRICS_POLL_INTERVAL_MS = 5_000;

interface MusicLyricsFromPromptProps {
  configured: boolean;
  disabled?: boolean;
  lockedHint?: string;
  lyricsBrief: string;
  lyricsDurationHint: string;
  lyricsDurationSec: number;
  lyricsLanguage: LyricsLanguage;
  onLyricsBriefChange: (value: string) => void;
  onApply: (text: string, suggestedTitle?: string) => void;
}

function sampleResolvedLanguage(lyricsLanguage: LyricsLanguage): ResolvedLyricsLanguage {
  if (lyricsLanguage === "auto") {
    return {
      code: "en",
      englishName: LYRICS_LANGUAGE_ENGLISH_NAMES.en,
      source: "default_fallback",
    };
  }

  return {
    code: lyricsLanguage,
    englishName: LYRICS_LANGUAGE_ENGLISH_NAMES[lyricsLanguage],
    source: "explicit_selection",
  };
}

function isLyricsStatusTerminal(data: MusicLyricsStatusResponseDto | undefined): boolean {
  // undefined = still waiting for the first status response — keep busy/polling.
  return data?.status === "completed" || data?.status === "failed";
}

interface PollErrorMessages {
  generateLyricsFailed: string;
  lyricsGenerationFailed: string;
  lyricsEmpty: string;
  translations: ParseApiErrorOptions["translations"];
}

function resolvePollError(
  queryError: Error | null,
  data: MusicLyricsStatusResponseDto | undefined,
  messages: PollErrorMessages,
): string | null {
  if (queryError) {
    return parseApiError(queryError, messages.generateLyricsFailed, {
      translations: messages.translations,
    });
  }

  if (!data || data.status === "pending" || data.status === "processing") {
    return null;
  }

  if (data.status === "failed") {
    return data.errorMessage ?? messages.lyricsGenerationFailed;
  }

  if ((data.lyrics ?? []).length === 0) {
    return messages.lyricsEmpty;
  }

  return null;
}

export function MusicLyricsFromPrompt({
  configured,
  disabled = false,
  lockedHint,
  lyricsBrief,
  lyricsDurationHint,
  lyricsDurationSec,
  lyricsLanguage,
  onLyricsBriefChange,
  onApply,
}: MusicLyricsFromPromptProps) {
  const t = useTranslations("MusicCreate");
  const tValidation = useTranslations("Validation");
  const tErrors = useTranslations("Errors");
  const locale = useLocale();
  const errorTranslations = useMemo(() => buildApiErrorTranslations(tErrors), [tErrors]);
  const api = useApi();
  const authReady = useAuthReady();
  const invalidateCreditsBalance = useInvalidateCreditsBalance();
  const subscriptionQuery = useSubscriptionQuery();
  const userQuery = useQuery({
    queryKey: ["users", "me"],
    queryFn: () => api.users.getMe(),
    enabled: authReady,
  });
  const vocalGender = useMemo(() => {
    const gender = userQuery.data?.vocalGender;
    return gender && isVocalGender(gender) ? gender : null;
  }, [userQuery.data?.vocalGender]);
  const sampleLanguage = sampleResolvedLanguage(lyricsLanguage);
  const briefMaxLength = resolveLyricsBriefMaxLength(
    vocalGender,
    lyricsDurationSec,
    buildLyricsLanguageInstruction(sampleLanguage).length,
    lyricsLanguage === "auto" ? null : sampleLanguage.code,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lyricsTaskId, setLyricsTaskId] = useState<string | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const appliedCompletionRef = useRef<string | null>(null);

  const applyVariant = useCallback(
    (items: Array<{ title: string; text: string }>, index: number) => {
      const variant = items[index];
      if (!variant) {
        return;
      }

      setSelectedVariantIndex(index);
      onApply(
        truncateLyricsForDuration(variant.text, lyricsDurationSec),
        variant.title,
      );
    },
    [lyricsDurationSec, onApply],
  );

  const lyricsStatusQuery = usePollingQuery({
    queryKey: ["music-lyrics-status", lyricsTaskId, lyricsDurationSec],
    queryFn: () => api.music.lyricsStatus(lyricsTaskId!, lyricsDurationSec),
    enabled: Boolean(lyricsTaskId),
    isTerminal: isLyricsStatusTerminal,
    intervalMs: LYRICS_POLL_INTERVAL_MS,
  });

  const pollError = resolvePollError(lyricsStatusQuery.error, lyricsStatusQuery.data, {
    generateLyricsFailed: tErrors("generateLyricsFailed"),
    lyricsGenerationFailed: tErrors("lyricsGenerationFailed"),
    lyricsEmpty: tErrors("lyricsEmpty"),
    translations: errorTranslations,
  });
  const displayError = submitError ?? pollError;

  const variants = useMemo(() => {
    const body = lyricsStatusQuery.data;
    if (!lyricsTaskId || !body || body.status !== "completed") {
      return [];
    }

    return body.lyrics ?? [];
  }, [lyricsTaskId, lyricsStatusQuery.data]);

  useEffect(() => {
    const body = lyricsStatusQuery.data;
    if (!lyricsTaskId || !body || body.status !== "completed") {
      return;
    }

    const items = body.lyrics ?? [];
    if (items.length === 0) {
      return;
    }

    const completionKey = `${lyricsTaskId}:${body.taskId}`;
    if (appliedCompletionRef.current === completionKey) {
      return;
    }

    appliedCompletionRef.current = completionKey;
    const firstVariant = items[0];
    onApply(
      truncateLyricsForDuration(firstVariant.text, lyricsDurationSec),
      firstVariant.title,
    );
  }, [lyricsDurationSec, lyricsStatusQuery.data, lyricsTaskId, onApply]);

  useEffect(() => {
    const body = lyricsStatusQuery.data;
    if (!lyricsTaskId || !body) {
      return;
    }

    if (body.status === "failed") {
      void invalidateCreditsBalance();
    }
  }, [invalidateCreditsBalance, lyricsStatusQuery.data, lyricsTaskId]);

  async function handleGenerate() {
    const prompt = lyricsBrief.trim();

    if (!prompt) {
      setSubmitError(tValidation("lyricsBriefRequired"));
      return;
    }

    const moderationResult = checkContentAllowed(prompt);
    if (!moderationResult.allowed) {
      setSubmitError(tErrors("contentModeration"));
      return;
    }

    setSubmitError(null);
    setIsGenerating(true);
    setSelectedVariantIndex(0);
    appliedCompletionRef.current = null;
    // Drop previous task so UI does not briefly treat stale completed data as idle.
    setLyricsTaskId(null);

    try {
      const body = await api.music.generateLyrics({
        prompt,
        durationSec: lyricsDurationSec,
        lyricsLanguage,
        uiLocale: locale,
      });
      setLyricsTaskId(body.taskId);
      void invalidateCreditsBalance();
    } catch (generateError) {
      setSubmitError(
        parseApiError(generateError, tErrors("generateLyricsFailed"), {
          translations: errorTranslations,
        }),
      );
      setIsGenerating(false);
      return;
    }

    setIsGenerating(false);
  }

  const isPolling =
    Boolean(lyricsTaskId) &&
    !lyricsStatusQuery.error &&
    !isLyricsStatusTerminal(lyricsStatusQuery.data);
  const isBusy = isGenerating || isPolling;
  const lockedByManualLyrics = disabled && !isBusy;
  const creditsBalance = subscriptionQuery.data?.creditsBalance ?? 0;
  const lyricsCostCredits = unitsToCredits(OPERATION_COST_UNITS.generateText);
  const hasEnoughCredits = creditsBalance >= lyricsCostCredits;
  const fieldDisabled = isBusy || disabled;
  const canGenerate =
    configured && !fieldDisabled && lyricsBrief.trim().length > 0 && hasEnoughCredits;
  const durationHint = lyricsDurationHint;
  const genderHint = vocalGender
    ? t("lyricsFromPrompt.genderLocked", { gender: t(`gender.${vocalGender}`) })
    : t("lyricsFromPrompt.genderMissing");

  const briefTextarea = (
    <textarea
      aria-describedby={lockedByManualLyrics && lockedHint ? "prompt-lyrics-locked-hint" : undefined}
      className={cn(mc.textarea, "h-20", fieldDisabled && !isBusy && mc.fieldDisabled)}
      disabled={fieldDisabled}
      maxLength={briefMaxLength}
      placeholder={t("lyricsFromPrompt.placeholder")}
      value={lyricsBrief}
      onChange={(event) => onLyricsBriefChange(event.target.value)}
    />
  );

  return (
    <div className={mc.lyricsBlock}>
      <label className="block">
        <span className={mc.lyricsPromptLabel}>{t("lyricsFromPrompt.hint")}</span>
        <div className="relative mt-2">
          {lockedByManualLyrics && lockedHint ? (
            <DisabledTooltipWrap block content={lockedHint} wide>
              <div className="w-full">{briefTextarea}</div>
            </DisabledTooltipWrap>
          ) : (
            briefTextarea
          )}
          <div className={mc.counterPos}>
            <CharCounter current={lyricsBrief.length} max={briefMaxLength} />
          </div>
        </div>
        {lockedByManualLyrics && lockedHint ? (
          <p className={cn(mc.meta, "mt-2")} id="prompt-lyrics-locked-hint">
            {lockedHint}
          </p>
        ) : null}
        <p className={cn(mc.meta, "mt-2")}>{durationHint}</p>
        <p className={cn(mc.meta, "mt-1")}>{genderHint}</p>
        <p className={cn(mc.meta, "mt-1")}>
          {t("lyricsFromPrompt.costBalance", {
            cost: formatCreditsFromUnits(OPERATION_COST_UNITS.generateText),
            balance: creditsBalance,
          })}
          {!hasEnoughCredits ? (
            <>
              {" "}
              <Link className={mc.planNoticeLink} href="/pricing">
                {t("lyricsFromPrompt.topUp")}
              </Link>
            </>
          ) : null}
        </p>
      </label>

      <button
        className={cn(mc.secondaryButton, "mt-3")}
        disabled={!canGenerate}
        type="button"
        onClick={() => void handleGenerate()}
      >
        {isBusy
          ? isPolling
            ? t("lyricsFromPrompt.generating")
            : t("lyricsFromPrompt.starting")
          : t("lyricsFromPrompt.submit")}
      </button>

      {isBusy ? (
        <div className="mt-3">
          <AiProcessingStatus agentState="thinking" label={t("lyricsFromPrompt.aiWriting")} />
        </div>
      ) : null}

      {variants.length > 1 ? (
        <div className={cn(mc.lyricsVariants, "mt-3")}>
          <span className={mc.meta}>{t("lyricsFromPrompt.chooseVariant")}</span>
          <div className={mc.lyricsVariantList}>
            {variants.map((variant, index) => (
              <button
                key={`${variant.title}-${index}`}
                className={
                  index === selectedVariantIndex ? mc.lyricsVariantActive : mc.lyricsVariant
                }
                type="button"
                onClick={() => applyVariant(variants, index)}
              >
                {variant.title.trim() ||
                  t("lyricsFromPrompt.variantFallback", { index: index + 1 })}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {displayError ? <p className={cn(mc.errorInline, "mt-2")}>{displayError}</p> : null}
    </div>
  );
}
