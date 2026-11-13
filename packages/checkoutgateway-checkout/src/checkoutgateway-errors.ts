export type CheckoutgatewayErrorKind =
  | "configuration"
  | "validation"
  | "provider_4xx"
  | "provider_5xx"
  | "network"
  | "protocol";

export class CheckoutgatewayCheckoutError extends Error {
  readonly kind: CheckoutgatewayErrorKind;
  readonly httpStatus?: number;
  readonly code: string;

  constructor(
    message: string,
    kind: CheckoutgatewayErrorKind,
    options?: { httpStatus?: number; code?: string; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "CheckoutgatewayCheckoutError";
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code ?? `CHECKOUTGATEWAY_${kind.toUpperCase()}`;
  }
}

export function toSafeCheckoutgatewayUserMessage(error: unknown): string {
  if (error instanceof CheckoutgatewayCheckoutError) {
    if (error.kind === "configuration") {
      return "Online payments are temporarily unavailable";
    }
    if (error.kind === "validation") {
      return "Invalid payment request";
    }
    return "Payment provider error. Please try again later";
  }

  return "Payment provider error. Please try again later";
}
