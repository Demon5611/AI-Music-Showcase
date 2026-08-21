import type {
  MusicGenerationPhaseHint,
  MusicGenerationRecordStatus,
} from "@ai-music/shared";
import type { AgentState } from "@/shared/ui/elevenlabs/agent-state";

type ProgressTranslate = (
  key:
    | "starting"
    | "queued"
    | "queuedWithEta"
    | "queuedAtProvider"
    | "generating"
    | "finalizing"
    | "persisting"
    | "ready"
    | "fallback"
    | "etaMinutes",
  values?: Record<string, string | number>,
) => string;

const PHASE_HINT_KEYS: Record<
  MusicGenerationPhaseHint,
  "queued" | "generating" | "finalizing" | "persisting" | "ready"
> = {
  queued: "queued",
  generating: "generating",
  finalizing: "finalizing",
  persisting: "persisting",
  ready: "ready",
};

const PHASE_HINT_PROGRESS: Record<MusicGenerationPhaseHint, number> = {
  queued: 6,
  generating: 40,
  finalizing: 82,
  persisting: 92,
  ready: 100,
};

const PHASE_HINT_AGENT: Record<MusicGenerationPhaseHint, AgentState> = {
  queued: "thinking",
  generating: "thinking",
  finalizing: "talking",
  persisting: "listening",
  ready: "listening",
};

export function resolveMusicGenerationLabel(
  t: ProgressTranslate,
  phaseHint?: MusicGenerationPhaseHint | null,
  status?: MusicGenerationRecordStatus,
  isStarting?: boolean,
  queuePhase?: string | null,
  queueEtaSec?: number,
): string {
  if (isStarting) {
    return t("starting");
  }

  if (queuePhase === "queued" || phaseHint === "queued") {
    if (queueEtaSec && queueEtaSec > 0) {
      const minutes = Math.max(1, Math.ceil(queueEtaSec / 60));
      return t("queuedWithEta", { eta: t("etaMinutes", { minutes }) });
    }

    return t("queued");
  }

  if (phaseHint && PHASE_HINT_KEYS[phaseHint]) {
    return t(PHASE_HINT_KEYS[phaseHint]);
  }

  if (status === "pending") {
    return t("queuedAtProvider");
  }

  if (status === "processing") {
    return t("generating");
  }

  return t("fallback");
}

export function resolveMusicGenerationProgress(
  phaseHint?: MusicGenerationPhaseHint | null,
  status?: MusicGenerationRecordStatus,
  isStarting?: boolean,
  queuePhase?: string | null,
): number {
  if (isStarting) {
    return 5;
  }

  if (queuePhase === "queued" || phaseHint === "queued") {
    return 6;
  }

  if (phaseHint && phaseHint in PHASE_HINT_PROGRESS) {
    return PHASE_HINT_PROGRESS[phaseHint];
  }

  if (status === "pending") {
    return 12;
  }

  if (status === "processing") {
    return 40;
  }

  return 15;
}

export function resolveMusicGenerationAgentState(
  phaseHint?: MusicGenerationPhaseHint | null,
): AgentState {
  if (phaseHint && phaseHint in PHASE_HINT_AGENT) {
    return PHASE_HINT_AGENT[phaseHint];
  }

  return "thinking";
}

export function formatElapsedDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
