export const FLITT_CHECKOUT_PATH = "/api/checkout/url";
export const FLITT_ORDER_STATUS_PATH = "/api/status/order_id";
export const FLITT_REVERSE_PATH = "/api/reverse/order_id";

export function buildFlittApiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}
