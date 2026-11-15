export const CHECKOUTGATEWAY_CHECKOUT_PATH = "/api/checkout/url";
export const CHECKOUTGATEWAY_ORDER_STATUS_PATH = "/api/status/order_id";
export const CHECKOUTGATEWAY_REVERSE_PATH = "/api/reverse/order_id";

export function buildCheckoutgatewayApiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}
