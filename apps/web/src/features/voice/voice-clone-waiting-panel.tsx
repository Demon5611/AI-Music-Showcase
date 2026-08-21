"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AiProcessingStatus } from "@/shared/ui/elevenlabs";

const EXPECTED_WAIT_SEC = 60;

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

interface VoiceCloneWaitingPanelProps {
  active: boolean;
  label: string;
  onElapsedChange?: (elapsedSec: number) => void;
}

export function VoiceCloneWaitingPanel({
  active,
  label,
  onElapsedChange,
}: VoiceCloneWaitingPanelProps) {
  const t = useTranslations("VoiceUpload.waiting");
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedSec(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsedSec((value) => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    onElapsedChange?.(elapsedSec);
  }, [elapsedSec, onElapsedChange]);

  const isSlowWait = elapsedSec >= EXPECTED_WAIT_SEC;
  const progress = isSlowWait
    ? undefined
    : Math.round((elapsedSec / EXPECTED_WAIT_SEC) * 90);
  const hint = isSlowWait ? t("slowHint") : t("defaultHint");

  return (
    <AiProcessingStatus
      agentState="thinking"
      label={label}
      progress={progress}
      meta={t("elapsedMeta", { hint, elapsed: formatElapsed(elapsedSec) })}
    />
  );
}
