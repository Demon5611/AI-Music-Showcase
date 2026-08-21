import {
  FREE_TIER_DEFAULT_DURATION_SEC,
  isComboStylePreset,
} from "../constants/music-combo-styles.js";
import { resolveEffectiveDurationSecForPlan } from "../constants/music-duration.js";
import {
  ADVANCED_EDITOR_OPERATIONS,
  LITE_EDITOR_OPERATIONS,
  PLANS,
  VERSION_HISTORY_OPERATION_LIMIT,
  resolveMaxProjects,
  type EditorLevel,
  type EditorOperationType,
  type PlanFeatures,
  type PlanId,
  type VersionHistoryLevel,
} from "../constants/plans.js";

export type FeatureKey = keyof PlanFeatures;

export interface ResolvedEntitlements {
  planId: PlanId;
  planLabel: string;
  monthlyCredits: number;
  maxTrackDurationSec: number;
  maxProjects: number;
  estimatedFlows: number | null;
  features: PlanFeatures;
  queuePriority: number;
}

export type EntitlementViolationCode =
  | "FEATURE_NOT_AVAILABLE"
  | "DURATION_LIMIT_EXCEEDED"
  | "EDITOR_OPERATION_NOT_ALLOWED"
  | "SIMPLIFIED_GENERATION_ONLY"
  | "PROJECT_LIMIT_EXCEEDED"
  | "VERSION_HISTORY_LIMIT_EXCEEDED";

export interface EntitlementViolation {
  ok: false;
  code: EntitlementViolationCode;
  message: string;
  requiredPlan?: PlanId;
  limit?: number;
}

export interface EntitlementSuccess {
  ok: true;
}

export type EntitlementCheckResult = EntitlementSuccess | EntitlementViolation;

/** BullMQ: lower number = higher priority. Same for all packs (no pack privilege). */
const QUEUE_PRIORITY_BY_PLAN: Record<PlanId, number> = {
  studio: 10,
  pro: 10,
  free: 10,
};

export function resolveEntitlements(planId: PlanId): ResolvedEntitlements {
  const plan = PLANS[planId];

  return {
    planId: plan.id,
    planLabel: plan.label,
    monthlyCredits: plan.monthlyCredits,
    maxTrackDurationSec: plan.maxTrackDurationSec,
    maxProjects: resolveMaxProjects(plan.id),
    estimatedFlows: plan.estimatedFlows,
    features: plan.features,
    queuePriority: QUEUE_PRIORITY_BY_PLAN[plan.id],
  };
}

export function hasEditorAccess(): boolean {
  return true;
}

export function checkFeature(planId: PlanId, feature: FeatureKey): EntitlementCheckResult {
  const entitlements = resolveEntitlements(planId);
  const value = entitlements.features[feature];

  if (feature === "editor") {
    return { ok: true };
  }

  if (
    feature === "musicGeneration" ||
    feature === "voiceReplace" ||
    feature === "lyricsGeneration"
  ) {
    return { ok: true };
  }

  if (feature === "versionHistory") {
    if (value !== false) {
      return { ok: true };
    }

    return {
      ok: false,
      code: "FEATURE_NOT_AVAILABLE",
      message: "История версий недоступна для текущего пакета",
      requiredPlan: "pro",
    };
  }

  if (feature === "maxProjects") {
    return { ok: true };
  }

  if (typeof value === "number") {
    return { ok: true };
  }

  if (value === true) {
    return { ok: true };
  }

  const requiredPlan = findMinimumPlanForBooleanFeature(feature);

  return {
    ok: false,
    code: "FEATURE_NOT_AVAILABLE",
    message: `Функция недоступна на тарифе ${entitlements.planLabel}`,
    requiredPlan,
  };
}

export function checkMaxDuration(planId: PlanId, durationSec: number): EntitlementCheckResult {
  const entitlements = resolveEntitlements(planId);
  const effectiveDurationSec = resolveEffectiveDurationSecForPlan(planId, durationSec);

  if (effectiveDurationSec <= entitlements.maxTrackDurationSec) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "DURATION_LIMIT_EXCEEDED",
    message: `Максимальная длина трека на тарифе ${entitlements.planLabel} — ${entitlements.maxTrackDurationSec} сек`,
    limit: entitlements.maxTrackDurationSec,
  };
}

export function checkProjectLimit(planId: PlanId, projectCount: number): EntitlementCheckResult {
  // Always enforce resolveMaxProjects (includes UNLIMITED_PROJECTS_CAP safety ceiling).
  const maxProjects = resolveMaxProjects(planId);

  if (projectCount < maxProjects) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "PROJECT_LIMIT_EXCEEDED",
    message: `Достигнут технический лимит проектов (${maxProjects}).`,
    limit: maxProjects,
  };
}

export function checkVersionHistory(planId: PlanId): EntitlementCheckResult {
  return checkFeature(planId, "versionHistory");
}

export function checkVersionHistoryOperationLimit(
  planId: PlanId,
  activeOperationCount: number,
): EntitlementCheckResult {
  const level = resolveVersionHistoryLevel(planId);

  if (level === false) {
    return { ok: true };
  }

  const limit = VERSION_HISTORY_OPERATION_LIMIT[level];

  if (limit === null || activeOperationCount < limit) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "VERSION_HISTORY_LIMIT_EXCEEDED",
    message: `Достигнут лимит операций истории (${limit}). Обновите тариф для продолжения.`,
    requiredPlan: "studio",
    limit,
  };
}

export function resolveVersionHistoryOperationLimit(planId: PlanId): number | null {
  const level = resolveVersionHistoryLevel(planId);

  if (level === false) {
    return null;
  }

  return VERSION_HISTORY_OPERATION_LIMIT[level];
}

export { resolveMaxProjects } from "../constants/plans.js";

export {
  formatAutoDurationLabel,
  formatDurationOptionLabel,
  resolveEffectiveDurationSecForPlan,
} from "../constants/music-duration.js";

export function checkMusicGenerationMode(
  planId: PlanId,
  options: { customMode?: boolean; instrumental?: boolean; style?: string; durationSec?: number },
): EntitlementCheckResult {
  const entitlements = resolveEntitlements(planId);

  if (entitlements.features.musicGeneration === "full") {
    return { ok: true };
  }

  if (options.instrumental) {
    return {
      ok: false,
      code: "SIMPLIFIED_GENERATION_ONLY",
      message: "Инструментальная генерация доступна в полном режиме",
      requiredPlan: "pro",
    };
  }

  const durationSec = options.durationSec ?? 0;

  if (durationSec !== FREE_TIER_DEFAULT_DURATION_SEC) {
    return {
      ok: false,
      code: "SIMPLIFIED_GENERATION_ONLY",
      message: "На Free доступна генерация только 30 секунд",
      requiredPlan: "pro",
    };
  }

  const style = options.style?.trim() ?? "";

  if (!isComboStylePreset(style)) {
    return {
      ok: false,
      code: "SIMPLIFIED_GENERATION_ONLY",
      message: "В упрощённом режиме доступен только комбо-стиль",
      requiredPlan: "pro",
    };
  }

  return { ok: true };
}

export function checkEditorOperation(
  planId: PlanId,
  operationType: string,
): EntitlementCheckResult {
  const editorLevel = PLANS[planId].features.editor;
  const normalizedType = operationType === "CUT_REGION" ? "DELETE_REGION" : operationType;
  const allowed = isEditorOperationAllowed(editorLevel, normalizedType as EditorOperationType);

  if (allowed) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "EDITOR_OPERATION_NOT_ALLOWED",
    message: "Эта операция редактора недоступна в текущем режиме",
    requiredPlan: "pro",
  };
}

export function isEditorOperationAllowed(
  editorLevel: EditorLevel,
  operationType: EditorOperationType | string,
): boolean {
  const normalizedType = operationType === "CUT_REGION" ? "DELETE_REGION" : operationType;

  if (LITE_EDITOR_OPERATIONS.includes(normalizedType as (typeof LITE_EDITOR_OPERATIONS)[number])) {
    return true;
  }

  if (editorLevel !== "advanced") {
    return false;
  }

  return ADVANCED_EDITOR_OPERATIONS.includes(
    normalizedType as (typeof ADVANCED_EDITOR_OPERATIONS)[number],
  );
}

export function resolveVersionHistoryLevel(planId: PlanId): VersionHistoryLevel {
  return PLANS[planId].features.versionHistory;
}

export function getAllowedDurationOptions(maxTrackDurationSec: number): number[] {
  const options = [0, 30, 60, 120, 180];
  return options.filter((value) => value === 0 || value <= maxTrackDurationSec);
}

export const ALL_DURATION_OPTIONS = [0, 30, 60, 120, 180] as const;

export function isDurationAllowedForPlan(planId: PlanId, durationSec: number): boolean {
  return getDurationOptionsForPlan(planId).includes(durationSec);
}

export function getDurationOptionsForPlan(planId: PlanId): number[] {
  if (PLANS[planId].features.musicGeneration === "simplified") {
    return [FREE_TIER_DEFAULT_DURATION_SEC];
  }

  return getAllowedDurationOptions(PLANS[planId].maxTrackDurationSec);
}

function findMinimumPlanForBooleanFeature(feature: FeatureKey): PlanId {
  for (const planId of ["pro", "studio"] as const) {
    const value = PLANS[planId].features[feature];

    if (value === true) {
      return planId;
    }
  }

  return "studio";
}
