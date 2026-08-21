"use client";

import { buildApiErrorTranslations, parseApiError } from "@/shared/lib/parse-api-error";
import type {
  LyricsLanguage,
  MusicLyricsStatusResponseDto,
  VocalGender,
  VoiceLanguage,
} from "@ai-music/shared";
import {
  buildVoiceRecordingScriptPrompt,
  isLyricsLanguage,
  VOICE_RECORDING_SCRIPT_DURATION_SEC,
} from "@ai-music/shared";

/** Voice validate supports `hi`; lyrics schema does not — fall back to auto. */
function resolveScriptLyricsLanguage(voiceLanguage: VoiceLanguage): LyricsLanguage {
  return isLyricsLanguage(voiceLanguage) ? voiceLanguage : "auto";
}
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import { useApi } from "@/shared/providers/api-provider";
import { useInvalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";

const SCRIPT_POLL_INTERVAL_MS = 3_000;

function isScriptStatusTerminal(data: MusicLyricsStatusResponseDto | undefined): boolean {
  // undefined = waiting for first poll — keep polling/busy continuous.
  return data?.status === "completed" || data?.status === "failed";
}

export function useVoiceRecordingScript(
  vocalGender: VocalGender | null,
  voiceLanguage: VoiceLanguage,
) {
  const api = useApi();
  const te = useTranslations("Errors");
  const tv = useTranslations("Validation");
  const invalidateCreditsBalance = useInvalidateCreditsBalance();
  const [script, setScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const lastGenderRef = useRef<VocalGender | null>(null);
  const lastLanguageRef = useRef<VoiceLanguage>(voiceLanguage);

  const statusQuery = usePollingQuery({
    queryKey: ["voice-recording-script", taskId, VOICE_RECORDING_SCRIPT_DURATION_SEC],
    queryFn: () =>
      api.music.lyricsStatus(taskId!, VOICE_RECORDING_SCRIPT_DURATION_SEC),
    enabled: Boolean(taskId),
    isTerminal: isScriptStatusTerminal,
    intervalMs: SCRIPT_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (statusQuery.error) {
      setError(
        parseApiError(statusQuery.error, te("recordingScriptFailed"), {
          translations: buildApiErrorTranslations(te),
        }),
      );
      setTaskId(null);
      return;
    }

    const body = statusQuery.data;
    if (!body || body.status === "pending" || body.status === "processing") {
      return;
    }

    setTaskId(null);

    if (body.status === "failed") {
      setError(body.errorMessage ?? te("lyricsGenerationFailed"));
      void invalidateCreditsBalance();
      return;
    }

    const text = body.lyrics?.[0]?.text?.trim();
    if (!text) {
      setError(te("recordingScriptEmpty"));
      return;
    }

    setScript(text);
    setError(null);
  }, [invalidateCreditsBalance, statusQuery.data, statusQuery.error, te]);

  const generateScript = useCallback(async () => {
    if (!vocalGender) {
      setError(tv("genderRequired"));
      return;
    }

    setError(null);
    setIsStarting(true);

    try {
      const prompt = buildVoiceRecordingScriptPrompt(voiceLanguage);
      const body = await api.music.generateLyrics({
        prompt,
        durationSec: VOICE_RECORDING_SCRIPT_DURATION_SEC,
        lyricsLanguage: resolveScriptLyricsLanguage(voiceLanguage),
      });
      setTaskId(body.taskId);
      lastGenderRef.current = vocalGender;
      lastLanguageRef.current = voiceLanguage;
      void invalidateCreditsBalance();
    } catch (generateError) {
      setError(
        parseApiError(generateError, te("recordingScriptFailed"), {
          translations: buildApiErrorTranslations(te),
        }),
      );
    } finally {
      setIsStarting(false);
    }
  }, [api.music, invalidateCreditsBalance, te, tv, vocalGender, voiceLanguage]);

  useEffect(() => {
    if (!vocalGender) {
      setScript(null);
      setTaskId(null);
      setError(null);
      lastGenderRef.current = null;
      return;
    }

    if (
      lastGenderRef.current !== vocalGender ||
      lastLanguageRef.current !== voiceLanguage
    ) {
      setScript(null);
      setTaskId(null);
      setError(null);
      lastLanguageRef.current = voiceLanguage;
    }
  }, [vocalGender, voiceLanguage]);

  const isGenerating = isStarting || Boolean(taskId);

  return {
    error,
    generateScript,
    isGenerating,
    script,
  };
}
