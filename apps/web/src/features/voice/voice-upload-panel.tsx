"use client";

import { buildApiErrorTranslations, parseApiError } from "@/shared/lib/parse-api-error";
import {
  MAX_VOICE_SAMPLE_DURATION_SEC,
  MIN_VOICE_SAMPLE_DURATION_SEC,
  RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC,
  RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC,
  getVoiceConsentPhrase,
  isRecommendedVoiceSampleDuration,
  resolveVoiceLanguageFromUiLocale,
  type VocalGender,
  type VoiceLanguage,
} from "@ai-music/shared";
import { Mic } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { readAudioDurationSec } from "@/features/voice/read-audio-duration";
import {
  VoiceRecordingScriptPanel,
  VoiceRecordingScriptToggle,
} from "@/features/voice/voice-recording-script-control";
import { VoiceGenderSelect } from "@/features/voice/voice-gender-select";
import { VoiceLanguageSelect } from "@/features/voice/voice-language-select";
import { useVoiceRecordingScript } from "@/features/voice/hooks/use-voice-recording-script";
import { VoiceRecordingTipsPanel } from "@/features/voice/voice-recording-tips-panel";
import { voiceUi } from "@/features/voice/voice-classes";
import { useVoiceRecorder } from "@/features/voice/use-voice-recorder";
import { VoiceUseNotes } from "@/features/legal/voice-use-notes";
import { useAuthSession } from "@/shared/hooks/use-auth-ready";
import { useApi } from "@/shared/providers/api-provider";
import { lp } from "@/features/landing/landing-classes";
import { LoadingPanel } from "@/shared/ui/elevenlabs";
import { appShell } from "@/shared/theme/app-theme";
import { AuthGate } from "@/shared/ui/auth-gate";

type VoiceUploadVariant = "page" | "landing";

const upload = voiceUi.upload;

function resolveVoiceUploadStyles(variant: VoiceUploadVariant) {
  const isLanding = variant === "landing";

  return {
    isLanding,
    isPage: variant === "page",
    form: isLanding ? upload.form : appShell.formPageForm,
    field: isLanding ? upload.field : appShell.formField,
    label: isLanding ? upload.fieldLabel : appShell.formLabel,
    submit: isLanding ? upload.submit : appShell.formSubmit,
    hint: isLanding ? upload.hint : appShell.formPageDescription,
    error: isLanding ? upload.error : appShell.formError,
    consentRow: isLanding ? upload.consentRow : appShell.formConsentRow,
    consentNotice: isLanding ? upload.consentNotice : appShell.formConsentNotice,
  };
}

function formatRecordingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

type VoiceInputMode = "record" | "upload";

interface VoiceModeButtonProps {
  active: boolean;
  children: string;
  disabled: boolean;
  onSelect: () => void;
}

function VoiceModeButton({ active, children, disabled, onSelect }: VoiceModeButtonProps) {
  const className = active ? upload.modeButtonActive : upload.modeButton;

  if (active) {
    return (
      <button
        aria-pressed="true"
        className={className}
        disabled={disabled}
        type="button"
        onClick={onSelect}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      aria-pressed="false"
      className={className}
      disabled={disabled}
      type="button"
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

interface VoiceUploadPanelProps {
  disabled?: boolean;
  embedded?: boolean;
  onSuccess?: (sampleId: string) => void;
  variant?: VoiceUploadVariant;
}

export function VoiceUploadPanel({
  disabled = false,
  embedded = false,
  onSuccess,
  variant = "page",
}: VoiceUploadPanelProps) {
  const api = useApi();
  const locale = useLocale();
  const t = useTranslations("VoiceUpload");
  const tc = useTranslations("Common");
  const tv = useTranslations("Validation");
  const te = useTranslations("Errors");
  const { isLoaded, isSignedIn, authReady } = useAuthSession();
  const [file, setFile] = useState<File | null>(null);
  const [fileSource, setFileSource] = useState<VoiceInputMode | null>(null);
  const [inputMode, setInputMode] = useState<VoiceInputMode>("record");
  const [pendingInputMode, setPendingInputMode] = useState<VoiceInputMode | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewDurationSec, setPreviewDurationSec] = useState<number | null>(null);
  const [recordedDurationHintSec, setRecordedDurationHintSec] = useState<number | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [confirmed, setConfirmed] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(() =>
    resolveVoiceLanguageFromUiLocale(locale),
  );
  const [vocalGender, setVocalGender] = useState<VocalGender | null>(null);
  const [isSavingGender, setIsSavingGender] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScriptPanelOpen, setIsScriptPanelOpen] = useState(false);
  const {
    cancelRecording,
    elapsedSec,
    error: recorderError,
    isRecording,
    setError: setRecorderError,
    startRecording,
    stopRecording,
  } = useVoiceRecorder();
  const {
    error: scriptError,
    generateScript,
    isGenerating: isScriptGenerating,
    script: recordingScript,
  } = useVoiceRecordingScript(vocalGender, voiceLanguage);
  const consentPhrase = getVoiceConsentPhrase(voiceLanguage);

  const styles = resolveVoiceUploadStyles(variant);
  const { isLanding, isPage } = styles;
  const recommendedDurationLabel = `${RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC}–${RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC}`;

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    let cancelled = false;

    void api.users
      .getMe()
      .then((user) => {
        if (!cancelled) {
          setVocalGender(user.vocalGender);
        }
      })
      .catch(() => {
        // Profile gender is optional for the form — ignore load errors.
      });

    return () => {
      cancelled = true;
    };
  }, [api.users, authReady]);

  useEffect(() => {
    if (
      !isScriptPanelOpen ||
      !vocalGender ||
      recordingScript ||
      isScriptGenerating ||
      Boolean(scriptError)
    ) {
      return;
    }

    void generateScript();
  }, [
    generateScript,
    isScriptGenerating,
    isScriptPanelOpen,
    recordingScript,
    scriptError,
    vocalGender,
  ]);

  useEffect(() => {
    if (!file) {
      return;
    }

    let cancelled = false;

    void readAudioDurationSec(file)
      .then((durationSec) => {
        if (!cancelled) {
          setPreviewDurationSec(durationSec);
        }
      })
      .catch(() => {
        if (!cancelled && recordedDurationHintSec !== null) {
          setPreviewDurationSec(recordedDurationHintSec);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file, recordedDurationHintSec]);

  function clearSelectedFile() {
    setFile(null);
    setFileSource(null);
    setPreviewDurationSec(null);
    setRecordedDurationHintSec(null);
    setFileInputKey((value) => value + 1);
    setError(null);
  }

  function resetVoiceInput() {
    cancelRecording();
    clearSelectedFile();
    setPendingInputMode(null);
  }

  function selectUploadedFile(nextFile: File | null) {
    if (nextFile && !confirmed) {
      setError(tv("consentRequiredBeforeUpload"));
      return;
    }

    if (nextFile && !vocalGender) {
      setError(tv("genderRequired"));
      return;
    }

    if (!nextFile) {
      clearSelectedFile();
      return;
    }

    setFile(nextFile);
    setFileSource("upload");
    setRecordedDurationHintSec(null);
    setPreviewDurationSec(null);
    setError(null);
  }

  function selectRecordedFile(nextFile: File, durationHintSec: number) {
    setFile(nextFile);
    setFileSource("record");
    setRecordedDurationHintSec(durationHintSec);
    setPreviewDurationSec(durationHintSec);
    setError(null);
  }

  function requestInputMode(nextMode: VoiceInputMode) {
    if (nextMode === inputMode) {
      return;
    }

    if (file || isRecording) {
      setPendingInputMode(nextMode);
      return;
    }

    setInputMode(nextMode);
    setError(null);
  }

  function confirmInputModeSwitch() {
    if (!pendingInputMode) {
      return;
    }

    const nextMode = pendingInputMode;
    resetVoiceInput();
    setInputMode(nextMode);
  }

  function cancelInputModeSwitch() {
    setPendingInputMode(null);
  }

  async function handleGenderChange(nextGender: VocalGender) {
    setError(null);
    setVocalGender(nextGender);
    setIsSavingGender(true);

    try {
      const user = await api.users.updateMe({ vocalGender: nextGender });
      setVocalGender(user.vocalGender);
    } catch (saveError) {
      setError(
        parseApiError(saveError, te("saveGenderFailed"), {
          translations: buildApiErrorTranslations(te),
        }),
      );
    } finally {
      setIsSavingGender(false);
    }
  }

  async function handleStopRecording() {
    setRecorderError(null);
    const recording = await stopRecording();

    if (!recording) {
      setError(tv("emptyRecording"));
      return;
    }

    selectRecordedFile(recording.file, recording.durationSec);
  }

  async function resolveUploadDurationSec(uploadFile: File): Promise<number> {
    try {
      return await readAudioDurationSec(uploadFile);
    } catch (readError) {
      if (fileSource === "record" && recordedDurationHintSec !== null) {
        return recordedDurationHintSec;
      }

      throw readError;
    }
  }

  const replaceWarningMessage =
    pendingInputMode === "upload"
      ? t("switchConfirmRecordToFile")
      : pendingInputMode === "record"
        ? t("switchConfirmFileToRecord")
        : null;
  const previewSourceLabel = fileSource === "record" ? t("previewRecord") : t("previewFile");

  const previewDurationLabel =
    previewDurationSec !== null ? formatRecordingTime(Math.round(previewDurationSec)) : null;
  const isPreviewTooShort =
    previewDurationSec !== null && previewDurationSec < MIN_VOICE_SAMPLE_DURATION_SEC;
  const isPreviewBelowRecommended =
    previewDurationSec !== null &&
    previewDurationSec >= MIN_VOICE_SAMPLE_DURATION_SEC &&
    !isRecommendedVoiceSampleDuration(previewDurationSec);
  const isPreviewTooLong =
    previewDurationSec !== null && previewDurationSec > MAX_VOICE_SAMPLE_DURATION_SEC;
  const consentRequired = !confirmed;
  const genderRequired = !vocalGender;
  const recordInputDisabled =
    disabled ||
    isSubmitting ||
    consentRequired ||
    genderRequired ||
    Boolean(pendingInputMode);
  const uploadInputDisabled =
    disabled ||
    isSubmitting ||
    consentRequired ||
    genderRequired ||
    Boolean(pendingInputMode);
  const consentNoticeClassName = styles.consentNotice;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError(tv("audioOrFileRequired"));
      return;
    }

    if (!confirmed) {
      setError(tv("consentRequiredForVoice"));
      return;
    }

    if (!vocalGender) {
      setError(tv("genderRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      const durationSec = await resolveUploadDurationSec(file);

      if (durationSec < MIN_VOICE_SAMPLE_DURATION_SEC) {
        throw new Error(tv("minDuration", { seconds: MIN_VOICE_SAMPLE_DURATION_SEC }));
      }

      if (durationSec > MAX_VOICE_SAMPLE_DURATION_SEC) {
        throw new Error(tv("maxDuration", { seconds: MAX_VOICE_SAMPLE_DURATION_SEC }));
      }

      const formData = new FormData();
      formData.append("soundFile", file);
      formData.append("confirmed", "true");
      formData.append("voiceLanguage", voiceLanguage);
      formData.append("consentPhrase", consentPhrase);
      formData.append("durationSec", String(durationSec));

      const sample = await api.voiceSamples.create(formData);

      if (onSuccess) {
        onSuccess(sample.id);
      }
    } catch (submitError) {
      if (
        submitError instanceof Error &&
        (submitError.message === "INVALID_AUDIO_DURATION" ||
          submitError.message === "AUDIO_DURATION_READ_FAILED")
      ) {
        setError(te("audioDurationReadFailed"));
        return;
      }

      setError(
        parseApiError(submitError, te("uploadFailed"), {
          translations: buildApiErrorTranslations(te),
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return <LoadingPanel lines={isLanding ? 3 : 2} />;
  }

  if (!isSignedIn) {
    return <AuthGate hint={t("authHint")} layout="inline" title={t("authTitle")} />;
  }

  const formClassName = styles.form;
  const fieldClassName = styles.field;
  const labelClassName = styles.label;
  const inputClassName = upload.fileInput;
  const submitClassName = styles.submit;
  const hintClassName = styles.hint;
  const errorClassName = styles.error;

  const content = (
    <>
      {isPage ? <h1 className={appShell.formPageTitle}>{t("pageTitle")}</h1> : null}

      <form className={formClassName} onSubmit={handleSubmit}>
        <div className={fieldClassName}>
          <VoiceLanguageSelect
            disabled={disabled || isSubmitting || isRecording}
            value={voiceLanguage}
            onChange={setVoiceLanguage}
          />
        </div>

        <div className={fieldClassName}>
          <label className={styles.consentRow}>
            <input
              checked={confirmed}
              className={voiceUi.consentCheckbox}
              disabled={disabled || isSubmitting || isRecording}
              type="checkbox"
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className={voiceUi.consentContent}>
              <span className={voiceUi.consentTitle}>{t("consentTitle")}</span>
              <span className={voiceUi.consentPhrase}>{consentPhrase}</span>
            </span>
          </label>
          {consentRequired ? (
            <p className={consentNoticeClassName}>{t("consentRequiredNote")}</p>
          ) : genderRequired ? (
            <p className={consentNoticeClassName}>
              {inputMode === "record"
                ? tv("genderRequiredBeforeRecord")
                : tv("genderRequiredBeforeUpload")}
            </p>
          ) : null}
          <VoiceUseNotes />
        </div>

        <div className={upload.modeSwitch} role="group" aria-label={t("inputModeAria")}>
          <VoiceModeButton
            active={inputMode === "record"}
            disabled={disabled || isSubmitting || isRecording || consentRequired}
            onSelect={() => requestInputMode("record")}
          >
            {t("microphone")}
          </VoiceModeButton>
          <VoiceModeButton
            active={inputMode === "upload"}
            disabled={disabled || isSubmitting || isRecording || consentRequired}
            onSelect={() => requestInputMode("upload")}
          >
            {t("file")}
          </VoiceModeButton>
        </div>

        <VoiceRecordingTipsPanel />

        {replaceWarningMessage ? (
          <div className={upload.replaceWarning}>
            <p className={upload.replaceWarningText}>{replaceWarningMessage}</p>
            <div className={upload.replaceWarningActions}>
              <button
                className={upload.toolButton}
                type="button"
                onClick={cancelInputModeSwitch}
              >
                {tc("cancel")}
              </button>
              <button
                className={upload.primaryButton}
                type="button"
                onClick={confirmInputModeSwitch}
              >
                {t("switch")}
              </button>
            </div>
          </div>
        ) : null}

        {inputMode === "record" ? (
          <div className={fieldClassName}>
            <span className={labelClassName}>{t("recordLabel")}</span>
            <div className={voiceUi.recordScriptWrap}>
              <div className={upload.recordRow}>
                {!isRecording ? (
                  <button
                    className={upload.recordButton}
                    disabled={recordInputDisabled}
                    type="button"
                    onClick={() => {
                      if (!confirmed) {
                        setError(tv("consentRequiredBeforeRecord"));
                        return;
                      }

                      if (!vocalGender) {
                        setError(tv("genderRequired"));
                        return;
                      }

                      void startRecording();
                    }}
                  >
                    <Mic aria-hidden className={upload.recordButtonIcon} />
                    {t("record")}
                  </button>
                ) : (
                  <>
                    <button
                      className={upload.toolButtonDestructive}
                      disabled={disabled || isSubmitting}
                      type="button"
                      onClick={() => void handleStopRecording()}
                    >
                      {tc("stop")}
                    </button>
                    <button
                      className={upload.toolButton}
                      disabled={disabled || isSubmitting}
                      type="button"
                      onClick={cancelRecording}
                    >
                      {tc("cancel")}
                    </button>
                    <span className={upload.recordingLabel}>
                      {t("recordingProgress", { time: formatRecordingTime(elapsedSec) })}
                      {!isRecommendedVoiceSampleDuration(elapsedSec)
                        ? t("recordingTarget", { duration: recommendedDurationLabel })
                        : t("recordingEnough")}
                    </span>
                  </>
                )}
                <VoiceRecordingScriptToggle
                  disabled={disabled || isSubmitting || isSavingGender || consentRequired}
                  open={isScriptPanelOpen}
                  onToggle={() => setIsScriptPanelOpen((value) => !value)}
                />
                <VoiceGenderSelect
                  disabled={disabled || isSubmitting || isRecording || isSavingGender || consentRequired}
                  value={vocalGender}
                  onChange={(value) => void handleGenderChange(value)}
                />
              </div>
              <VoiceRecordingScriptPanel
                error={scriptError}
                isGenerating={isScriptGenerating}
                open={isScriptPanelOpen}
                script={recordingScript}
              />
            </div>
          </div>
        ) : (
          <div className={fieldClassName}>
            <span className={labelClassName}>{t("uploadLabel")}</span>
            <div className={upload.recordRow}>
              <input
                key={fileInputKey}
                aria-label={t("chooseFileAria")}
                className={inputClassName}
                disabled={uploadInputDisabled}
                type="file"
                accept="audio/*"
                onChange={(event) => {
                  selectUploadedFile(event.target.files?.[0] ?? null);
                }}
              />
              <VoiceGenderSelect
                disabled={disabled || isSubmitting || isSavingGender || consentRequired}
                value={vocalGender}
                onChange={(value) => void handleGenderChange(value)}
              />
            </div>
          </div>
        )}

        {file && previewUrl ? (
          <div className={upload.preview}>
            <div className={upload.previewHeader}>
              <span className={labelClassName}>
                {t("previewLabel", { source: previewSourceLabel })}
              </span>
              <button
                className={upload.toolButton}
                disabled={disabled || isSubmitting || isRecording}
                type="button"
                onClick={resetVoiceInput}
              >
                {tc("delete")}
              </button>
            </div>
            <p className={hintClassName}>
              {file.name}
              {file.size > 0 ? ` · ${Math.round(file.size / 1024)} KB` : null}
              {previewDurationLabel ? ` · ${previewDurationLabel}` : null}
            </p>
            <audio
              className={upload.previewPlayer}
              controls
              preload="metadata"
              src={previewUrl}
            />
            {isPreviewTooShort ? (
              <p className={errorClassName}>
                {tv("minDurationHint", { seconds: MIN_VOICE_SAMPLE_DURATION_SEC })}
              </p>
            ) : null}
            {isPreviewBelowRecommended ? (
              <p className={upload.durationRecommendNotice}>
                {t("durationRecommendation", { duration: recommendedDurationLabel })}
              </p>
            ) : null}
            {isPreviewTooLong ? (
              <p className={errorClassName}>
                {tv("maxDurationHint", { seconds: MAX_VOICE_SAMPLE_DURATION_SEC })}
              </p>
            ) : null}
            <p className={hintClassName}>{t("browserOnlyHint")}</p>
          </div>
        ) : null}

        <button
          className={submitClassName}
          disabled={
            disabled || isSubmitting || isRecording || consentRequired || genderRequired || !file
          }
          type="submit"
        >
          {isSubmitting ? t("uploading") : t("uploadSample")}
        </button>
      </form>

      {recorderError ? <p className={errorClassName}>{recorderError}</p> : null}
      {error ? <p className={errorClassName}>{error}</p> : null}
    </>
  );

  if (embedded) {
    return content;
  }

  if (isLanding) {
    return (
      <div className={lp.voiceWrap}>
        <div className={lp.voiceCard}>{content}</div>
      </div>
    );
  }

  return <section className={appShell.formPage}>{content}</section>;
}
