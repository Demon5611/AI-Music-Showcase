import { PLANS, type PlanId } from "@ai-music/shared";
import { resolveSubscriptionPlanId } from "./subscription.service.js";

function readDevPlanOverride(): PlanId | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const raw = process.env.BILLING_DEV_PLAN_OVERRIDE?.trim().toLowerCase();

  if (!raw || !(raw in PLANS)) {
    return null;
  }

  return raw as PlanId;
}

export function resolveEffectivePlanId(subscriptionPlanId: string): PlanId {
  return readDevPlanOverride() ?? resolveSubscriptionPlanId(subscriptionPlanId);
}

export function isDevPlanOverrideActive(): boolean {
  return readDevPlanOverride() !== null;
}
