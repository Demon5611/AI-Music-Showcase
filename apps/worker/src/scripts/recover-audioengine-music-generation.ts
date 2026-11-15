/**
 * Diagnose / recover a stuck Audioengine music generation without a blind re-submit.
 *
 * Usage:
 *   DATABASE_URL=<staging> pnpm --filter @ai-music/worker exec tsx \
 *     src/scripts/recover-audioengine-music-generation.ts <recordId>
 *   ... --apply   # perform fail+refund or poll enqueue
 *
 * Never creates a new Vocal ID. Never POSTs generate unless a real providerTaskId
 * is already known (poll-only path).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { prisma, refundOriginalSpend } from "@ai-music/db";
import {
  buildAudioengineMusicRefundKey,
  buildAudioengineMusicSpendKey,
  resolveAudioenginePollDelayMs,
} from "@ai-music/shared";
import { enqueueAudioengineProviderJob } from "../audioengine-provider-job-queue.js";
import { resolveRecoveryPollAttempt } from "../audioengine-provider-job-reconciler.js";
import { planAudioengineMusicGenerationRecovery } from "./audioengine-music-generation-recovery-plan.js";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

const recordId = process.argv[2]?.trim();
const apply = process.argv.includes("--apply");

if (!recordId) {
  console.error("Usage: recover-audioengine-music-generation.ts <recordId> [--apply]");
  process.exit(1);
}

async function main() {
  const record = await prisma.musicGeneration.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      userId: true,
      provider: true,
      status: true,
      submissionState: true,
      providerTaskId: true,
      submitAttemptedAt: true,
      submitCompletedAt: true,
      submitErrorCode: true,
      submitErrorMessage: true,
      errorMessage: true,
      voiceProfileId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!record) {
    console.error(JSON.stringify({ ok: false, error: "record_not_found", recordId }));
    process.exit(1);
  }

  if (record.provider !== "audioengine") {
    console.error(JSON.stringify({ ok: false, error: "not_audioengine", provider: record.provider }));
    process.exit(1);
  }

  const spendKey = buildAudioengineMusicSpendKey(record.id);
  const refundKey = buildAudioengineMusicRefundKey(record.id);
  const spend = await prisma.creditTransaction.findUnique({ where: { idempotencyKey: spendKey } });
  const refund = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: refundKey },
  });

  const plan = planAudioengineMusicGenerationRecovery({
    status: record.status,
    submissionState: record.submissionState,
    providerTaskId: record.providerTaskId,
    hasSpend: Boolean(spend),
    hasRefund: Boolean(refund),
  });

  const diagnosis = {
    recordId: record.id,
    userId: record.userId,
    status: record.status,
    submissionState: record.submissionState,
    providerTaskId: record.providerTaskId,
    voiceProfileId: record.voiceProfileId,
    submitErrorCode: record.submitErrorCode,
    submitErrorMessage: record.submitErrorMessage,
    hasSpend: Boolean(spend),
    spendAmountUnits: spend?.amountUnits ?? null,
    hasRefund: Boolean(refund),
    plan,
    apply,
  };

  console.log(JSON.stringify(diagnosis, null, 2));

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to execute the plan.");
    return;
  }

  if (plan.action === "noop") {
    return;
  }

  if (plan.action === "ambiguous_manual") {
    await prisma.musicGeneration.updateMany({
      where: { id: record.id, provider: "audioengine", status: { in: ["pending", "processing"] } },
      data: {
        submissionState: "submit_unknown",
        submitErrorCode: "AMBIGUOUS_RECOVERY",
        submitErrorMessage: plan.reason.slice(0, 500),
        errorMessage: "Требуется ручное восстановление генерации",
      },
    });
    console.log(JSON.stringify({ applied: "ambiguous_manual", recordId: record.id }));
    return;
  }

  if (plan.action === "enqueue_poll") {
    const submittedAtMs =
      record.submitCompletedAt?.getTime() ??
      record.submitAttemptedAt?.getTime() ??
      record.createdAt.getTime();
    await enqueueAudioengineProviderJob(
      {
        type: "audioengine_music_poll",
        userId: record.userId,
        recordId: record.id,
        providerTaskId: plan.providerTaskId,
        submittedAtMs,
        attempt: resolveRecoveryPollAttempt(submittedAtMs),
      },
      { delayMs: resolveAudioenginePollDelayMs(submittedAtMs) },
    );
    console.log(
      JSON.stringify({
        applied: "enqueue_poll",
        recordId: record.id,
        providerTaskIdPresent: true,
      }),
    );
    return;
  }

  await prisma.musicGeneration.updateMany({
    where: {
      id: record.id,
      provider: "audioengine",
      status: { notIn: ["completed", "partial_success"] },
    },
    data: {
      status: "failed",
      submissionState: "failed",
      submitCompletedAt: new Date(),
      submitErrorCode: "AUDIOENGINE_PRE_SUBMIT_QUEUE_FAILED",
      submitErrorMessage: plan.reason.slice(0, 500),
      errorMessage: "Генерация не была отправлена провайдеру. Кредиты возвращены.",
      rawStatus: "AUDIOENGINE_PRE_SUBMIT_QUEUE_FAILED",
    },
  });

  if (spend && !refund) {
    await refundOriginalSpend({
      userId: record.userId,
      spendIdempotencyKey: spendKey,
      refundIdempotencyKey: refundKey,
      reason: "audioengine_music_generate_refund",
      relatedEntityType: "music_generation",
      relatedEntityId: record.id,
    });
  }

  console.log(
    JSON.stringify({
      applied: "fail_and_refund",
      recordId: record.id,
      refunded: Boolean(spend && !refund),
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
