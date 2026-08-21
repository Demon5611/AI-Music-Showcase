import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  generateFlittSignature,
  stringifyFlittSignParam,
  unwrapFlittSignableObject,
  verifyFlittSignature,
} from "./flitt-signature.js";

const OFFICIAL_TEST_KEY = "test";

{
  const params = {
    amount: 1000,
    currency: "GEL",
    merchant_id: 1549901,
    order_desc: "Test payment",
    order_id: "TestOrder2",
    server_callback_url: "http://myshop/callback/",
  };
  const officialPreimage =
    "test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/";
  const expected = createHash("sha1").update(officialPreimage, "utf8").digest("hex");
  const signature = generateFlittSignature(OFFICIAL_TEST_KEY, params);
  assert.equal(signature, expected);
  assert.equal(verifyFlittSignature(OFFICIAL_TEST_KEY, { ...params, signature }), true);
}

{
  const first = generateFlittSignature(OFFICIAL_TEST_KEY, {
    order_id: "A",
    amount: 1,
    currency: "GEL",
  });
  const second = generateFlittSignature(OFFICIAL_TEST_KEY, {
    currency: "GEL",
    amount: 1,
    order_id: "A",
  });
  assert.equal(first, second);
}

{
  const nested = unwrapFlittSignableObject({
    request: {
      amount: 1000,
      currency: "GEL",
      merchant_id: 1549901,
      order_desc: "Test payment",
      order_id: "TestOrder2",
      server_callback_url: "http://myshop/callback/",
    },
  });
  const officialPreimage =
    "test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/";
  assert.equal(
    generateFlittSignature(OFFICIAL_TEST_KEY, nested),
    createHash("sha1").update(officialPreimage, "utf8").digest("hex"),
  );
}

{
  const withEmpty = generateFlittSignature(OFFICIAL_TEST_KEY, {
    amount: 1000,
    currency: "GEL",
    merchant_id: 1549901,
    order_desc: "Test payment",
    order_id: "TestOrder2",
    server_callback_url: "http://myshop/callback/",
    product_id: "",
    sender_email: null,
    fee: undefined,
  });
  const officialPreimage =
    "test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/";
  assert.equal(withEmpty, createHash("sha1").update(officialPreimage, "utf8").digest("hex"));
}

{
  const withZero = generateFlittSignature(OFFICIAL_TEST_KEY, {
    amount: 1000,
    currency: "GEL",
    merchant_id: 1549901,
    reversal_amount: 0,
  });
  const withoutZero = generateFlittSignature(OFFICIAL_TEST_KEY, {
    amount: 1000,
    currency: "GEL",
    merchant_id: 1549901,
  });
  assert.notEqual(withZero, withoutZero);
  assert.equal(stringifyFlittSignParam(0), "0");
}

{
  const unicode = generateFlittSignature(OFFICIAL_TEST_KEY, {
    order_desc: "Пакет Creator — 2000 кредитов",
    amount: 2900,
    currency: "GEL",
    merchant_id: 1549901,
    order_id: "ord-1",
  });
  const expected = createHash("sha1")
    .update("test|2900|GEL|1549901|Пакет Creator — 2000 кредитов|ord-1", "utf8")
    .digest("hex");
  assert.equal(unicode, expected);
}

{
  const objectInfo = generateFlittSignature(OFFICIAL_TEST_KEY, {
    additional_info: { capture_status: null, is_test: true },
    amount: 200,
  });
  const stringInfo = generateFlittSignature(OFFICIAL_TEST_KEY, {
    additional_info: JSON.stringify({ capture_status: null, is_test: true }),
    amount: 200,
  });
  assert.equal(objectInfo, stringInfo);
}

{
  const params = {
    amount: 1000,
    currency: "GEL",
    merchant_id: 1549901,
    order_desc: "Test payment",
    order_id: "TestOrder2",
    server_callback_url: "http://myshop/callback/",
  };
  const signature = generateFlittSignature(OFFICIAL_TEST_KEY, params);
  assert.equal(
    verifyFlittSignature(OFFICIAL_TEST_KEY, {
      ...params,
      signature,
      response_signature_string: "**********|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/",
    }),
    true,
  );
}

{
  const params = {
    amount: 1000,
    currency: "GEL",
    merchant_id: 1549901,
    order_desc: "Test payment",
    order_id: "TestOrder2",
    server_callback_url: "http://myshop/callback/",
  };
  const signature = generateFlittSignature(OFFICIAL_TEST_KEY, params);
  const tampered = { ...params, amount: 9, signature };
  assert.equal(verifyFlittSignature(OFFICIAL_TEST_KEY, tampered), false);
}

{
  assert.equal(
    verifyFlittSignature(OFFICIAL_TEST_KEY, {
      amount: 1000,
      currency: "GEL",
      merchant_id: 1549901,
    }),
    false,
  );
}

{
  const params = {
    amount: 1000,
    currency: "GEL",
    merchant_id: 1549901,
    order_desc: "Test payment",
    order_id: "TestOrder2",
    server_callback_url: "http://myshop/callback/",
  };
  const signature = generateFlittSignature(OFFICIAL_TEST_KEY, params);
  const wrapped = {
    response: {
      ...params,
      signature,
    },
  };
  assert.equal(verifyFlittSignature(OFFICIAL_TEST_KEY, wrapped), true);
}

console.log("flitt-signature.unit.test.ts: ok");
