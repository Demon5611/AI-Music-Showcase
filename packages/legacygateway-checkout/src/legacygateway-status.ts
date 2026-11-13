import type { CreditPackPurchaseStatus } from "@ai-music/shared";

/** Known LEGACYGATEWAY Checkout payment statuses we map. */
export const LEGACYGATEWAY_PROVIDER_STATUSES = {
  Created: "Created",
  Processing: "Processing",
  Succeeded: "Succeeded",
  Failed: "Failed",
  Expired: "Expired",
  CancelPaymentProcessing: "CancelPaymentProcessing",
  Returned: "Returned",
  PartialReturned: "PartialReturned",
} as const;

export type LegacygatewayProviderStatus =
  (typeof LEGACYGATEWAY_PROVIDER_STATUSES)[keyof typeof LEGACYGATEWAY_PROVIDER_STATUSES];

export type LegacygatewayStatusMappingResult = {
  domainStatus: CreditPackPurchaseStatus | null;
  /** True only for Succeeded — sole path that may grant credits after verification. */
  mayGrantCredits: boolean;
  known: boolean;
};

/**
 * Map LEGACYGATEWAY provider status → domain lifecycle.
 * Unknown statuses must never auto-succeed.
 */
export function mapLegacygatewayProviderStatus(providerStatus: string): LegacygatewayStatusMappingResult {
  const normalized = providerStatus.trim();

  switch (normalized) {
    case LEGACYGATEWAY_PROVIDER_STATUSES.Created:
    case LEGACYGATEWAY_PROVIDER_STATUSES.Processing:
      return { domainStatus: "pending", mayGrantCredits: false, known: true };
    case LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded:
      return { domainStatus: "paid", mayGrantCredits: true, known: true };
    case LEGACYGATEWAY_PROVIDER_STATUSES.Failed:
      return { domainStatus: "failed", mayGrantCredits: false, known: true };
    case LEGACYGATEWAY_PROVIDER_STATUSES.Expired:
      return { domainStatus: "expired", mayGrantCredits: false, known: true };
    case LEGACYGATEWAY_PROVIDER_STATUSES.CancelPaymentProcessing:
      return { domainStatus: null, mayGrantCredits: false, known: true };
    case LEGACYGATEWAY_PROVIDER_STATUSES.Returned:
      return { domainStatus: "refunded", mayGrantCredits: false, known: true };
    case LEGACYGATEWAY_PROVIDER_STATUSES.PartialReturned:
      return { domainStatus: "partial_refunded", mayGrantCredits: false, known: true };
    default:
      return { domainStatus: null, mayGrantCredits: false, known: false };
  }
}
