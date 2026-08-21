"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  isHttpsAbsoluteUrl,
  isPurchasableCreditPackageId,
  type PurchasableCreditPackageId,
} from "@ai-music/shared";
import { useTranslations } from "next-intl";

import { parseApiError } from "@/shared/lib/parse-api-error";
import { useApi } from "@/shared/providers/api-provider";

export const creditPackCheckoutStatusQueryKey = [
  "billing",
  "credit-packs",
  "checkout-status",
] as const;

export function useCreditPackCheckout() {
  const api = useApi();
  const t = useTranslations("Pricing.packages");
  const [pendingPackageId, setPendingPackageId] = useState<PurchasableCreditPackageId | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const clientRequestIdsRef = useRef<Partial<Record<PurchasableCreditPackageId, string>>>(
    {},
  );

  const statusQuery = useQuery({
    queryKey: creditPackCheckoutStatusQueryKey,
    queryFn: () => api.billing.getCreditPackCheckoutStatus(),
    staleTime: 30_000,
  });

  const checkoutEnabled = statusQuery.data?.checkoutEnabled === true;
  const busy = pendingPackageId !== null;

  const startCheckout = useCallback(
    async (packageId: PurchasableCreditPackageId) => {
      if (!checkoutEnabled || inFlightRef.current || !isPurchasableCreditPackageId(packageId)) {
        return;
      }

      inFlightRef.current = true;
      setError(null);
      setPendingPackageId(packageId);

      try {
        const clientRequestId =
          clientRequestIdsRef.current[packageId] ?? crypto.randomUUID();
        clientRequestIdsRef.current[packageId] = clientRequestId;

        const result = await api.billing.createCreditPackCheckout({
          packageId,
          clientRequestId,
        });

        if (!isHttpsAbsoluteUrl(result.approvalUrl)) {
          setError(t("checkoutRedirectInvalid"));
          setPendingPackageId(null);
          inFlightRef.current = false;
          return;
        }

        window.location.assign(result.approvalUrl);
      } catch (cause) {
        setError(parseApiError(cause, t("checkoutFailed"), { preferFallback: true }));
        setPendingPackageId(null);
        inFlightRef.current = false;
      }
    },
    [api, checkoutEnabled, t],
  );

  return {
    checkoutEnabled,
    statusLoading: statusQuery.isPending,
    busy,
    pendingPackageId,
    error,
    startCheckout,
  };
}

export type CreditPackCheckoutControls = ReturnType<typeof useCreditPackCheckout>;
