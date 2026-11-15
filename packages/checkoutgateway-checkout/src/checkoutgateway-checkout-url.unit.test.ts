import assert from "node:assert/strict";
import { isTrustedCheckoutgatewayCheckoutUrl } from "./checkoutgateway-checkout-url.js";

assert.equal(
  isTrustedCheckoutgatewayCheckoutUrl(
    "https://pay.integration.example.invalid/merchants/5ad6b888f4becb0c33d543d54e57d86c/default/index.html?token=abc",
  ),
  true,
);
assert.equal(isTrustedCheckoutgatewayCheckoutUrl("http://pay.integration.example.invalid/merchants/x"), false);
assert.equal(isTrustedCheckoutgatewayCheckoutUrl("https://evil.example/merchants/x"), false);
assert.equal(isTrustedCheckoutgatewayCheckoutUrl("https://pay.integration.example.invalid.evil.example/merchants/x"), false);
assert.equal(isTrustedCheckoutgatewayCheckoutUrl("https://pay.integration.example.invalid/not-merchants/x"), false);
assert.equal(
  isTrustedCheckoutgatewayCheckoutUrl("https://user:pass@pay.integration.example.invalid/merchants/x"),
  false,
);
assert.equal(isTrustedCheckoutgatewayCheckoutUrl("javascript:alert(1)"), false);

console.log("checkoutgateway-checkout-url.unit.test.ts: ok");
