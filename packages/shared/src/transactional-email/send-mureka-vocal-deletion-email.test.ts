import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendMurekaVocalDeletionEmail } from "./send-mureka-vocal-deletion-email.js";

describe("sendMurekaVocalDeletionEmail", () => {
  it("fails closed when email env is missing", async () => {
    const result = await sendMurekaVocalDeletionEmail({
      requestId: "req_1",
      vocalIds: ["vocal-1"],
      idempotencyKey: "provider-data-deletion-submit-mureka-req_1",
      env: {},
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "email_provider_not_configured");
      assert.equal(result.retryable, false);
    }
  });

  it("rejects empty vocal ids without calling provider", async () => {
    const result = await sendMurekaVocalDeletionEmail({
      requestId: "req_1",
      vocalIds: ["  "],
      idempotencyKey: "key",
      env: {
        RESEND_API_KEY: "re_test",
        TRANSACTIONAL_EMAIL_FROM: "noreply@example.com",
        MUREKA_DATA_DELETION_EMAIL: "mureka@example.com",
      },
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "missing_provider_external_id");
    }
  });
});
