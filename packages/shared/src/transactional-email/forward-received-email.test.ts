/**
 * Forward received email — From/Reply-To spoofing invariants + recipient gate.
 * Run: pnpm --filter @ai-music/shared exec tsx src/transactional-email/forward-received-email.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { forwardReceivedEmailViaResend } from "./forward-received-email.js";
import type { ResendInboundEnv } from "./resolve-inbound-env.js";

const productionConfig: ResendInboundEnv = {
  apiKey: "re_test_key",
  webhookSecret: "whsec_test",
  inboundAddress: "support@example.com",
  forwardTo: "ops-demo@example.com",
  fromIdentity: "AI Music <support@example.com>",
  appEnv: "production",
};

const stagingConfig: ResendInboundEnv = {
  apiKey: "re_test_key",
  webhookSecret: "whsec_test",
  inboundAddress: "support-staging@example.com",
  forwardTo: "ops-demo@example.com",
  fromIdentity: "AI Music Staging <support-staging@example.com>",
  appEnv: "staging",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("forwardReceivedEmailViaResend", () => {
  it("ignores different recipient without calling send", async () => {
    let sendCalls = 0;
    globalThis.fetch = (async () => {
      sendCalls += 1;
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const result = await forwardReceivedEmailViaResend({
      emailId: "email-1",
      config: productionConfig,
      webhookTo: ["support-staging@example.com"],
      webhookFrom: "customer@example.com",
    });

    assert.equal(result.status, "ignored");
    if (result.status === "ignored") {
      assert.equal(result.reason, "recipient_not_allowed");
    }
    assert.equal(sendCalls, 0);
  });

  it("ignores loop from sibling env inbound address without send", async () => {
    let sendCalls = 0;
    globalThis.fetch = (async () => {
      sendCalls += 1;
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const result = await forwardReceivedEmailViaResend({
      emailId: "email-2",
      config: productionConfig,
      webhookTo: ["support@example.com"],
      webhookFrom: "support-staging@example.com",
    });

    assert.equal(result.status, "ignored");
    if (result.status === "ignored") {
      assert.equal(result.reason, "loop_from_blocked");
    }
    assert.equal(sendCalls, 0);
  });

  it("forwards production with verified From, Reply-To, and env header", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? init.body : null;
      const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null;
      calls.push({ url, body });

      if (url.includes("/emails/receiving/") && !url.includes("/attachments")) {
        return new Response(
          JSON.stringify({
            id: "email-3",
            from: "customer@example.com",
            to: ["support@example.com"],
            cc: [],
            bcc: [],
            reply_to: [],
            subject: "Fwd: Fwd: Need help",
            text: "Hello support",
            html: "<p>Hello support</p>",
            message_id: "<orig@example.com>",
            received_for: ["support@example.com"],
            attachments: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "https://api.resend.com/emails") {
        return new Response(JSON.stringify({ id: "sent-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await forwardReceivedEmailViaResend({
      emailId: "email-3",
      config: productionConfig,
      webhookTo: ["support@example.com"],
      webhookFrom: "customer@example.com",
    });

    assert.equal(result.status, "forwarded");
    const send = calls.find((c) => c.url === "https://api.resend.com/emails");
    assert.ok(send?.body);
    assert.equal(send.body.from, "AI Music <support@example.com>");
    assert.notEqual(send.body.from, "customer@example.com");
    assert.equal(send.body.reply_to, "customer@example.com");
    assert.deepEqual(send.body.to, ["ops-demo@example.com"]);
    assert.equal(send.body.subject, "Need help");
    const headers = send.body.headers as Record<string, string> | undefined;
    assert.equal(headers?.["X-Original-Message-ID"], "<orig@example.com>");
    assert.equal(headers?.["X-AI-Music-Environment"], "production");
  });

  it("forwards staging with [STAGING] subject and staging From", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? init.body : null;
      const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null;
      calls.push({ url, body });

      if (url.includes("/emails/receiving/") && !url.includes("/attachments")) {
        return new Response(
          JSON.stringify({
            id: "email-staging",
            from: "customer@example.com",
            to: ["support-staging@example.com"],
            cc: [],
            bcc: [],
            reply_to: [],
            subject: "Staging help",
            text: "Hello",
            html: null,
            message_id: null,
            received_for: ["support-staging@example.com"],
            attachments: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "https://api.resend.com/emails") {
        return new Response(JSON.stringify({ id: "sent-s" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await forwardReceivedEmailViaResend({
      emailId: "email-staging",
      config: stagingConfig,
      webhookTo: ["support-staging@example.com"],
      webhookFrom: "customer@example.com",
    });

    assert.equal(result.status, "forwarded");
    const send = calls.find((c) => c.url === "https://api.resend.com/emails");
    assert.ok(send?.body);
    assert.equal(
      send.body.from,
      "AI Music Staging <support-staging@example.com>",
    );
    assert.equal(send.body.subject, "[STAGING] Staging help");
    assert.equal(
      (send.body.headers as Record<string, string>)["X-AI-Music-Environment"],
      "staging",
    );
  });

  it("surfaces retryable Resend failures without marking success locally", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/emails/receiving/")) {
        return new Response(
          JSON.stringify({
            id: "email-4",
            from: "customer@example.com",
            to: ["support@example.com"],
            subject: "x",
            text: "y",
            html: null,
            message_id: null,
            reply_to: [],
            cc: [],
            bcc: [],
            received_for: [],
            attachments: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "https://api.resend.com/emails") {
        return new Response(JSON.stringify({ message: "upstream down" }), { status: 503 });
      }
      return new Response("no", { status: 404 });
    }) as typeof fetch;

    await assert.rejects(
      () =>
        forwardReceivedEmailViaResend({
          emailId: "email-4",
          config: productionConfig,
          webhookTo: ["support@example.com"],
          webhookFrom: "customer@example.com",
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /upstream down|resend_http_503/);
        return true;
      },
    );
  });
});
