import { prisma } from "@ai-music/db";
import type { MusicRecordStatus } from "./music-generation-transition.js";

/**
 * Refund for verified terminal failure even when status transition is a
 * duplicate (recovers partial: failed set, refund never written).
 */
export async function shouldRefundGeneration(input: {
  recordId: string;
  userId: string;
  type: string;
  status: string;
  submissionState: string;
  nextStatus: MusicRecordStatus;
}): Promise<boolean> {
  if (input.nextStatus !== "failed") {
    return false;
  }

  if (input.type !== "song") {
    return false;
  }

  if (input.status === "completed") {
    return false;
  }

  if (input.submissionState === "submit_unknown") {
    // Exception: controlled early bind promotes submit_unknown → submitted
    // before applying failed. Caller should pass updated submissionState.
    // If still submit_unknown without a verified provider failure bind, no refund.
    return false;
  }

  const spend = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: `generation:${input.recordId}:spend` },
    select: { id: true },
  });

  return Boolean(spend);
}
