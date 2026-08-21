"use client";

import type { ReactElement } from "react";
import type { PlanFeatures } from "@ai-music/shared";
import { getMinimumPlanForFeature, getPlanFeatureTooltip, getPlanLabel } from "@ai-music/shared";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { DisabledTooltipWrap } from "@/shared/ui/tooltip";

export type PlanFeatureKey = keyof PlanFeatures;

function isFeatureAllowed(features: PlanFeatures, feature: PlanFeatureKey): boolean {
  const value = features[feature];

  if (feature === "editor") {
    return true;
  }

  if (feature === "musicGeneration") {
    return value === "full";
  }

  if (feature === "versionHistory") {
    return value !== false;
  }

  if (feature === "maxProjects") {
    return true;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return true;
}

export function usePlanGate(feature: PlanFeatureKey) {
  const subscriptionQuery = useSubscriptionQuery();
  const features = subscriptionQuery.data?.entitlements.features;

  if (!features) {
    return {
      allowed: false,
      tooltip: getPlanFeatureTooltip(feature),
      requiredPlanLabel: getPlanLabel(getMinimumPlanForFeature(feature)),
      isLoading: subscriptionQuery.isLoading,
    };
  }

  return {
    allowed: isFeatureAllowed(features, feature),
    tooltip: getPlanFeatureTooltip(feature),
    requiredPlanLabel: getPlanLabel(getMinimumPlanForFeature(feature)),
    isLoading: false,
  };
}

interface PlanGatedWrapProps {
  feature: PlanFeatureKey;
  children: ReactElement;
  wide?: boolean;
  block?: boolean;
}

export function PlanGatedWrap({ feature, children, wide, block }: PlanGatedWrapProps) {
  const gate = usePlanGate(feature);

  if (gate.allowed || gate.isLoading) {
    return children;
  }

  return (
    <DisabledTooltipWrap block={block} content={gate.tooltip} wide={wide}>
      {children}
    </DisabledTooltipWrap>
  );
}
