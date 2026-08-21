/**
 * Inbound forward helpers — env routing, exact recipient match, loop, subject.
 * Run: pnpm --filter @ai-music/shared exec tsx src/transactional-email/inbound-forward.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInboundForwardBodies,
  buildInboundForwardSubject,
  isAllowedInboundRecipient,
  normalizeInboundForwardSubject,
  selectInboundAttachmentsForForward,
  shouldIgnoreInboundForLoop,
} from "./inbound-forward.js";
import { isAllowedResendAttachmentDownloadUrl } from "./resend-receiving.js";
import {
  ResendInboundEnvError,
  RESEND_INBOUND_ADDRESS_PRODUCTION,
  RESEND_INBOUND_ADDRESS_STAGING,
  assertResendInboundAddressForAppEnv,
  resolveResendInboundFromEnv,
} from "./resolve-inbound-env.js";

describe("inbound recipient gate", () => {
  it("allows only the configured inbound address (exact match)", () => {
    assert.equal(
      isAllowedInboundRecipient({
        to: ["support@example.com"],
        inboundAddress: "support@example.com",
      }),
      true,
    );
    assert.equal(
      isAllowedInboundRecipient({
        to: ["other@example.com"],
        inboundAddress: "support@example.com",
      }),
      false,
    );
    assert.equal(
      isAllowedInboundRecipient({
        to: ["support@example.com.attacker.tld"],
        inboundAddress: "support@example.com",
      }),
      false,
    );
    assert.equal(
      isAllowedInboundRecipient({
        to: ["SUPPORT@example.com"],
        inboundAddress: "support@example.com",
      }),
      true,
    );
  });

  it("matches received_for alias when to differs", () => {
    assert.equal(
      isAllowedInboundRecipient({
        to: ["inbound@resend.dev"],
        receivedFor: ["support@example.com"],
        inboundAddress: "support@example.com",
      }),
      true,
    );
  });

  it("processes mixed To when configured address is present", () => {
    assert.equal(
      isAllowedInboundRecipient({
        to: ["foo@example.com", "support-staging@example.com"],
        inboundAddress: "support-staging@example.com",
      }),
      true,
    );
  });
});

describe("loop prevention", () => {
  it("ignores mail from either deployed alias, forward target, or from-identity", () => {
    assert.equal(
      shouldIgnoreInboundForLoop({
        from: "support@example.com",
        inboundAddress: "support-staging@example.com",
        forwardTo: "ops-demo@example.com",
        fromIdentity: "AI Music Staging <support-staging@example.com>",
      }),
      true,
    );
    assert.equal(
      shouldIgnoreInboundForLoop({
        from: "support-staging@example.com",
        inboundAddress: "support@example.com",
        forwardTo: "ops-demo@example.com",
        fromIdentity: "AI Music <support@example.com>",
      }),
      true,
    );
    assert.equal(
      shouldIgnoreInboundForLoop({
        from: "ops-demo@example.com",
        inboundAddress: "support@example.com",
        forwardTo: "ops-demo@example.com",
        fromIdentity: "AI Music <support@example.com>",
      }),
      true,
    );
    assert.equal(
      shouldIgnoreInboundForLoop({
        from: "customer@example.com",
        inboundAddress: "support@example.com",
        forwardTo: "ops-demo@example.com",
        fromIdentity: "AI Music <support@example.com>",
      }),
      false,
    );
  });
});

describe("subject normalization", () => {
  it("does not stack Fwd prefixes", () => {
    assert.equal(normalizeInboundForwardSubject("Fwd: Fwd: Hello"), "Hello");
    assert.equal(normalizeInboundForwardSubject("Fw: Re: Hello"), "Re: Hello");
    assert.equal(normalizeInboundForwardSubject("Hello"), "Hello");
  });

  it("prefixes staging once and leaves production unchanged", () => {
    assert.equal(
      buildInboundForwardSubject({ subject: "Help", appEnv: "production" }),
      "Help",
    );
    assert.equal(
      buildInboundForwardSubject({ subject: "Help", appEnv: "staging" }),
      "[STAGING] Help",
    );
    assert.equal(
      buildInboundForwardSubject({
        subject: "[STAGING] Help",
        appEnv: "staging",
      }),
      "[STAGING] Help",
    );
    assert.equal(
      buildInboundForwardSubject({
        subject: "Fwd: Fwd: Help",
        appEnv: "staging",
      }),
      "[STAGING] Help",
    );
  });
});

describe("attachment selection limits", () => {
  it("enforces count and size limits and keeps metadata notes", () => {
    const selected = selectInboundAttachmentsForForward({
      attachments: [
        {
          id: "a1",
          filename: "ok.pdf",
          contentType: "application/pdf",
          size: 100,
          downloadUrl: "https://inbound-cdn.resend.com/a1",
        },
        {
          id: "a2",
          filename: "big.pdf",
          contentType: "application/pdf",
          size: 9 * 1024 * 1024,
          downloadUrl: "https://inbound-cdn.resend.com/a2",
        },
      ],
      maxCount: 1,
      maxBytes: 1024,
      maxTotalBytes: 2048,
    });

    assert.equal(selected.include.length, 1);
    assert.equal(selected.include[0]?.id, "a1");
    assert.equal(selected.notes.some((n) => n.id === "a2" && !n.included), true);
  });
});

describe("attachment download URL allowlist", () => {
  it("allows only https Resend hosts", () => {
    assert.equal(
      isAllowedResendAttachmentDownloadUrl(
        "https://inbound-cdn.resend.com/x/attachments/y?sig=1",
      ),
      true,
    );
    assert.equal(
      isAllowedResendAttachmentDownloadUrl("https://evil.example.com/file"),
      false,
    );
    assert.equal(
      isAllowedResendAttachmentDownloadUrl("http://inbound-cdn.resend.com/x"),
      false,
    );
  });
});

describe("forward body envelope", () => {
  it("preserves original sender/recipient/subject in text without spoofing From", () => {
    const bodies = buildInboundForwardBodies({
      originalFrom: "customer@example.com",
      originalTo: ["support@example.com"],
      originalSubject: "Help",
      text: "Body",
      html: "<p>Body</p>",
      attachmentNotes: [],
    });
    assert.match(bodies.text, /From: customer@example.com/);
    assert.match(bodies.text, /To: support@example.com/);
    assert.match(bodies.text, /Subject: Help/);
    assert.match(bodies.text, /Body/);
  });
});

describe("resolveResendInboundFromEnv", () => {
  it("requires dedicated webhook secret and addresses", () => {
    assert.equal(resolveResendInboundFromEnv({}), null);
  });

  it("binds production address only under APP_ENV=production", () => {
    const config = resolveResendInboundFromEnv({
      APP_ENV: "production",
      RESEND_API_KEY: "re_test",
      RESEND_INBOUND_WEBHOOK_SECRET: "whsec_test",
      RESEND_INBOUND_ADDRESS: RESEND_INBOUND_ADDRESS_PRODUCTION,
      RESEND_INBOUND_FORWARD_TO: "ops-demo@example.com",
    });
    assert.ok(config);
    assert.equal(config?.inboundAddress, RESEND_INBOUND_ADDRESS_PRODUCTION);
    assert.equal(config?.appEnv, "production");
    assert.equal(config?.fromIdentity, "AI Music <support@example.com>");
  });

  it("binds staging address only under APP_ENV=staging", () => {
    const config = resolveResendInboundFromEnv({
      APP_ENV: "staging",
      RESEND_API_KEY: "re_test",
      RESEND_INBOUND_WEBHOOK_SECRET: "whsec_test",
      RESEND_INBOUND_ADDRESS: RESEND_INBOUND_ADDRESS_STAGING,
      RESEND_INBOUND_FORWARD_TO: "ops-demo@example.com",
    });
    assert.ok(config);
    assert.equal(config?.inboundAddress, RESEND_INBOUND_ADDRESS_STAGING);
    assert.equal(config?.appEnv, "staging");
    assert.equal(
      config?.fromIdentity,
      "AI Music Staging <support-staging@example.com>",
    );
  });

  it("fail-closes on APP_ENV/address mismatch", () => {
    assert.throws(
      () =>
        resolveResendInboundFromEnv({
          APP_ENV: "staging",
          RESEND_API_KEY: "re_test",
          RESEND_INBOUND_WEBHOOK_SECRET: "whsec_test",
          RESEND_INBOUND_ADDRESS: RESEND_INBOUND_ADDRESS_PRODUCTION,
          RESEND_INBOUND_FORWARD_TO: "ops-demo@example.com",
        }),
      (error: unknown) =>
        error instanceof ResendInboundEnvError &&
        error.code === "RESEND_INBOUND_ENV_ISOLATION",
    );

    assert.throws(
      () =>
        resolveResendInboundFromEnv({
          APP_ENV: "production",
          RESEND_API_KEY: "re_test",
          RESEND_INBOUND_WEBHOOK_SECRET: "whsec_test",
          RESEND_INBOUND_ADDRESS: RESEND_INBOUND_ADDRESS_STAGING,
          RESEND_INBOUND_FORWARD_TO: "ops-demo@example.com",
        }),
      ResendInboundEnvError,
    );

    assert.throws(
      () =>
        assertResendInboundAddressForAppEnv({
          appEnv: "development",
          inboundAddress: RESEND_INBOUND_ADDRESS_PRODUCTION,
        }),
      ResendInboundEnvError,
    );
  });

  it("does not use TRANSACTIONAL_EMAIL_FROM for inbound From", () => {
    const config = resolveResendInboundFromEnv({
      APP_ENV: "production",
      RESEND_API_KEY: "re_test",
      RESEND_INBOUND_WEBHOOK_SECRET: "whsec_test",
      RESEND_INBOUND_ADDRESS: RESEND_INBOUND_ADDRESS_PRODUCTION,
      RESEND_INBOUND_FORWARD_TO: "ops-demo@example.com",
      TRANSACTIONAL_EMAIL_FROM: "noreply@example.com",
    });
    assert.equal(config?.fromIdentity, "AI Music <support@example.com>");
  });
});
