import assert from "node:assert/strict";
import { Prisma } from "@ai-music/db";
import { verifyCheckoutgatewayPaymentAgainstPurchase } from "./checkoutgateway-verify.js";

const purchase = {
  merchantPaymentId: "ord-1",
  providerPaymentId: "805230052",
  priceAmount: new Prisma.Decimal(29),
  currency: "GEL",
};

const payment = {
  orderId: "ord-1",
  paymentId: "805230052",
  merchantId: "1549901",
  amountMinor: 2900,
  actualAmountMinor: 2900,
  currency: "GEL",
};

const config = { merchantId: 1549901 };

assert.equal(
  verifyCheckoutgatewayPaymentAgainstPurchase(
    { ...purchase, priceAmount: new Prisma.Decimal("78.88") },
    { ...payment, amountMinor: 7888, actualAmountMinor: 7888 },
    config,
  ).ok,
  true,
);

assert.equal(
  verifyCheckoutgatewayPaymentAgainstPurchase(purchase, { ...payment, amountMinor: 900, actualAmountMinor: 900 }, config).ok,
  false,
);

assert.equal(
  verifyCheckoutgatewayPaymentAgainstPurchase(purchase, { ...payment, currency: "USD" }, config).ok,
  false,
);

assert.equal(
  verifyCheckoutgatewayPaymentAgainstPurchase(purchase, { ...payment, orderId: "other" }, config).ok,
  false,
);

assert.equal(
  verifyCheckoutgatewayPaymentAgainstPurchase(purchase, { ...payment, paymentId: "999" }, config).ok,
  false,
);

assert.equal(
  verifyCheckoutgatewayPaymentAgainstPurchase(
    { ...purchase, providerPaymentId: null },
    payment,
    config,
  ).ok,
  true,
  "first bind: stored payment_id may be empty; GET payment_id is accepted",
);

assert.equal(
  verifyCheckoutgatewayPaymentAgainstPurchase(purchase, { ...payment, merchantId: "1" }, config).ok,
  false,
);

console.log("checkoutgateway-verify.unit.test.ts: ok");
