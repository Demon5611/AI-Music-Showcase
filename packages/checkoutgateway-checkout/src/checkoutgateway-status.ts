import type { CreditPackPurchaseStatus } from "@ai-music/shared";
import type { NormalizedPaymentStatus } from "./payment-provider.js";

/**
 * Checkoutgateway `order_status` values from official docs (do not invent).
 * https://docs.integration.example.invalid/api/order-parameters/
 */
export const CHECKOUTGATEWAY_ORDER_STATUSES = {
  created: "created",
  processing: "processing",
  declined: "declined",
  approved: "approved",
  expired: "expired",
  reversed: "reversed",
} as const;

export type CheckoutgatewayOrderStatus = (typeof CHECKOUTGATEWAY_ORDER_STATUSES)[keyof typeof CHECKOUTGATEWAY_ORDER_STATUSES];

export type CheckoutgatewayStatusMappingResult = {
  domainStatus: CreditPackPurchaseStatus | null;
  normalizedStatus: NormalizedPaymentStatus | null;
  /** True only for `approved` — sole path that may grant credits after verification. */
  mayGrantCredits: boolean;
  known: boolean;
};

/**
 * Map Checkoutgateway order_status → domain + normalized lifecycle.
 * Unknown statuses must never auto-succeed.
 *
 * Partial reverse: order_status stays `approved` and `reversal_amount` > 0.
 * Full reverse: order_status = `reversed` and reversal_amount === actual_amount.
 */
export function mapCheckoutgatewayOrderStatus(orderStatus: string): CheckoutgatewayStatusMappingResult {
  const normalized = orderStatus.trim().toLowerCase();

  switch (normalized) {
    case CHECKOUTGATEWAY_ORDER_STATUSES.created:
      return {
        domainStatus: "provider_created",
        normalizedStatus: "created",
        mayGrantCredits: false,
        known: true,
      };
    case CHECKOUTGATEWAY_ORDER_STATUSES.processing:
      return {
        domainStatus: "pending",
        normalizedStatus: "pending",
        mayGrantCredits: false,
        known: true,
      };
    case CHECKOUTGATEWAY_ORDER_STATUSES.approved:
      return {
        domainStatus: "paid",
        normalizedStatus: "succeeded",
        mayGrantCredits: true,
        known: true,
      };
    case CHECKOUTGATEWAY_ORDER_STATUSES.declined:
      return {
        domainStatus: "failed",
        normalizedStatus: "failed",
        mayGrantCredits: false,
        known: true,
      };
    case CHECKOUTGATEWAY_ORDER_STATUSES.expired:
      return {
        domainStatus: "expired",
        normalizedStatus: "canceled",
        mayGrantCredits: false,
        known: true,
      };
    case CHECKOUTGATEWAY_ORDER_STATUSES.reversed:
      return {
        domainStatus: "refunded",
        normalizedStatus: "refunded",
        mayGrantCredits: false,
        known: true,
      };
    default:
      return {
        domainStatus: null,
        normalizedStatus: null,
        mayGrantCredits: false,
        known: false,
      };
  }
}

export function mapCheckoutgatewayReverseStatus(reverseStatus: string): "approved" | "declined" | "unknown" {
  const normalized = reverseStatus.trim().toLowerCase();
  if (normalized === "approved") {
    return "approved";
  }
  if (normalized === "declined") {
    return "declined";
  }
  return "unknown";
}
