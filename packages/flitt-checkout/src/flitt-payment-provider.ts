import { FLITT_PAYMENT_PROVIDER, isShowcaseMode } from "@ai-music/shared";
import { majorStringToFlittMinorUnits } from "./flitt-amount.js";
import { FlittCheckoutClient } from "./flitt-client.js";
import {
  assertFlittProviderEnabled,
  type FlittProviderRuntimeConfig,
} from "./flitt-config.js";
import { FlittCheckoutError } from "./flitt-errors.js";
import { mapFlittOrderStatus } from "./flitt-status.js";
import { DemoPaymentProvider } from "./demo-payment-provider.js";
import type {
  NormalizedPayment,
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProvider,
  PaymentRefundInput,
} from "./payment-provider.js";

export class FlittPaymentProvider implements PaymentProvider {
  readonly providerId = FLITT_PAYMENT_PROVIDER;
  private readonly client: FlittCheckoutClient;

  constructor(client: FlittCheckoutClient) {
    this.client = client;
  }

  static fromEnv(): PaymentProvider {
    if (isShowcaseMode()) {
      return new DemoPaymentProvider();
    }
    const config = assertFlittProviderEnabled();
    return FlittPaymentProvider.fromConfig(config);
  }

  static fromConfig(
    config: FlittProviderRuntimeConfig,
    fetchImpl?: ConstructorParameters<typeof FlittCheckoutClient>[0]["fetchImpl"],
  ): FlittPaymentProvider {
    return new FlittPaymentProvider(new FlittCheckoutClient({ config, fetchImpl }));
  }

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    const created = await this.client.createCheckout(input);
    return {
      provider: this.providerId,
      providerPaymentId: created.paymentId,
      approvalUrl: created.checkoutUrl,
      providerStatus: created.orderStatus,
    };
  }

  async getPayment(orderId: string): Promise<NormalizedPayment> {
    const status = await this.client.getOrderStatus(orderId);
    const mapped = mapFlittOrderStatus(status.orderStatus);
    const chargedMinor = status.actualAmountMinor ?? status.amountMinor;

    let normalizedStatus = mapped.normalizedStatus ?? "pending";
    if (mapped.mayGrantCredits && status.reversalAmountMinor > 0) {
      normalizedStatus =
        status.reversalAmountMinor >= chargedMinor ? "refunded" : "partially_refunded";
    }

    return {
      provider: this.providerId,
      providerPaymentId: status.paymentId,
      orderId: status.orderId,
      merchantId: status.merchantId,
      amountMinor: chargedMinor,
      currency: status.currency,
      reversalAmountMinor: status.reversalAmountMinor,
      providerStatus: status.orderStatus,
      normalizedStatus,
    };
  }

  async refund(input: PaymentRefundInput): Promise<{ providerReference: string | null }> {
    const amountMinor =
      input.amountMinor ?? majorStringToFlittMinorUnits(String(input.amountMajor));
    const result = await this.client.reverseOrder({
      orderId: input.orderId,
      amountMinor,
      currency: input.currency,
      reverseId: input.refundRequestId,
    });

    if (result.reverseStatus === "declined") {
      throw new FlittCheckoutError("Flitt reverse was declined", "provider_4xx", {
        code: "FLITT_REVERSE_DECLINED",
      });
    }

    if (result.reverseStatus === "unknown") {
      throw new FlittCheckoutError("Flitt reverse status is unknown", "protocol", {
        code: "FLITT_REVERSE_STATUS_UNKNOWN",
      });
    }

    return { providerReference: result.reverseId ?? input.refundRequestId };
  }
}
