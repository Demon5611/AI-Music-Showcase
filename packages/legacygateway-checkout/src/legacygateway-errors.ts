export type LegacygatewayErrorKind =
  | "configuration"
  | "authentication"
  | "validation"
  | "provider_4xx"
  | "provider_5xx"
  | "network"
  | "protocol";

export class LegacygatewayCheckoutError extends Error {
  readonly kind: LegacygatewayErrorKind;
  readonly httpStatus?: number;
  readonly code: string;

  constructor(
    message: string,
    kind: LegacygatewayErrorKind,
    options?: { httpStatus?: number; code?: string; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "LegacygatewayCheckoutError";
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code ?? `LEGACYGATEWAY_${kind.toUpperCase()}`;
  }
}

export function toSafeLegacygatewayUserMessage(error: unknown): string {
  if (error instanceof LegacygatewayCheckoutError) {
    if (error.kind === "configuration") {
      return "Online payments are temporarily unavailable";
    }
    if (error.kind === "validation") {
      return "Invalid payment request";
    }
    if (error.kind === "authentication") {
      return "Payment provider authentication failed";
    }
    return "Payment provider error. Please try again later";
  }

  return "Payment provider error. Please try again later";
}
