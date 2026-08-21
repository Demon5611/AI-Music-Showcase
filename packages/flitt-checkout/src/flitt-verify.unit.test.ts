import assert from "node:assert/strict";
import { Prisma } from "@ai-music/db";
import { verifyFlittPaymentAgainstPurchase } from "./flitt-verify.js";

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
  verifyFlittPaymentAgainstPurchase(
    { ...purchase, priceAmount: new Prisma.Decimal("78.88") },
    { ...payment, amountMinor: 7888, actualAmountMinor: 7888 },
    config,
  ).ok,
  true,
);

assert.equal(
  verifyFlittPaymentAgainstPurchase(purchase, { ...payment, amountMinor: 900, actualAmountMinor: 900 }, config).ok,
  false,
);

assert.equal(
  verifyFlittPaymentAgainstPurchase(purchase, { ...payment, currency: "USD" }, config).ok,
  false,
);

assert.equal(
  verifyFlittPaymentAgainstPurchase(purchase, { ...payment, orderId: "other" }, config).ok,
  false,
);

assert.equal(
  verifyFlittPaymentAgainstPurchase(purchase, { ...payment, paymentId: "999" }, config).ok,
  false,
);

assert.equal(
  verifyFlittPaymentAgainstPurchase(
    { ...purchase, providerPaymentId: null },
    payment,
    config,
  ).ok,
  true,
  "first bind: stored payment_id may be empty; GET payment_id is accepted",
);

assert.equal(
  verifyFlittPaymentAgainstPurchase(purchase, { ...payment, merchantId: "1" }, config).ok,
  false,
);

console.log("flitt-verify.unit.test.ts: ok");
