"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { useApi } from "@/shared/providers/api-provider";
import { subscriptionQueryKey } from "@/features/billing/hooks/invalidate-credits-balance";

export function useSubscriptionQuery() {
  const api = useApi();
  const authReady = useAuthReady();

  return useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: () => api.billing.getSubscription(),
    enabled: authReady,
  });
}
