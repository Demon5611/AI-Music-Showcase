/**
 * Submit ProviderDataDeletionRequest to Mureka via transactional email.
 * Idempotent: atomic pending→submitting claim; Resend Idempotency-Key.
 * Stops at submitted_to_provider (confirmed/completed = later task).
 */
import { prisma } from "@ai-music/db";
import {
  logLoadControl,
  providerDataDeletionSubmitJobId,
  sanitizeProviderDeletionEmailError,
  sendMurekaVocalDeletionEmail,
  type ProviderDataDeletionSubmitJobPayload,
} from "@ai-music/shared";

export type ProcessProviderDataDeletionSubmitContext = {
  attemptsMade: number;
  attemptsTotal: number;
};

type ClaimOutcome = "claimed" | "already_done" | "skip";

async function claimForEmailSubmit(
  requestId: string,
  attemptsMade: number,
): Promise<ClaimOutcome> {
  const now = new Date();
  const claimed = await prisma.providerDataDeletionRequest.updateMany({
    where: { id: requestId, status: "pending" },
    data: {
      status: "submitting",
      lastAttemptAt: now,
      lastError: null,
    },
  });
  if (claimed.count === 1) {
    return "claimed";
  }

  const current = await prisma.providerDataDeletionRequest.findUnique({
    where: { id: requestId },
    select: { status: true },
  });

  if (!current) {
    return "skip";
  }

  if (
    current.status === "submitted_to_provider" ||
    current.status === "confirmed" ||
    current.status === "cancelled" ||
    current.status === "failed"
  ) {
    return "already_done";
  }

  // Concurrent first attempt lost the pending race — do not double-send.
  // BullMQ retry (attemptsMade > 0) after crash mid-send may reclaim submitting.
  if (current.status === "submitting") {
    if (attemptsMade === 0) {
      return "already_done";
    }
    const reclaimed = await prisma.providerDataDeletionRequest.updateMany({
      where: { id: requestId, status: "submitting" },
      data: { lastAttemptAt: now },
    });
    return reclaimed.count === 1 ? "claimed" : "already_done";
  }

  // submit_failed: do not auto-resend unless ops resets to pending.
  return "skip";
}

async function markSubmitted(input: {
  requestId: string;
  providerReference: string | null;
}): Promise<boolean> {
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.providerDataDeletionRequest.updateMany({
      where: { id: input.requestId, status: "submitting" },
      data: {
        status: "submitted_to_provider",
        submittedAt: now,
        lastError: null,
        providerReference: input.providerReference,
        attemptCount: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      return false;
    }

    const request = await tx.providerDataDeletionRequest.findUnique({
      where: { id: input.requestId },
      select: { resourceId: true, provider: true },
    });
    if (request) {
      await tx.voiceProfile.updateMany({
        where: {
          id: request.resourceId,
          provider: request.provider,
          status: { in: ["deletion_requested", "deleted_locally"] },
        },
        data: { status: "provider_deletion_pending" },
      });
    }

    return true;
  });

  return updated;
}

async function releaseClaimToPending(requestId: string, lastError: string): Promise<void> {
  await prisma.providerDataDeletionRequest.updateMany({
    where: { id: requestId, status: "submitting" },
    data: {
      status: "pending",
      lastError,
      attemptCount: { increment: 1 },
    },
  });
}

async function markSubmitFailed(requestId: string, lastError: string): Promise<void> {
  await prisma.providerDataDeletionRequest.updateMany({
    where: {
      id: requestId,
      status: { in: ["pending", "submitting"] },
    },
    data: {
      status: "submit_failed",
      lastError,
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
}

export async function processProviderDataDeletionSubmit(
  payload: ProviderDataDeletionSubmitJobPayload,
  context: ProcessProviderDataDeletionSubmitContext,
): Promise<void> {
  const request = await prisma.providerDataDeletionRequest.findUnique({
    where: { id: payload.requestId },
  });

  if (!request) {
    return;
  }

  if (request.provider !== "mureka") {
    return;
  }

  if (
    request.status === "submitted_to_provider" ||
    request.status === "confirmed" ||
    request.status === "cancelled" ||
    request.status === "failed"
  ) {
    return;
  }

  const claim = await claimForEmailSubmit(request.id, context.attemptsMade);
  if (claim === "already_done" || claim === "skip") {
    return;
  }

  const vocalIds = [request.providerExternalId.trim()].filter(Boolean);
  const idempotencyKey = providerDataDeletionSubmitJobId(request.provider, request.id);
  const sendResult = await sendMurekaVocalDeletionEmail({
    requestId: request.id,
    vocalIds,
    idempotencyKey,
  });

  if (sendResult.status === "sent") {
    const ok = await markSubmitted({
      requestId: request.id,
      providerReference: sendResult.messageId,
    });
    if (!ok) {
      return;
    }
    logLoadControl("provider_data_deletion_submitted", {
      requestId: request.id,
      provider: request.provider,
      vocalIdCount: vocalIds.length,
      providerReference: sendResult.messageId,
    });
    return;
  }

  const sanitized = sanitizeProviderDeletionEmailError(sendResult.reason);
  const isLastAttempt = context.attemptsMade + 1 >= context.attemptsTotal;
  const nonRetryable = sendResult.retryable === false;

  if (isLastAttempt || nonRetryable) {
    await markSubmitFailed(request.id, sanitized);
    logLoadControl(
      "provider_data_deletion_submit_failed",
      {
        requestId: request.id,
        provider: request.provider,
        vocalIdCount: vocalIds.length,
        reason: sanitized,
      },
      "error",
    );
    return;
  }

  await releaseClaimToPending(request.id, sanitized);
  throw new Error(sanitized);
}
