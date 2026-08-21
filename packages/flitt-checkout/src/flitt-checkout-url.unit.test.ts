import assert from "node:assert/strict";
import { isTrustedFlittCheckoutUrl } from "./flitt-checkout-url.js";

assert.equal(
  isTrustedFlittCheckoutUrl(
    "https://pay.flitt.com/merchants/5ad6b888f4becb0c33d543d54e57d86c/default/index.html?token=abc",
  ),
  true,
);
assert.equal(isTrustedFlittCheckoutUrl("http://pay.flitt.com/merchants/x"), false);
assert.equal(isTrustedFlittCheckoutUrl("https://evil.example/merchants/x"), false);
assert.equal(isTrustedFlittCheckoutUrl("https://pay.flitt.com.evil.example/merchants/x"), false);
assert.equal(isTrustedFlittCheckoutUrl("https://pay.flitt.com/not-merchants/x"), false);
assert.equal(
  isTrustedFlittCheckoutUrl("https://user:pass@pay.flitt.com/merchants/x"),
  false,
);
assert.equal(isTrustedFlittCheckoutUrl("javascript:alert(1)"), false);

console.log("flitt-checkout-url.unit.test.ts: ok");
