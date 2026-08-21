export type TbcErrorKind =
  | "configuration"
  | "authentication"
  | "validation"
  | "provider_4xx"
  | "provider_5xx"
  | "network"
  | "protocol";

export class TbcCheckoutError extends Error {
  readonly kind: TbcErrorKind;
  readonly httpStatus?: number;
  readonly code: string;

  constructor(
    message: string,
    kind: TbcErrorKind,
    options?: { httpStatus?: number; code?: string; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "TbcCheckoutError";
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code ?? `TBC_${kind.toUpperCase()}`;
  }
}

export function toSafeTbcUserMessage(error: unknown): string {
  if (error instanceof TbcCheckoutError) {
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
