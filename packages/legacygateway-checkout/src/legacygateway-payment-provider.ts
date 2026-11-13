import { LegacygatewayCheckoutClient, type LegacygatewayPaymentDetails } from "./legacygateway-client.js";
import type { LegacygatewayCheckoutRuntimeConfig } from "./legacygateway-config.js";
import { assertLegacygatewayCheckoutEnabled } from "./legacygateway-config.js";

export type LegacygatewayRefundInput = {
  /** LEGACYGATEWAY payId from CreditPackPurchase.providerPaymentId — never from frontend. */
  providerPaymentId: string;
  amount: number;
  currency: string;
  refundRequestId: string;
  /** When true, send { amount }; when false, full cancel without amount field. */
  partial: boolean;
};

/**
 * PaymentProvider-facing adapter for LEGACYGATEWAY Checkout.
 * Encapsulates refund HTTP + getPaymentDetails reconciliation.
 */
export class LegacygatewayPaymentProvider {
  constructor(private readonly client: LegacygatewayCheckoutClient) {}

  static fromEnv(): LegacygatewayPaymentProvider {
    const config = assertLegacygatewayCheckoutEnabled();
    return new LegacygatewayPaymentProvider(new LegacygatewayCheckoutClient({ config }));
  }

  static fromConfig(config: LegacygatewayCheckoutRuntimeConfig): LegacygatewayPaymentProvider {
    return new LegacygatewayPaymentProvider(new LegacygatewayCheckoutClient({ config }));
  }

  async getPaymentDetails(providerPaymentId: string): Promise<LegacygatewayPaymentDetails> {
    return this.client.getPayment(providerPaymentId);
  }

  async refund(input: LegacygatewayRefundInput): Promise<{ providerReference: string | null }> {
    void input.currency;
    void input.refundRequestId;

    await this.client.cancelPayment(
      input.providerPaymentId,
      input.partial ? { amount: input.amount } : undefined,
    );

    return {
      providerReference: input.refundRequestId,
    };
  }
}
