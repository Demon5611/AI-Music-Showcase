/**
 * Centralized LEGACYGATEWAY Checkout path builder.
 * Do not hardcode "/v1" outside this module — change LEGACYGATEWAY_CHECKOUT_API_VERSION instead.
 */

export function buildLegacygatewayCheckoutPath(
  apiVersion: string,
  resourcePath: string,
): string {
  const version = apiVersion.replace(/^\/+|\/+$/g, "");
  const resource = resourcePath.replace(/^\/+/, "");
  return `/${version}/${resource}`;
}

export function buildLegacygatewayAccessTokenPath(apiVersion: string): string {
  return buildLegacygatewayCheckoutPath(apiVersion, "tpay/access-token");
}

export function buildLegacygatewayPaymentsPath(apiVersion: string): string {
  return buildLegacygatewayCheckoutPath(apiVersion, "tpay/payments");
}

export function buildLegacygatewayPaymentByIdPath(apiVersion: string, payId: string): string {
  const encoded = encodeURIComponent(payId);
  return buildLegacygatewayCheckoutPath(apiVersion, `tpay/payments/${encoded}`);
}

export function buildLegacygatewayPaymentCancelPath(apiVersion: string, payId: string): string {
  const encoded = encodeURIComponent(payId);
  return buildLegacygatewayCheckoutPath(apiVersion, `tpay/payments/${encoded}/cancel`);
}
