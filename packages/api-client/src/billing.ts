import type {
  CreateCreditPackCheckoutInput,
  CreditPackCheckoutClientResult,
  CreditPackCheckoutStatus,
  CreditPackPricingFxQuote,
  CreditPackPurchaseStatusView,
  SubscriptionDto,
} from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createBillingApi(client: ApiClient) {
  return {
    getSubscription: () => client.get<SubscriptionDto>("/api/billing/subscription"),
    getCreditPackCheckoutStatus: () =>
      client.get<CreditPackCheckoutStatus>("/api/billing/credit-packs/checkout-status"),
    getCreditPackPricingFx: () =>
      client.get<CreditPackPricingFxQuote>("/api/billing/credit-packs/pricing-fx"),
    createCreditPackCheckout: (body: CreateCreditPackCheckoutInput) =>
      client.post<CreditPackCheckoutClientResult>(
        "/api/billing/credit-packs/checkout",
        body,
      ),
    getPurchase: (purchaseId: string) =>
      client.get<CreditPackPurchaseStatusView>(
        `/api/billing/purchases/${encodeURIComponent(purchaseId)}`,
      ),
  };
}
