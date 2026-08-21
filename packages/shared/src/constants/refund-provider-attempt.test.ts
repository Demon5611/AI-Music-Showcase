import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasRefundProviderAttemptMarker } from "./refund.js";

describe("hasRefundProviderAttemptMarker", () => {
  it("returns false when both fields are empty", () => {
    assert.equal(hasRefundProviderAttemptMarker(null, null), false);
    assert.equal(hasRefundProviderAttemptMarker(undefined, undefined), false);
    assert.equal(hasRefundProviderAttemptMarker("", ""), false);
  });

  it("returns true when providerReference is set", () => {
    assert.equal(hasRefundProviderAttemptMarker("rr-1", null), true);
  });

  it("returns true for awaiting_provider_status prefix", () => {
    assert.equal(
      hasRefundProviderAttemptMarker(null, "awaiting_provider_status:processing"),
      true,
    );
  });

  it("returns true for ambiguous attempt prefixes", () => {
    assert.equal(hasRefundProviderAttemptMarker(null, "ambiguous_reverse_attempted:timeout"), true);
    assert.equal(hasRefundProviderAttemptMarker(null, "ambiguous_cancel_attempted:network"), true);
  });

  it("returns false for unrelated providerError text", () => {
    assert.equal(hasRefundProviderAttemptMarker(null, "reconcile_get_failed:404"), false);
  });
});
