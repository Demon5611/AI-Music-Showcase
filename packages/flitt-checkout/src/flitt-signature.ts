import { createHash, timingSafeEqual } from "node:crypto";

const EXCLUDED_SIGNATURE_KEYS = new Set(["signature", "response_signature_string"]);

export type FlittSignableParams = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Flitt signature parameter values.
 * Official algorithm (docs.flitt.com/api/building-signature):
 * - skip empty string / null / undefined
 * - keep numeric 0
 * - skip `signature` and `response_signature_string`
 * - nested objects/arrays are JSON-stringified (callback `additional_info` is already a string)
 */
export function stringifyFlittSignParam(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value === "" ? null : value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Unwrap `{ request: {...} }` / `{ response: {...} }` so the outer wrapper is never signed.
 */
export function unwrapFlittSignableObject(params: FlittSignableParams): FlittSignableParams {
  const request = params.request;
  if (isPlainObject(request) && !("signature" in params && params.signature)) {
    return request;
  }

  const response = params.response;
  if (isPlainObject(response) && typeof params.signature !== "string") {
    return response;
  }

  return params;
}

function collectSortedValues(params: FlittSignableParams): string[] {
  const inner = unwrapFlittSignableObject(params);
  const keys = Object.keys(inner).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const values: string[] = [];

  for (const key of keys) {
    if (EXCLUDED_SIGNATURE_KEYS.has(key)) {
      continue;
    }
    const serialized = stringifyFlittSignParam(inner[key]);
    if (serialized === null) {
      continue;
    }
    values.push(serialized);
  }

  return values;
}

/**
 * SHA1(payment_key|sorted_values joined by `|`), lowercase hex.
 * Never log the returned preimage — it contains the payment key.
 */
export function generateFlittSignature(paymentKey: string, params: FlittSignableParams): string {
  const values = collectSortedValues(params);
  const preimage = [paymentKey, ...values].join("|");
  return createHash("sha1").update(preimage, "utf8").digest("hex");
}

export function signFlittParams(
  paymentKey: string,
  params: FlittSignableParams,
): Record<string, unknown> {
  const inner = { ...unwrapFlittSignableObject(params) };
  delete inner.signature;
  delete inner.response_signature_string;
  return {
    ...inner,
    signature: generateFlittSignature(paymentKey, inner),
  };
}

function hexSignaturesEqual(expected: string, actual: string): boolean {
  if (expected.length !== actual.length || expected.length === 0) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(actual, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Verify Flitt request/response/callback signature.
 * Returns false on missing/invalid signature — caller must not trust the payload.
 */
export function verifyFlittSignature(paymentKey: string, params: FlittSignableParams): boolean {
  const inner = unwrapFlittSignableObject(params);
  const provided = inner.signature;
  if (typeof provided !== "string" || provided.length !== 40) {
    return false;
  }

  const expected = generateFlittSignature(paymentKey, inner);
  return hexSignaturesEqual(expected, provided.toLowerCase());
}
