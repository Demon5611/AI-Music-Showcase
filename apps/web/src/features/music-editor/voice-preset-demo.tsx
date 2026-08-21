"use client";

import {
  resolveVoicePresetDsp,
  VOICE_PRESETS,
  type VoicePresetSelection,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { me } from "@/features/music-editor/music-editor-classes";
import { cn } from "@/lib/utils";
import { createVoicePresetFilterChain } from "@/shared/lib/voice-preset-webaudio";

const DEMO_AUDIO_SRC = "/voice-preset-demo.mp3";

export function VoicePresetDemo() {
  const t = useTranslations("Editor.voicePresets");
  const tErrors = useTranslations("Errors");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const filterChainRef = useRef<ReturnType<typeof createVoicePresetFilterChain> | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const graphReadyRef = useRef(false);

  const [selectedPresetId, setSelectedPresetId] = useState<VoicePresetSelection>("none");
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = useCallback((presetId: VoicePresetSelection) => {
    filterChainRef.current?.setDsp(resolveVoicePresetDsp(presetId));
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio || graphReadyRef.current) {
      return true;
    }

    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }

    const context = contextRef.current;

    if (context.state === "suspended") {
      await context.resume();
    }

    sourceRef.current = context.createMediaElementSource(audio);
    filterChainRef.current = createVoicePresetFilterChain(context);
    sourceRef.current.connect(filterChainRef.current.input);
    filterChainRef.current.output.connect(context.destination);
    graphReadyRef.current = true;

    return true;
  }, []);

  useEffect(() => {
    return () => {
      filterChainRef.current?.disconnect();
      sourceRef.current?.disconnect();
      void contextRef.current?.close();
    };
  }, []);

  async function replayDemo() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    await audio.play();
    setIsPlaying(true);
  }

  async function handlePlay() {
    setError(null);

    try {
      await ensureAudioGraph();
      applyPreset(selectedPresetId);
      await replayDemo();
    } catch {
      setError(tErrors("voicePresetDemoFailed"));
      setIsPlaying(false);
    }
  }

  async function handlePresetChange(presetId: VoicePresetSelection) {
    setSelectedPresetId(presetId);

    if (!graphReadyRef.current) {
      return;
    }

    applyPreset(presetId);

    if (isPlaying) {
      try {
        await replayDemo();
      } catch {
        setIsPlaying(false);
      }
    }
  }

  return (
    <section className={me.presetDemoCard}>
      <p className={me.presetDemoTitle}>{t("demoTitle")}</p>
      <p className={me.presetDemoHint}>{t("demoHint")}</p>

      <audio
        ref={audioRef}
        preload="auto"
        src={DEMO_AUDIO_SRC}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
      />

      <div className={me.presetDemoChips} role="group" aria-label={t("demoGroupAria")}>
        <button
          aria-pressed={selectedPresetId === "none"}
          className={cn(
            me.voicePresetChip,
            selectedPresetId === "none" && me.voicePresetChipActive,
          )}
          type="button"
          onClick={() => void handlePresetChange("none")}
        >
          {t("original")}
        </button>
        {VOICE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            aria-pressed={selectedPresetId === preset.id}
            className={cn(
              me.voicePresetChip,
              selectedPresetId === preset.id && me.voicePresetChipActive,
            )}
            type="button"
            onClick={() => void handlePresetChange(preset.id)}
          >
            {t(`presets.${preset.id}.label`)}
          </button>
        ))}
      </div>

      <button
        className={cn(me.primaryButton, "self-start")}
        type="button"
        onClick={() => void handlePlay()}
      >
        {isPlaying ? t("playing") : t("listenDemo")}
      </button>

      {error ? <p className={me.error}>{error}</p> : null}
    </section>
  );
}
