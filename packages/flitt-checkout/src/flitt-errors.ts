export type FlittErrorKind =
  | "configuration"
  | "validation"
  | "provider_4xx"
  | "provider_5xx"
  | "network"
  | "protocol";

export class FlittCheckoutError extends Error {
  readonly kind: FlittErrorKind;
  readonly httpStatus?: number;
  readonly code: string;

  constructor(
    message: string,
    kind: FlittErrorKind,
    options?: { httpStatus?: number; code?: string; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "FlittCheckoutError";
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code ?? `FLITT_${kind.toUpperCase()}`;
  }
}

export function toSafeFlittUserMessage(error: unknown): string {
  if (error instanceof FlittCheckoutError) {
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
