import { FREE_TIER_DEFAULT_DURATION_SEC } from "./music-combo-styles.js";
import { PLANS, type PlanId } from "./plans.js";

export function resolveEffectiveDurationSecForPlan(
  planId: PlanId,
  selectedDurationSec: number | undefined,
): number {
  const normalized = selectedDurationSec ?? 0;

  if (PLANS[planId].features.musicGeneration === "simplified") {
    return FREE_TIER_DEFAULT_DURATION_SEC;
  }

  if (normalized > 0) {
    return Math.min(normalized, PLANS[planId].maxTrackDurationSec);
  }

  return PLANS[planId].maxTrackDurationSec;
}

export function formatAutoDurationLabel(maxTrackDurationSec: number): string {
  if (maxTrackDurationSec <= 60) {
    return "Auto (~1 мин)";
  }

  if (maxTrackDurationSec <= 120) {
    return "Auto (~2 мин)";
  }

  return "Auto (~2–3 мин)";
}

export function formatDurationOptionLabel(durationSec: number, planId: PlanId): string {
  if (durationSec === 0) {
    return formatAutoDurationLabel(PLANS[planId].maxTrackDurationSec);
  }

  const labels: Record<number, string> = {
    30: "~30 сек",
    60: "~1 мин",
    120: "~2 мин",
    180: "~3 мин",
  };

  return labels[durationSec] ?? `${durationSec} сек`;
}

export function getDefaultDurationSecForPlan(planId: PlanId): number {
  if (PLANS[planId].features.musicGeneration === "simplified") {
    return FREE_TIER_DEFAULT_DURATION_SEC;
  }

  return 0;
}

export function formatDurationHintSec(durationSec: number): string {
  if (durationSec <= 60) {
    return `~${durationSec} сек`;
  }

  if (durationSec <= 120) {
    return "~2 мин";
  }

  return "~2–3 мин";
}

export function buildLyricsDurationHint(
  planId: PlanId,
  selectedDurationSec: number,
): string {
  const effectiveDurationSec = resolveEffectiveDurationSecForPlan(planId, selectedDurationSec);
  const durationLabel = formatDurationHintSec(effectiveDurationSec);

  if (PLANS[planId].features.musicGeneration === "simplified") {
    return `На тарифе Free AI создаёт короткий текст только под ${durationLabel}. На платных тарифах длина зависит от выбранной длительности трека.`;
  }

  if (selectedDurationSec === 0) {
    return `AI создаст текст под ${durationLabel} — максимум для вашего тарифа (режим Auto на следующем шаге).`;
  }

  return `AI создаст текст под ${durationLabel} — длительность, которую вы выберете на следующем шаге.`;
}
