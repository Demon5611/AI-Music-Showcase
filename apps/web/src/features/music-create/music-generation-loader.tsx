"use client";

import type {
  MusicGenerationPhaseHint,
  MusicGenerationRecordStatus,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { OrbitalLoaderVisual } from "@/shared/ui/orbital-loader/orbital-loader-visual";
import {
  formatElapsedDuration,
  resolveMusicGenerationLabel,
  resolveMusicGenerationProgress,
} from "./music-generation-progress";
import styles from "./music-generation-loader.module.css";

function ElapsedDuration() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return <>{formatElapsedDuration(elapsed)}</>;
}

interface MusicGenerationLoaderProps {
  phaseHint?: MusicGenerationPhaseHint | null;
  status?: MusicGenerationRecordStatus;
  taskId?: string | null;
  isStarting?: boolean;
  queuePhase?: string | null;
  queueEtaSec?: number;
}

export function MusicGenerationLoader({
  phaseHint,
  status,
  taskId,
  isStarting = false,
  queuePhase,
  queueEtaSec,
}: MusicGenerationLoaderProps) {
  const tProgress = useTranslations("Generation.progress");
  const tLoader = useTranslations("Generation.loader");
  const tCommon = useTranslations("Common");
  const active = isStarting || Boolean(taskId);
  const label = resolveMusicGenerationLabel(
    tProgress,
    phaseHint,
    status,
    isStarting,
    queuePhase,
    queueEtaSec,
  );
  const progress = resolveMusicGenerationProgress(phaseHint, status, isStarting, queuePhase);
  const timerKey = isStarting ? "starting" : (taskId ?? "idle");

  const metaParts = [tLoader("usualTime")];

  if (taskId && !isStarting) {
    metaParts.push(tLoader("taskId", { id: taskId.slice(0, 8) }));
  }

  const metaBase = metaParts.join(" · ");

  return (
    <div className={styles.shell} role="status" aria-live="polite">
      <OrbitalLoaderVisual size="large" />

      <p className={styles.label}>
        <ShimmeringText text={label} />
      </p>

      {progress !== undefined ? (
        <div className={styles.progressBlock}>
          <Progress value={progress}>
            <ProgressLabel>{tCommon("progress")}</ProgressLabel>
            <ProgressValue />
          </Progress>
        </div>
      ) : null}

      <p className={styles.meta}>
        {active ? (
          <>
            {metaBase} · {tLoader("elapsedPrefix")}
            <ElapsedDuration key={timerKey} />
          </>
        ) : (
          metaBase
        )}
      </p>
    </div>
  );
}
