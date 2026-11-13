import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendAudioengineVocalDeletionEmail } from "./send-audioengine-vocal-deletion-email.js";

describe("sendAudioengineVocalDeletionEmail", () => {
  it("fails closed when email env is missing", async () => {
    const result = await sendAudioengineVocalDeletionEmail({
      requestId: "req_1",
      vocalIds: ["vocal-1"],
      idempotencyKey: "provider-data-deletion-submit-audioengine-req_1",
      env: {},
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "email_provider_not_configured");
      assert.equal(result.retryable, false);
    }
  });

  it("rejects empty vocal ids without calling provider", async () => {
    const result = await sendAudioengineVocalDeletionEmail({
      requestId: "req_1",
      vocalIds: ["  "],
      idempotencyKey: "key",
      env: {
        RESEND_API_KEY: "re_test",
        TRANSACTIONAL_EMAIL_FROM: "noreply@example.com",
        AUDIOENGINE_DATA_DELETION_EMAIL: "audioengine@example.com",
      },
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "missing_provider_external_id");
    }
  });
});
