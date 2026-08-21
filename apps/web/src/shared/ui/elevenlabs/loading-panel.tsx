"use client";

import { Skeleton } from "@/components/ui/skeleton";
import styles from "@/shared/ui/elevenlabs/elevenlabs-ui.module.css";

interface LoadingPanelProps {
  lines?: 3 | 2 | 1;
}

export function LoadingPanel({ lines = 3 }: LoadingPanelProps) {
  return (
    <div className={styles.loadingPanel}>
      <Skeleton className={styles.loadingLineWide} />
      {lines >= 2 ? <Skeleton className={styles.loadingLineMedium} /> : null}
      {lines >= 3 ? <Skeleton className={styles.loadingLineShort} /> : null}
    </div>
  );
}
