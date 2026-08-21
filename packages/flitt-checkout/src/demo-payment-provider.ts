import { FLITT_PAYMENT_PROVIDER } from "@ai-music/shared";
import type {
  NormalizedPayment,
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProvider,
  PaymentRefundInput,
} from "./payment-provider.js";

/**
 * Deterministic PaymentProvider for SHOWCASE_MODE.
 * No merchant credentials and no hosted-checkout HTTP.
 */
export class DemoPaymentProvider implements PaymentProvider {
  readonly providerId = FLITT_PAYMENT_PROVIDER;

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    return {
      provider: this.providerId,
      providerPaymentId: `pay_demo_${input.orderId}`,
      approvalUrl: `https://example.invalid/checkout/${encodeURIComponent(input.orderId)}`,
      providerStatus: "created",
    };
  }

  async getPayment(orderId: string): Promise<NormalizedPayment> {
    return {
      provider: this.providerId,
      providerPaymentId: `pay_demo_${orderId}`,
      orderId,
      merchantId: "merchant_demo_001",
      amountMinor: 100,
      currency: "GEL",
      reversalAmountMinor: 0,
      providerStatus: "approved",
      normalizedStatus: "succeeded",
    };
  }

  async refund(input: PaymentRefundInput): Promise<{ providerReference: string | null }> {
    return { providerReference: `refund_demo_${input.refundRequestId}` };
  }
}

export function createDemoPaymentProvider(): DemoPaymentProvider {
  return new DemoPaymentProvider();
}
