import { createBullMqJobId } from "./bullmq-job-id.js";

export const PROVIDER_DATA_DELETION_QUEUE_NAME = "provider-data-deletion";

export const PROVIDER_DATA_DELETION_SUBMIT_JOB_NAME = "provider-data-deletion-submit";

export const PROVIDER_DATA_DELETION_SUBMIT_ATTEMPTS_DEFAULT = 5;
export const PROVIDER_DATA_DELETION_SUBMIT_BACKOFF_MS_DEFAULT = 5_000;

/** BullMQ custom jobId — no colon separators. */
export function providerDataDeletionSubmitJobId(
  provider: string,
  requestId: string,
): string {
  return createBullMqJobId("provider-data-deletion-submit", provider, requestId);
}

export type ProviderDataDeletionSubmitJobPayload = {
  requestId: string;
  provider: string;
};
