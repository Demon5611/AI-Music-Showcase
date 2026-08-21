import {
  checkEditorOperation,
  checkFeature,
  checkMaxDuration,
  checkMusicGenerationMode,
  checkProjectLimit,
  checkVersionHistory,
  checkVersionHistoryOperationLimit,
  resolveEntitlements,
  type EntitlementCheckResult,
  type FeatureKey,
  type ResolvedEntitlements,
  type SubscriptionStatus,
} from "@ai-music/shared";
import {
  DurationLimitExceededError,
  EditorOperationNotAllowedError,
  FeatureNotAvailableError,
} from "../../common/errors.js";
import { getCreditsBalance } from "../credits/service.js";
import { ensureFreeTierCredits } from "./free-tier-credits.service.js";
import { getOrCreateSubscription } from "./subscription.service.js";
import { isDevPlanOverrideActive, resolveEffectivePlanId } from "./dev-plan-override.js";

function throwIfViolation(result: EntitlementCheckResult): void {
  if (result.ok) {
    return;
  }

  if (result.code === "DURATION_LIMIT_EXCEEDED") {
    throw new DurationLimitExceededError(result.message, result.limit);
  }

  if (result.code === "EDITOR_OPERATION_NOT_ALLOWED") {
    throw new EditorOperationNotAllowedError(result.message, result.requiredPlan);
  }

  if (result.code === "PROJECT_LIMIT_EXCEEDED") {
    throw new FeatureNotAvailableError(result.message, result.requiredPlan);
  }

  if (result.code === "VERSION_HISTORY_LIMIT_EXCEEDED") {
    throw new FeatureNotAvailableError(result.message, result.requiredPlan);
  }

  throw new FeatureNotAvailableError(result.message, result.requiredPlan);
}

export async function getUserEntitlements(userId: string): Promise<ResolvedEntitlements> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);

  return resolveEntitlements(planId);
}

export async function getUserSubscriptionSummary(userId: string) {
  const subscription = await getOrCreateSubscription(userId);
  await ensureFreeTierCredits(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  const entitlements = resolveEntitlements(planId);
  const creditsBalance = await getCreditsBalance(userId);

  return {
    planId,
    planLabel: entitlements.planLabel,
    status: subscription.status as SubscriptionStatus,
    entitlements,
    creditsBalance,
    devPlanOverride: isDevPlanOverrideActive(),
  };
}

export async function assertFeature(userId: string, feature: FeatureKey): Promise<void> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  throwIfViolation(checkFeature(planId, feature));
}

export async function assertMaxDuration(userId: string, durationSec: number): Promise<void> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  throwIfViolation(checkMaxDuration(planId, durationSec));
}

export async function assertMusicGenerationMode(
  userId: string,
  options: {
    customMode?: boolean;
    instrumental?: boolean;
    style?: string;
    durationSec?: number;
  },
): Promise<void> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  throwIfViolation(checkMusicGenerationMode(planId, options));
}

export async function assertEditorOperation(userId: string, operationType: string): Promise<void> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  throwIfViolation(checkEditorOperation(planId, operationType));
}

export async function assertVersionHistory(userId: string): Promise<void> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  throwIfViolation(checkVersionHistory(planId));
}

export async function assertProjectLimit(userId: string, projectCount: number): Promise<void> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  throwIfViolation(checkProjectLimit(planId, projectCount));
}

export async function assertVersionHistoryOperationLimit(
  userId: string,
  activeOperationCount: number,
): Promise<void> {
  const subscription = await getOrCreateSubscription(userId);
  const planId = resolveEffectivePlanId(subscription.planId);
  throwIfViolation(checkVersionHistoryOperationLimit(planId, activeOperationCount));
}

export async function getQueuePriorityForUser(userId: string): Promise<number> {
  const entitlements = await getUserEntitlements(userId);
  return entitlements.queuePriority;
}
