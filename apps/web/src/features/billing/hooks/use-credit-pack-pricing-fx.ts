"use client";

import { useQuery } from "@tanstack/react-query";
import type { CreditPackPricingFxQuote, PurchasableCreditPackageId } from "@ai-music/shared";
import { useApi } from "@/shared/providers/api-provider";

export const creditPackPricingFxQueryKey = [
  "billing",
  "credit-packs",
  "pricing-fx",
] as const;

export function useCreditPackPricingFx() {
  const api = useApi();

  return useQuery({
    queryKey: creditPackPricingFxQueryKey,
    queryFn: () => api.billing.getCreditPackPricingFx(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function gelMajorForPackage(
  quote: CreditPackPricingFxQuote | undefined,
  packageId: PurchasableCreditPackageId,
): string | null {
  if (!quote?.available) {
    return null;
  }
  return quote.packs[packageId] ?? null;
}
