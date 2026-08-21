import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMurekaVocalDeletionEmailBody,
  buildMurekaVocalDeletionEmailSubject,
  sanitizeProviderDeletionEmailError,
} from "./mureka-vocal-deletion-message.js";

describe("mureka vocal deletion email", () => {
  it("builds subject with requestId", () => {
    assert.equal(
      buildMurekaVocalDeletionEmailSubject("req_123"),
      "Mureka Vocal Data Deletion Request - req_123",
    );
  });

  it("lists vocal ids only — no user PII fields in body", () => {
    const body = buildMurekaVocalDeletionEmailBody({
      requestId: "req_abc",
      vocalIds: ["vocal-1", "vocal-2"],
    });
    assert.match(body, /- vocal-1/);
    assert.match(body, /- vocal-2/);
    assert.match(body, /Request ID: req_abc/);
    assert.doesNotMatch(body, /@/);
    assert.doesNotMatch(body, /clerk/i);
    assert.doesNotMatch(body, /userId/i);
    assert.doesNotMatch(body, /r2/i);
    assert.doesNotMatch(body, /sample/i);
  });

  it("sanitizes errors", () => {
    assert.equal(sanitizeProviderDeletionEmailError(new Error("  boom  ")), "boom");
    assert.equal(sanitizeProviderDeletionEmailError(null), "email_send_failed");
  });
});
