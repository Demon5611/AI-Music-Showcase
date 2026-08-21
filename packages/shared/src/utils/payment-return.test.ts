/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/payment-return.test.ts
 */
import assert from "node:assert/strict";
import {
  appendPurchaseIdToReturnUrl,
  buildPaymentReturnPagePath,
  isLegacyPricingReturnPath,
  isLocalePaymentReturnPath,
  isPaymentReturnApiPath,
  isPaymentReturnPurchaseId,
  isPaymentReturnTerminalStatus,
  paymentReturnParamsFromRecord,
  readPaymentReturnPurchaseId,
  resolvePaymentReturnUxState,
} from "./payment-return.js";

assert.equal(isPaymentReturnPurchaseId("cmsufeixa0003mo0lnujdioc5"), true);
assert.equal(isPaymentReturnPurchaseId("short"), false);
assert.equal(isPaymentReturnPurchaseId("has/slash-and-more"), false);
assert.equal(isPaymentReturnPurchaseId("has.dotsssssss"), false);

{
  const params = new URLSearchParams(
    "purchaseId=cmsufeixa0003mo0lnujdioc5&signature=abc&amount=900&masked_card=4444",
  );
  assert.equal(readPaymentReturnPurchaseId(params), "cmsufeixa0003mo0lnujdioc5");
}

{
  const params = new URLSearchParams("order_id=e65859a5-2f1c-49e0-88a0-3935db31863f&amount=9");
  assert.equal(
    readPaymentReturnPurchaseId(params),
    "e65859a5-2f1c-49e0-88a0-3935db31863f",
  );
}

{
  const source = paymentReturnParamsFromRecord({
    signature: "should-ignore",
    amount: "900",
    order_id: "cmsufeixa0003mo0lnujdioc5",
  });
  assert.equal(readPaymentReturnPurchaseId(source), "cmsufeixa0003mo0lnujdioc5");
}

assert.equal(
  readPaymentReturnPurchaseId(new URLSearchParams("signature=abc&amount=900")),
  null,
);

{
  const next = appendPurchaseIdToReturnUrl(
    "https://web.example.com/pricing?signature=stolen&amount=900",
    "purchase-flitt-ready",
  );
  const url = new URL(next);
  assert.equal(url.origin + url.pathname, "https://web.example.com/pricing");
  assert.equal(url.searchParams.get("purchaseId"), "purchase-flitt-ready");
  assert.equal(url.searchParams.get("signature"), null);
  assert.equal(url.searchParams.get("amount"), null);
}

assert.equal(isPaymentReturnApiPath("/api/payment-return"), true);
assert.equal(isLocalePaymentReturnPath("/ru/payment-return"), true);
assert.equal(isLocalePaymentReturnPath("/en/payment-return/"), true);
assert.equal(isLocalePaymentReturnPath("/ru/pricing"), false);
assert.equal(isLegacyPricingReturnPath("/ru/pricing"), true);
assert.equal(isLegacyPricingReturnPath("/ru/payment-return"), false);

assert.equal(
  buildPaymentReturnPagePath("ru", "purchase-flitt-ready"),
  "/ru/payment-return?purchaseId=purchase-flitt-ready",
);

assert.equal(resolvePaymentReturnUxState("credited"), "success");
assert.equal(resolvePaymentReturnUxState("paid"), "pending");
assert.equal(resolvePaymentReturnUxState("provider_created"), "pending");
assert.equal(resolvePaymentReturnUxState("processing"), "pending");
assert.equal(resolvePaymentReturnUxState("failed"), "failed");
assert.equal(resolvePaymentReturnUxState("cancelled"), "failed");
assert.equal(isPaymentReturnTerminalStatus("credited"), true);
assert.equal(isPaymentReturnTerminalStatus("pending"), false);

assert.throws(() =>
  appendPurchaseIdToReturnUrl("https://web.example.com/api/payment-return", "bad"),
);

console.log("payment-return.test.ts: ok");
