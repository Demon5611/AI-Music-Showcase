import { PLANS, resolveEffectiveDurationSecForPlan, type PlanId } from "@ai-music/shared";

type DurationMessageKey =
  | "duration.sec"
  | "duration.min1"
  | "duration.min2"
  | "duration.min3"
  | "duration.min2to3"
  | "duration.auto1"
  | "duration.auto2"
  | "duration.auto2to3"
  | "duration.fallbackSec"
  | "lyricsDurationHint.free"
  | "lyricsDurationHint.selected";

type DurationTranslate = (
  key: DurationMessageKey,
  values?: Record<string, string | number>,
) => string;

export function formatLocalizedDurationHintSec(
  t: DurationTranslate,
  durationSec: number,
): string {
  if (durationSec <= 60) {
    return t("duration.sec", { seconds: durationSec });
  }

  if (durationSec <= 120) {
    return t("duration.min2");
  }

  return t("duration.min2to3");
}

export function formatLocalizedDurationOptionLabel(
  t: DurationTranslate,
  durationSec: number,
  planId: PlanId,
): string {
  if (durationSec === 0) {
    const max = PLANS[planId].maxTrackDurationSec;

    if (max <= 60) {
      return t("duration.auto1");
    }

    if (max <= 120) {
      return t("duration.auto2");
    }

    return t("duration.auto2to3");
  }

  if (durationSec === 30) {
    return t("duration.sec", { seconds: 30 });
  }

  if (durationSec === 60) {
    return t("duration.min1");
  }

  if (durationSec === 120) {
    return t("duration.min2");
  }

  if (durationSec === 180) {
    return t("duration.min3");
  }

  return t("duration.fallbackSec", { seconds: durationSec });
}

export function resolveLocalizedLyricsDurationHint(
  t: DurationTranslate,
  planId: PlanId,
  selectedDurationSec: number,
): string {
  const effectiveDurationSec = resolveEffectiveDurationSecForPlan(planId, selectedDurationSec);
  const duration = formatLocalizedDurationHintSec(t, effectiveDurationSec);

  if (PLANS[planId].features.musicGeneration === "simplified") {
    return t("lyricsDurationHint.free", { duration });
  }

  return t("lyricsDurationHint.selected", { duration });
}
