import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROVIDER_DATA_DELETION_SUBMIT_JOB_NAME,
  providerDataDeletionSubmitJobId,
} from "./provider-data-deletion-queue.js";

describe("provider-data-deletion-queue", () => {
  it("builds deterministic job id without colons", () => {
    const jobId = providerDataDeletionSubmitJobId("mureka", "req_abc");
    assert.equal(jobId, "provider-data-deletion-submit-mureka-req_abc");
    assert.equal(jobId.includes(":"), false);
    assert.equal(PROVIDER_DATA_DELETION_SUBMIT_JOB_NAME, "provider-data-deletion-submit");
  });
});
