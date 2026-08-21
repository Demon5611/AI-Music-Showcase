"use client";

import { MAX_VOICE_SAMPLE_DURATION_SEC } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function buildRecordingFile(blob: Blob, mimeType: string): File {
  const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";

  return new File([blob], `voice-recording.${extension}`, { type: mimeType });
}

export interface VoiceRecordingResult {
  durationSec: number;
  file: File;
}

export function useVoiceRecorder() {
  const t = useTranslations("Errors");
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const elapsedSecRef = useRef(0);
  const stopResolverRef = useRef<((result: VoiceRecordingResult | null) => void) | null>(null);

  const cleanupStream = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    elapsedSecRef.current = 0;
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  const startRecording = useCallback(async () => {
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(t("microphoneUnavailable"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const recordedMimeType = mediaRecorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recordedMimeType });
        const file = blob.size > 0 ? buildRecordingFile(blob, recordedMimeType) : null;
        const durationSec = elapsedSecRef.current;

        cleanupStream();
        setElapsedSec(0);
        stopResolverRef.current?.(
          file ? { durationSec: Math.max(durationSec, 1), file } : null,
        );
        stopResolverRef.current = null;
      };

      mediaRecorder.onerror = () => {
        setError(t("recordingFailed"));
        cleanupStream();
        stopResolverRef.current?.(null);
        stopResolverRef.current = null;
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setElapsedSec(0);
      elapsedSecRef.current = 0;

      timerRef.current = window.setInterval(() => {
        setElapsedSec((value) => {
          const nextValue = value + 1;
          elapsedSecRef.current = nextValue;

          if (
            nextValue >= MAX_VOICE_SAMPLE_DURATION_SEC &&
            mediaRecorderRef.current?.state === "recording"
          ) {
            mediaRecorderRef.current.stop();
          }

          return nextValue;
        });
      }, 1000);
    } catch {
      setError(t("microphoneAccessDenied"));
      cleanupStream();
    }
  }, [cleanupStream, t]);

  const stopRecording = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return null;
    }

    return new Promise((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      stopResolverRef.current = null;
      recorder.stop();
    }

    cleanupStream();
    setElapsedSec(0);
    setError(null);
  }, [cleanupStream]);

  return {
    cancelRecording,
    elapsedSec,
    error,
    isRecording,
    setError,
    startRecording,
    stopRecording,
  };
}
