/**
 * Centralized TBC Checkout path builder.
 * Do not hardcode "/v1" outside this module — change TBC_CHECKOUT_API_VERSION instead.
 */

export function buildTbcCheckoutPath(
  apiVersion: string,
  resourcePath: string,
): string {
  const version = apiVersion.replace(/^\/+|\/+$/g, "");
  const resource = resourcePath.replace(/^\/+/, "");
  return `/${version}/${resource}`;
}

export function buildTbcAccessTokenPath(apiVersion: string): string {
  return buildTbcCheckoutPath(apiVersion, "tpay/access-token");
}

export function buildTbcPaymentsPath(apiVersion: string): string {
  return buildTbcCheckoutPath(apiVersion, "tpay/payments");
}

export function buildTbcPaymentByIdPath(apiVersion: string, payId: string): string {
  const encoded = encodeURIComponent(payId);
  return buildTbcCheckoutPath(apiVersion, `tpay/payments/${encoded}`);
}

export function buildTbcPaymentCancelPath(apiVersion: string, payId: string): string {
  const encoded = encodeURIComponent(payId);
  return buildTbcCheckoutPath(apiVersion, `tpay/payments/${encoded}/cancel`);
}
