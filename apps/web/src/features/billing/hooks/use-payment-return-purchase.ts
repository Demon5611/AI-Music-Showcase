"use client";

import {
  isPaymentReturnPurchaseId,
  isPaymentReturnTerminalStatus,
  type CreditPackPurchaseStatusView,
} from "@ai-music/shared";
import { useSearchParams } from "next/navigation";

import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import { useApi } from "@/shared/providers/api-provider";

export function usePaymentReturnPurchase() {
  const api = useApi();
  const searchParams = useSearchParams();
  const rawId =
    searchParams.get("purchaseId")?.trim() || searchParams.get("order_id")?.trim() || "";
  const purchaseId = isPaymentReturnPurchaseId(rawId) ? rawId : null;

  const query = usePollingQuery<CreditPackPurchaseStatusView>({
    queryKey: ["billing", "purchases", purchaseId],
    queryFn: () => api.billing.getPurchase(purchaseId!),
    enabled: purchaseId !== null,
    isTerminal: (data) => isPaymentReturnTerminalStatus(data?.status),
    intervalMs: 2000,
    keepPollingOnErrorWithData: true,
  });

  return { purchaseId, query };
}
