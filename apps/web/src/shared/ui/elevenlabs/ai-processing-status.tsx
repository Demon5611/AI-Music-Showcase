"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { OrbitalLoaderVisual } from "@/shared/ui/orbital-loader/orbital-loader-visual";
import type { AgentState } from "@/shared/ui/elevenlabs/agent-state";
import styles from "@/shared/ui/elevenlabs/elevenlabs-ui.module.css";

interface AiProcessingStatusProps {
  label: string;
  progress?: number;
  /** Kept for call-site compatibility; visual no longer branches on agent state. */
  agentState?: AgentState;
  meta?: ReactNode;
}

export function AiProcessingStatus({
  label,
  progress,
  meta,
}: AiProcessingStatusProps) {
  const t = useTranslations("Common");

  return (
    <div className={styles.aiStatusCard} role="status" aria-live="polite">
      <OrbitalLoaderVisual size="compact" />

      <p className={styles.statusLabel}>
        <ShimmeringText text={label} />
      </p>

      {progress !== undefined ? (
        <div className={styles.progressBlock}>
          <Progress value={progress}>
            <ProgressLabel>{t("progress")}</ProgressLabel>
            <ProgressValue />
          </Progress>
        </div>
      ) : null}

      {meta ? <p className={styles.meta}>{meta}</p> : null}
    </div>
  );
}
