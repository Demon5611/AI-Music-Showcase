"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { consumeMusicCreateLyricsBriefDraft } from "@/shared/lib/music-create-prompt-transfer";
import { MusicCreateLyricsStep } from "@/features/music-create/components/music-create-lyrics-step";
import { MusicCreateMusicStep } from "@/features/music-create/components/music-create-music-step";
import { IconMusic } from "@/features/music-create/components/music-create-icons";
import { MusicCreateResults } from "@/features/music-create/components/music-create-results";
import { useMusicGeneration } from "@/features/music-create/hooks/use-music-generation";
import { usePersonalVoiceSelection } from "@/features/music-create/hooks/use-personal-voice-selection";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { resolveMusicCreateVoiceGate } from "@/features/music-create/utils/resolve-music-create-voice-gate";
import { mc } from "@/features/music-create/music-create-classes";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { mp } from "@/shared/theme/music-page-classes";
import { RequireAuth } from "@/shared/ui/require-auth";
import {
  FREE_TIER_DEFAULT_COMBO_STYLE,
  FREE_TIER_DEFAULT_DURATION_SEC,
  getDefaultDurationSecForPlan,
  type LyricsLanguage,
} from "@ai-music/shared";

const DEFAULT_TITLE = "Summer Friends";

type WizardStep = "lyrics" | "music";

export function MusicCreatePanel() {
  const t = useTranslations("MusicCreate");

  return (
    <RequireAuth hint={t("authHint")} title={t("authTitle")}>
      <MusicCreatePanelContent />
    </RequireAuth>
  );
}

function MusicCreatePanelContent() {
  const t = useTranslations("MusicCreate");
  const tErrors = useTranslations("Errors");
  const authReady = useAuthReady();
  const subscriptionQuery = useSubscriptionQuery();
  const [wizardStep, setWizardStep] = useState<WizardStep>("lyrics");
  const [durationSec, setDurationSec] = useState(FREE_TIER_DEFAULT_DURATION_SEC);
  const [lyricsBrief, setLyricsBrief] = useState(
    () => consumeMusicCreateLyricsBriefDraft() ?? "",
  );
  const [lyricsLanguage, setLyricsLanguage] = useState<LyricsLanguage>("auto");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(FREE_TIER_DEFAULT_COMBO_STYLE);
  const [title, setTitle] = useState(DEFAULT_TITLE);

  const {
    configured,
    statusLoadError,
    taskId,
    status,
    error,
    isGenerating,
    isDeletingTrack,
    isOpeningEditor,
    openingEditorTrackId,
    isPolling,
    isBusy,
    songTracks,
    generate,
    openEditor,
    deleteTrack,
  } = useMusicGeneration();

  const personalVoice = usePersonalVoiceSelection(authReady);
  const voiceGate = resolveMusicCreateVoiceGate({
    usePersonalVoice: personalVoice.usePersonalVoice,
    hasReadyPersonalVoice: Boolean(personalVoice.readyProfile),
    personalVoiceQueryError: personalVoice.isError,
  });

  useEffect(() => {
    if (!subscriptionQuery.data) {
      return;
    }

    setDurationSec(getDefaultDurationSecForPlan(subscriptionQuery.data.planId));

    if (subscriptionQuery.data.entitlements.features.musicGeneration === "simplified") {
      setStyle(FREE_TIER_DEFAULT_COMBO_STYLE);
    }
  }, [subscriptionQuery.data?.planId]);

  const handleLyricsBriefChange = useCallback((value: string) => {
    setLyricsBrief(value);
    if (value.trim()) {
      setPrompt("");
    }
  }, []);

  const handleManualLyricsChange = useCallback((value: string) => {
    setPrompt(value);
    if (value.trim()) {
      setLyricsBrief("");
    }
  }, []);

  const handleApplyGeneratedLyrics = useCallback(
    (text: string, suggestedTitle?: string) => {
      setLyricsBrief("");
      setPrompt(text);

      if (suggestedTitle?.trim() && !title.trim()) {
        setTitle(suggestedTitle.trim());
      }
    },
    [title],
  );

  return (
    <div className={mp.page}>
      <header className={mp.pageHeader}>
        <div className={mp.pageHeaderBrand}>
          <div className={mp.pageHeaderLogo}>
            <IconMusic />
          </div>
          <span className={mp.pageHeaderTitle}>{t("pageTitle")}</span>
        </div>
      </header>

      <main className={mp.pageMain}>
        {statusLoadError ? (
          <div className={mp.alertError} role="alert">
            {tErrors.rich("apiUnreachable", {
              status: statusLoadError,
              code: (chunks) => <code className={mp.inlineCode}>{chunks}</code>,
            })}
          </div>
        ) : null}

        {configured === false ? (
          <div className={mp.alertWarning} role="alert">
            {tErrors("musicNotConfigured")}
          </div>
        ) : null}

        {voiceGate.showPersonalVoiceBlocker && !personalVoice.isLoading ? (
          <div className={mp.alertWarning} role="alert">
            {t("personalVoiceNotReady")}{" "}
            <Link className={mc.voicePickerLink} href="/">
              {t("personalVoiceNotReadyLink")}
            </Link>
          </div>
        ) : null}

        {voiceGate.showPersonalVoiceLoadErrorHint ? (
          <p className={mc.cardHeaderSubtitle} role="status">
            {t("personalVoiceLoadErrorHint")}
          </p>
        ) : null}

        {personalVoice.usePersonalVoice && personalVoice.readyProfile ? (
          <p className={mc.cardHeaderSubtitle}>{t("personalVoiceReadyHint")}</p>
        ) : !personalVoice.usePersonalVoice && personalVoice.readyProfile ? (
          <p className={mc.cardHeaderSubtitle}>{t("personalVoiceOffReadyHint")}</p>
        ) : !personalVoice.usePersonalVoice ? (
          <p className={mc.cardHeaderSubtitle}>
            {t("standardVocalHint")}
            {voiceGate.showAddPersonalVoiceHint ? (
              <>
                {" "}
                {t("addPersonalVoiceHint")}{" "}
                <Link className={mc.voicePickerLink} href="/">
                  {t("addPersonalVoiceLink")}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <section className={mp.sectionCard}>
          {wizardStep === "lyrics" ? (
            <MusicCreateLyricsStep
              configured={configured}
              durationSec={durationSec}
              isBusy={isBusy}
              lyricsBrief={lyricsBrief}
              lyricsLanguage={lyricsLanguage}
              prompt={prompt}
              onApplyGeneratedLyrics={handleApplyGeneratedLyrics}
              onContinue={() => setWizardStep("music")}
              onLyricsBriefChange={handleLyricsBriefChange}
              onLyricsLanguageChange={setLyricsLanguage}
              onManualLyricsChange={handleManualLyricsChange}
            />
          ) : (
            <MusicCreateMusicStep
              canGenerateWithVoice={voiceGate.canGenerateWithSelectedVoice}
              configured={configured}
              durationSec={durationSec}
              isBusy={isBusy}
              isGenerating={isGenerating}
              lyricsLanguage={lyricsLanguage}
              prompt={prompt}
              style={style}
              title={title}
              voiceProfileId={personalVoice.readyProfile?.id ?? null}
              personalVoiceEnabled={personalVoice.enabled}
              usePersonalVoice={personalVoice.usePersonalVoice}
              onBack={() => setWizardStep("lyrics")}
              onDurationChange={setDurationSec}
              onGenerate={(input) => void generate(input)}
              onPromptChange={handleManualLyricsChange}
              onStyleChange={setStyle}
              onTitleChange={setTitle}
              onUsePersonalVoiceChange={personalVoice.setUsePersonalVoice}
            />
          )}

          <MusicCreateResults
            isDeletingTrack={isDeletingTrack}
            isGenerating={isGenerating}
            isOpeningEditor={isOpeningEditor}
            isPolling={isPolling}
            openingEditorTrackId={openingEditorTrackId}
            songTracks={songTracks}
            status={status}
            taskId={taskId}
            onDeleteTrack={(trackId) => void deleteTrack(trackId)}
            onOpenEditor={(trackId) => void openEditor(trackId)}
          />
        </section>

        {error ? (
          <div className={mp.alertError} role="alert">
            {error}
          </div>
        ) : null}
      </main>
    </div>
  );
}
