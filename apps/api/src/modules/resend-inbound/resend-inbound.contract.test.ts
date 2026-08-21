/**
 * Resend inbound webhook contracts — env routing matrix + idempotency order.
 * Invariants: signature required, foreign-env ignored before claim, no open relay.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/resend-inbound/resend-inbound.contract.test.ts
 */
import assert from "node:assert/strict";
import { Webhook } from "svix";
import { BadRequestError, AppError, isAppError } from "../../common/errors.js";
import { handleResendInboundWebhook } from "./resend-inbound.service.js";
import type { ResendInboundEnv } from "@ai-music/shared";
import { ResendSendError } from "@ai-music/shared";

const productionConfig: ResendInboundEnv = {
  apiKey: "re_test",
  webhookSecret: `whsec_${Buffer.from("resend_inbound_test_secret_key_32b").toString("base64")}`,
  inboundAddress: "support@example.com",
  forwardTo: "ops-demo@example.com",
  fromIdentity: "AI Music <support@example.com>",
  appEnv: "production",
};

const stagingConfig: ResendInboundEnv = {
  ...productionConfig,
  inboundAddress: "support-staging@example.com",
  fromIdentity: "AI Music Staging <support-staging@example.com>",
  appEnv: "staging",
};

function signPayload(
  payload: object,
  secret = productionConfig.webhookSecret,
): {
  rawBody: string;
  headers: Record<string, string>;
} {
  const rawBody = JSON.stringify(payload);
  const wh = new Webhook(secret);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, rawBody);
  return {
    rawBody,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    },
  };
}

{
  // unsigned / invalid signature → rejected
  await assert.rejects(
    () =>
      handleResendInboundWebhook(
        JSON.stringify({ type: "email.received", data: { email_id: "e1" } }),
        { "svix-id": "msg_1" },
        undefined,
        {
          env: { APP_ENV: "production" },
          resolveConfig: () => productionConfig,
          verifyWebhook: () => {
            throw new Error("bad sig");
          },
        },
      ),
    (error: unknown) => error instanceof BadRequestError && error.code === "RESEND_WEBHOOK_INVALID",
  );
}

{
  // non-email.received → ignored safely (no forward)
  let forwardCalls = 0;
  const signed = signPayload({ type: "email.sent", data: { email_id: "e2" } });
  const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "production" },
    resolveConfig: () => productionConfig,
    verifyWebhook: (raw) => JSON.parse(raw) as { type: string; data?: Record<string, unknown> },
    forwardEmail: async () => {
      forwardCalls += 1;
      return { status: "forwarded", messageId: "x", emailId: "e2" };
    },
    runOnce: async () => {
      throw new Error("runOnce must not run for ignored types");
    },
  });
  assert.equal(result.processed, false);
  assert.equal(result.result, "ignored_event_type");
  assert.equal(forwardCalls, 0);
}

{
  // PRODUCTION: own address → forward once
  let forwardCalls = 0;
  let runOnceCalls = 0;
  const payload = {
    type: "email.received",
    data: {
      email_id: "email-ok",
      from: "customer@example.com",
      to: ["support@example.com"],
    },
  };
  const signed = signPayload(payload);

  const first = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "production" },
    resolveConfig: () => productionConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async (input) => {
      runOnceCalls += 1;
      await input.handler();
      return { processed: true };
    },
    forwardEmail: async (input) => {
      forwardCalls += 1;
      assert.equal(input.emailId, "email-ok");
      assert.equal(input.config.fromIdentity, "AI Music <support@example.com>");
      return { status: "forwarded", messageId: "sent-1", emailId: input.emailId };
    },
  });
  assert.equal(first.processed, true);
  assert.equal(forwardCalls, 1);
  assert.equal(runOnceCalls, 1);

  // duplicate webhook → only one forward (runOnce short-circuits)
  const second = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "production" },
    resolveConfig: () => productionConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async () => ({ processed: false }),
    forwardEmail: async () => {
      forwardCalls += 1;
      return { status: "forwarded", messageId: "sent-1", emailId: "email-ok" };
    },
  });
  assert.equal(second.processed, false);
  assert.equal(second.result, "duplicate");
  assert.equal(forwardCalls, 1);
}

{
  // PRODUCTION: staging address → ignored 2xx, NO WebhookEvent claim
  let runOnceCalls = 0;
  let forwardCalls = 0;
  const signed = signPayload({
    type: "email.received",
    data: {
      email_id: "email-staging-seen-by-prod",
      from: "customer@example.com",
      to: ["support-staging@example.com"],
    },
  });
  const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "production" },
    resolveConfig: () => productionConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async () => {
      runOnceCalls += 1;
      return { processed: true };
    },
    forwardEmail: async () => {
      forwardCalls += 1;
      return { status: "forwarded", messageId: "x", emailId: "y" };
    },
  });
  assert.equal(result.processed, false);
  assert.equal(result.result, "ignored_foreign_environment");
  assert.equal(runOnceCalls, 0);
  assert.equal(forwardCalls, 0);
}

{
  // STAGING: own address → forward once
  let forwardCalls = 0;
  const signed = signPayload({
    type: "email.received",
    data: {
      email_id: "email-staging-ok",
      from: "customer@example.com",
      to: ["support-staging@example.com"],
    },
  });
  const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "staging" },
    resolveConfig: () => stagingConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async (input) => {
      await input.handler();
      return { processed: true };
    },
    forwardEmail: async (input) => {
      forwardCalls += 1;
      assert.equal(input.config.inboundAddress, "support-staging@example.com");
      return { status: "forwarded", messageId: "s1", emailId: input.emailId };
    },
  });
  assert.equal(result.processed, true);
  assert.equal(forwardCalls, 1);
}

{
  // STAGING: production address → ignored 2xx, NO claim
  let runOnceCalls = 0;
  const signed = signPayload({
    type: "email.received",
    data: {
      email_id: "email-prod-seen-by-staging",
      from: "customer@example.com",
      to: ["support@example.com"],
    },
  });
  const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "staging" },
    resolveConfig: () => stagingConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async () => {
      runOnceCalls += 1;
      return { processed: true };
    },
    forwardEmail: async () => {
      throw new Error("must not forward");
    },
  });
  assert.equal(result.processed, false);
  assert.equal(result.result, "ignored_foreign_environment");
  assert.equal(runOnceCalls, 0);
}

{
  // Foreign-env duplicate still ignored (no claim)
  let runOnceCalls = 0;
  const signed = signPayload({
    type: "email.received",
    data: {
      email_id: "email-foreign-dup",
      from: "customer@example.com",
      to: ["support@example.com"],
    },
  });
  for (let i = 0; i < 2; i += 1) {
    const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
      env: { APP_ENV: "staging" },
      resolveConfig: () => stagingConfig,
      verifyWebhook: (raw) => JSON.parse(raw),
      runOnce: async () => {
        runOnceCalls += 1;
        return { processed: true };
      },
    });
    assert.equal(result.result, "ignored_foreign_environment");
  }
  assert.equal(runOnceCalls, 0);
}

{
  // Loop sender → ignored without claim
  let runOnceCalls = 0;
  const signed = signPayload({
    type: "email.received",
    data: {
      email_id: "email-loop",
      from: "ops-demo@example.com",
      to: ["support@example.com"],
    },
  });
  const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "production" },
    resolveConfig: () => productionConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async () => {
      runOnceCalls += 1;
      return { processed: true };
    },
  });
  assert.equal(result.result, "ignored_loop");
  assert.equal(runOnceCalls, 0);
}

{
  // Mixed recipients including configured address → process
  let forwardCalls = 0;
  const signed = signPayload({
    type: "email.received",
    data: {
      email_id: "email-mixed",
      from: "customer@example.com",
      to: ["foo@example.com", "support@example.com"],
    },
  });
  const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "production" },
    resolveConfig: () => productionConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async (input) => {
      await input.handler();
      return { processed: true };
    },
    forwardEmail: async () => {
      forwardCalls += 1;
      return { status: "forwarded", messageId: "m", emailId: "email-mixed" };
    },
  });
  assert.equal(result.processed, true);
  assert.equal(forwardCalls, 1);
}

{
  // Similar malicious address → MUST NOT match / claim
  let runOnceCalls = 0;
  const signed = signPayload({
    type: "email.received",
    data: {
      email_id: "email-malicious",
      from: "customer@example.com",
      to: ["support@example.com.attacker.tld"],
    },
  });
  const result = await handleResendInboundWebhook(signed.rawBody, signed.headers, undefined, {
    env: { APP_ENV: "production" },
    resolveConfig: () => productionConfig,
    verifyWebhook: (raw) => JSON.parse(raw),
    runOnce: async () => {
      runOnceCalls += 1;
      return { processed: true };
    },
  });
  assert.equal(result.result, "ignored_foreign_environment");
  assert.equal(runOnceCalls, 0);
}

{
  // Resend API failure → retryable / non-corrupt (handler throws, not marked success by caller)
  let marked: "ok" | "fail" | null = null;
  await assert.rejects(
    () =>
      handleResendInboundWebhook(
        JSON.stringify({
          type: "email.received",
          data: { email_id: "email-fail", from: "a@b.com", to: ["support@example.com"] },
        }),
        { "svix-id": "msg_fail" },
        undefined,
        {
          env: { APP_ENV: "production" },
          resolveConfig: () => productionConfig,
          verifyWebhook: (raw) => JSON.parse(raw),
          runOnce: async (input) => {
            try {
              await input.handler();
              marked = "ok";
              return { processed: true };
            } catch (error) {
              marked = "fail";
              throw error;
            }
          },
          forwardEmail: async () => {
            throw new ResendSendError("upstream", { statusCode: 503, retryable: true });
          },
        },
      ),
    (error: unknown) => isAppError(error) && error.statusCode === 502,
  );
  assert.equal(marked, "fail");
}

{
  // env isolation via real resolver (staging + prod address)
  await assert.rejects(
    () =>
      handleResendInboundWebhook("{}", { "svix-id": "msg_env" }, undefined, {
        env: {
          APP_ENV: "staging",
          RESEND_API_KEY: "re_test",
          RESEND_INBOUND_WEBHOOK_SECRET: "whsec_test",
          RESEND_INBOUND_ADDRESS: "support@example.com",
          RESEND_INBOUND_FORWARD_TO: "ops-demo@example.com",
        },
        resolveConfig: undefined,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "RESEND_INBOUND_ENV_ISOLATION",
  );
}

{
  // missing config → 503
  await assert.rejects(
    () =>
      handleResendInboundWebhook("{}", {}, undefined, {
        resolveConfig: () => null,
      }),
    (error: unknown) => error instanceof AppError && error.statusCode === 503,
  );
}

console.log("resend-inbound.contract.test.ts: ok");
