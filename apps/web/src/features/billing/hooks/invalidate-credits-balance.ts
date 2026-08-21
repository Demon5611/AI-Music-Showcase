"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export const subscriptionQueryKey = ["billing", "subscription"] as const;
export const legacyCreditsBalanceQueryKey = ["credits", "balance"] as const;

export async function invalidateCreditsBalance(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: subscriptionQueryKey }),
    queryClient.invalidateQueries({ queryKey: legacyCreditsBalanceQueryKey }),
  ]);
}

export function useInvalidateCreditsBalance() {
  const queryClient = useQueryClient();

  return useCallback(() => invalidateCreditsBalance(queryClient), [queryClient]);
}
