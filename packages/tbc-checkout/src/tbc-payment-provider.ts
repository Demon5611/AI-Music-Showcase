import { TbcCheckoutClient, type TbcPaymentDetails } from "./tbc-client.js";
import type { TbcCheckoutRuntimeConfig } from "./tbc-config.js";
import { assertTbcCheckoutEnabled } from "./tbc-config.js";

export type TbcRefundInput = {
  /** TBC payId from CreditPackPurchase.providerPaymentId — never from frontend. */
  providerPaymentId: string;
  amount: number;
  currency: string;
  refundRequestId: string;
  /** When true, send { amount }; when false, full cancel without amount field. */
  partial: boolean;
};

/**
 * PaymentProvider-facing adapter for TBC Checkout.
 * Encapsulates refund HTTP + getPaymentDetails reconciliation.
 */
export class TbcPaymentProvider {
  constructor(private readonly client: TbcCheckoutClient) {}

  static fromEnv(): TbcPaymentProvider {
    const config = assertTbcCheckoutEnabled();
    return new TbcPaymentProvider(new TbcCheckoutClient({ config }));
  }

  static fromConfig(config: TbcCheckoutRuntimeConfig): TbcPaymentProvider {
    return new TbcPaymentProvider(new TbcCheckoutClient({ config }));
  }

  async getPaymentDetails(providerPaymentId: string): Promise<TbcPaymentDetails> {
    return this.client.getPayment(providerPaymentId);
  }

  async refund(input: TbcRefundInput): Promise<{ providerReference: string | null }> {
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
