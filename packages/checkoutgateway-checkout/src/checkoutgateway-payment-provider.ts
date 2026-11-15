import { CHECKOUTGATEWAY_PAYMENT_PROVIDER, isShowcaseMode } from "@ai-music/shared";
import { majorStringToCheckoutgatewayMinorUnits } from "./checkoutgateway-amount.js";
import { CheckoutgatewayCheckoutClient } from "./checkoutgateway-client.js";
import {
  assertCheckoutgatewayProviderEnabled,
  type CheckoutgatewayProviderRuntimeConfig,
} from "./checkoutgateway-config.js";
import { CheckoutgatewayCheckoutError } from "./checkoutgateway-errors.js";
import { mapCheckoutgatewayOrderStatus } from "./checkoutgateway-status.js";
import { DemoPaymentProvider } from "./demo-payment-provider.js";
import type {
  NormalizedPayment,
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProvider,
  PaymentRefundInput,
} from "./payment-provider.js";

export class CheckoutgatewayPaymentProvider implements PaymentProvider {
  readonly providerId = CHECKOUTGATEWAY_PAYMENT_PROVIDER;
  private readonly client: CheckoutgatewayCheckoutClient;

  constructor(client: CheckoutgatewayCheckoutClient) {
    this.client = client;
  }

  static fromEnv(): PaymentProvider {
    if (isShowcaseMode()) {
      return new DemoPaymentProvider();
    }
    const config = assertCheckoutgatewayProviderEnabled();
    return CheckoutgatewayPaymentProvider.fromConfig(config);
  }

  static fromConfig(
    config: CheckoutgatewayProviderRuntimeConfig,
    fetchImpl?: ConstructorParameters<typeof CheckoutgatewayCheckoutClient>[0]["fetchImpl"],
  ): CheckoutgatewayPaymentProvider {
    return new CheckoutgatewayPaymentProvider(new CheckoutgatewayCheckoutClient({ config, fetchImpl }));
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
    const mapped = mapCheckoutgatewayOrderStatus(status.orderStatus);
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
      input.amountMinor ?? majorStringToCheckoutgatewayMinorUnits(String(input.amountMajor));
    const result = await this.client.reverseOrder({
      orderId: input.orderId,
      amountMinor,
      currency: input.currency,
      reverseId: input.refundRequestId,
    });

    if (result.reverseStatus === "declined") {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway reverse was declined", "provider_4xx", {
        code: "CHECKOUTGATEWAY_REVERSE_DECLINED",
      });
    }

    if (result.reverseStatus === "unknown") {
      throw new CheckoutgatewayCheckoutError("Checkoutgateway reverse status is unknown", "protocol", {
        code: "CHECKOUTGATEWAY_REVERSE_STATUS_UNKNOWN",
      });
    }

    return { providerReference: result.reverseId ?? input.refundRequestId };
  }
}
