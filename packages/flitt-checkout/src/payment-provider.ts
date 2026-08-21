/**
 * Provider-neutral payment gateway boundary.
 * Billing (CreditPackPurchase / RefundRequest / ledger) must not depend on Flitt/TBC names.
 */

export type PaymentProviderId = "flitt" | "tbc";

export type NormalizedPaymentStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded"
  | "partially_refunded";

export type PaymentCheckoutInput = {
  /** Merchant order_id — must map 1:1 to CreditPackPurchase.merchantPaymentId. */
  orderId: string;
  /** Integer minor units already snapshotted on Purchase (GEL tetri for Flitt). */
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
  callbackUrl: string;
};

export type PaymentCheckoutResult = {
  provider: PaymentProviderId;
  providerPaymentId: string;
  approvalUrl: string;
  providerStatus: string;
};

export type NormalizedPayment = {
  provider: PaymentProviderId;
  providerPaymentId: string;
  orderId: string;
  merchantId: string;
  amountMinor: number;
  currency: string;
  reversalAmountMinor: number;
  providerStatus: string;
  normalizedStatus: NormalizedPaymentStatus;
};

export type PaymentRefundInput = {
  orderId: string;
  amountMajor: number;
  /** Integer minor units of the refund in the purchase currency (GEL tetri). */
  amountMinor?: number;
  currency: string;
  refundRequestId: string;
  partial: boolean;
};

export type PaymentProvider = {
  readonly providerId: PaymentProviderId;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
  getPayment(orderId: string): Promise<NormalizedPayment>;
  refund(input: PaymentRefundInput): Promise<{ providerReference: string | null }>;
};
