/**
 * PR4 callback / status-transition integration tests.
 * Requires local Postgres. Run:
 *   pnpm --filter @ai-music/api test:callback
 */
import "../../common/load-env.js";
import { randomUUID } from "node:crypto";
import { grantCredits, prisma, type Prisma } from "@ai-music/db";
import {
  createSunoCallbackToken,
  OPERATION_COST_UNITS,
  verifySunoCallbackToken,
} from "@ai-music/shared";
import { resolveProviderReferenceSecret } from "../../config/env.js";
import {
  handleLegacySunoMusicCallback,
  handleSignedSunoMusicCallback,
} from "./suno-callback.service.js";
import { applyMusicGenerationTransition } from "./music-generation-transition.js";

const COST = OPERATION_COST_UNITS.generateTrack;
const createdUserIds: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function createUser(): Promise<string> {
  const id = `test_pr4_${randomUUID()}`;
  await prisma.user.create({ data: { id, email: `${id}@test.local`, name: "PR4" } });
  createdUserIds.push(id);
  await grantCredits({
    userId: id,
    amountUnits: COST * 10,
    reason: "test_grant",
    idempotencyKey: `test:${id}:grant`,
  });
  return id;
}

async function createRecord(
  userId: string,
  overrides: {
    providerTaskId?: string;
    submissionState?: "queued" | "dispatching" | "submitted" | "submit_unknown" | "failed";
    status?: string;
    createdAt?: Date;
  } = {},
) {
  const record = await prisma.musicGeneration.create({
    data: {
      userId,
      type: "song",
      providerTaskId: overrides.providerTaskId ?? `suno_${randomUUID()}`,
      prompt: "pr4",
      status: overrides.status ?? "pending",
      submissionState: overrides.submissionState ?? "submitted",
      providerRequestJson: { prompt: "pr4" } as Prisma.InputJsonValue,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: "spend",
      amountUnits: -COST,
      reason: "music_generate",
      idempotencyKey: `generation:${record.id}:spend`,
      relatedEntityType: "music_generation",
      relatedEntityId: record.id,
    },
  });

  return record;
}

function tokenFor(recordId: string, ttl = 3600): string {
  return createSunoCallbackToken(resolveProviderReferenceSecret(), recordId, ttl);
}

function completePayload(taskId: string, tracks: Array<{ id: string; audio_url?: string }> = []) {
  return {
    code: 200,
    msg: "ok",
    data: {
      callbackType: "complete" as const,
      task_id: taskId,
      data: tracks.map((track) => ({
        id: track.id,
        title: "t",
        audio_url: track.audio_url ?? "https://example.test/a.mp3",
        duration: 10,
      })),
    },
  };
}

async function cleanup(): Promise<void> {
  if (createdUserIds.length === 0) {
    return;
  }
  await prisma.musicGenerationTrack.deleteMany({
    where: { musicGeneration: { userId: { in: createdUserIds } } },
  });
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.musicGeneration.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

async function main(): Promise<void> {
  try {
    console.log("test: HMAC expired rejects");
    {
      const secret = resolveProviderReferenceSecret();
      const token = createSunoCallbackToken(secret, "rec", -1);
      assert(!verifySunoCallbackToken(secret, "rec", token), "expired HMAC invalid");
    }

    console.log("test: valid token + matching task → completed");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId });
      const result = await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId, [{ id: "tr1", audio_url: "" }]),
      });
      assert(result.statusCode === 200, "200 accepted");
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.status === "completed", "status completed");
    }

    console.log("test: invalid token → 401, no DB change");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId });
      const result = await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: "v1.1.deadbeef",
        payload: completePayload(taskId),
      });
      assert(result.statusCode === 401, "401 unauthorized");
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.status === "pending", "status unchanged");
    }

    console.log("test: wrong taskId → ignored");
    {
      const userId = await createUser();
      const record = await createRecord(userId, { providerTaskId: "task_real" });
      const result = await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload("task_other"),
      });
      assert(result.statusCode === 200 && result.body.ignored === "task_mismatch", "task mismatch");
    }

    console.log("test: completed → stale processing stays completed");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId, status: "completed" });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: {
          code: 200,
          data: { callbackType: "first", task_id: taskId, data: [] },
        },
      });
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.status === "completed", "still completed");
    }

    console.log("test: completed → failed → stays completed, no refund");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId, status: "completed" });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: {
          code: 400,
          msg: "fail",
          data: { callbackType: "error", task_id: taskId, data: null },
        },
      });
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.status === "completed", "completed immune to failed");
      const refund = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey: `generation:${record.id}:refund` },
      });
      assert(refund === null, "no refund after completed");
    }

    console.log("test: failed → completed stays failed");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId, status: "failed" });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId),
      });
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.status === "failed", "failed stays failed");
    }

    console.log("test: callback + poll race — no failed regression");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId });
      await Promise.all([
        handleSignedSunoMusicCallback({
          recordId: record.id,
          token: tokenFor(record.id),
          payload: completePayload(taskId, [{ id: "a", audio_url: "" }]),
        }),
        applyMusicGenerationTransition({ id: record.id, toStatus: "processing" }),
        handleSignedSunoMusicCallback({
          recordId: record.id,
          token: tokenFor(record.id),
          payload: {
            code: 200,
            data: {
              callbackType: "first",
              task_id: taskId,
              data: [{ id: "a", audio_url: "" }],
            },
          },
        }),
      ]);
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.status === "completed" || after?.status === "processing", "race non-failed");
      assert(after?.status !== "failed", "race did not fail");
    }

    console.log("test: duplicate completed — one track row");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId });
      const payload = completePayload(taskId, [
        { id: "dup1", audio_url: "https://example.test/dup.mp3" },
      ]);
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload,
      });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload,
      });
      const tracks = await prisma.musicGenerationTrack.findMany({
        where: { musicGenerationId: record.id },
      });
      assert(tracks.length === 1, "exactly one track row");
    }

    console.log("test: duplicate failed → one refund");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId });
      const failPayload = {
        code: 400,
        msg: "bad",
        data: { callbackType: "error" as const, task_id: taskId, data: null },
      };
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: failPayload,
      });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: failPayload,
      });
      const refunds = await prisma.creditTransaction.count({
        where: { idempotencyKey: `generation:${record.id}:refund` },
      });
      assert(refunds === 1, "exactly one refund");
    }

    console.log("test: submit_unknown recovery bind");
    {
      const userId = await createUser();
      const record = await createRecord(userId, {
        providerTaskId: `queue:${randomUUID()}`,
        submissionState: "submit_unknown",
      });
      const taskId = `bound_${randomUUID()}`;
      const result = await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId, [{ id: "b1", audio_url: "" }]),
      });
      assert(result.statusCode === 200, "bind accepted");
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.providerTaskId === taskId, "taskId bound");
      assert(after?.submissionState === "submitted", "submissionState submitted");
      assert(after?.status === "completed", "completed after bind");
      assert(after?.submitCompletedAt != null, "submitCompletedAt set");
    }

    console.log("test: queued callback ignored");
    {
      const userId = await createUser();
      const record = await createRecord(userId, {
        providerTaskId: `queue:${randomUUID()}`,
        submissionState: "queued",
      });
      const result = await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload("t"),
      });
      assert(result.body.ignored === "queued_ignored", "queued ignored");
    }

    console.log("test: code 500 no refund / no failed");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: {
          code: 500,
          msg: "server",
          data: { callbackType: "error", task_id: taskId, data: null },
        },
      });
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.status === "pending", "500 does not fail");
      const refund = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey: `generation:${record.id}:refund` },
      });
      assert(refund === null, "500 no refund");
    }

    console.log("test: refund retry after partial DB failure");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId, status: "failed" });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: {
          code: 400,
          data: { callbackType: "error", task_id: taskId, data: null },
        },
      });
      const refund = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey: `generation:${record.id}:refund` },
      });
      assert(Boolean(refund), "refund recovered on duplicate failed callback");
    }

    console.log("test: concurrent early bind");
    {
      const userId = await createUser();
      const record = await createRecord(userId, {
        providerTaskId: `queue:${randomUUID()}`,
        submissionState: "dispatching",
      });
      const results = await Promise.all([
        handleSignedSunoMusicCallback({
          recordId: record.id,
          token: tokenFor(record.id),
          payload: completePayload(`t_a_${record.id}`, [{ id: "c1", audio_url: "" }]),
        }),
        handleSignedSunoMusicCallback({
          recordId: record.id,
          token: tokenFor(record.id),
          payload: completePayload(`t_b_${record.id}`, [{ id: "c2", audio_url: "" }]),
        }),
      ]);
      assert(results.every((r) => r.statusCode === 200), "both 200");
      const after = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.submissionState === "submitted", "one bind won");
      assert(Boolean(after && !after.providerTaskId.startsWith("queue:")), "real taskId set");
      const ignored = results.filter((r) => r.body.ignored === "bind_conflict").length;
      assert(ignored === 0 || ignored === 1, "at most one bind_conflict");
    }

    console.log("test: legacy cutoff + disabled");
    {
      const userId = await createUser();
      const oldTask = `legacy_old_${randomUUID()}`;
      const newTask = `legacy_new_${randomUUID()}`;
      await createRecord(userId, {
        providerTaskId: oldTask,
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      });
      await createRecord(userId, {
        providerTaskId: newTask,
        createdAt: new Date("2099-01-01T00:00:00.000Z"),
      });

      const prevCutoff = process.env.SUNO_CALLBACK_LEGACY_CUTOFF_AT;
      const prevDisabled = process.env.SUNO_CALLBACK_LEGACY_DISABLED;
      const prevEnabled = process.env.SUNO_CALLBACK_LEGACY_ENABLED;
      process.env.SUNO_CALLBACK_LEGACY_CUTOFF_AT = "2025-01-01T00:00:00.000Z";
      process.env.SUNO_CALLBACK_LEGACY_ENABLED = "true";
      delete process.env.SUNO_CALLBACK_LEGACY_DISABLED;

      const oldOk = await handleLegacySunoMusicCallback(
        completePayload(oldTask, [{ id: "lo", audio_url: "" }]),
      );
      assert(oldOk.statusCode === 200, "legacy accepts pre-cutoff");

      const newGone = await handleLegacySunoMusicCallback(completePayload(newTask));
      assert(newGone.statusCode === 410, "legacy rejects post-cutoff");

      delete process.env.SUNO_CALLBACK_LEGACY_ENABLED;
      const disabled = await handleLegacySunoMusicCallback(completePayload(oldTask));
      assert(disabled.statusCode === 410, "legacy fail-closed → 410");

      if (prevCutoff === undefined) {
        delete process.env.SUNO_CALLBACK_LEGACY_CUTOFF_AT;
      } else {
        process.env.SUNO_CALLBACK_LEGACY_CUTOFF_AT = prevCutoff;
      }
      if (prevDisabled === undefined) {
        delete process.env.SUNO_CALLBACK_LEGACY_DISABLED;
      } else {
        process.env.SUNO_CALLBACK_LEGACY_DISABLED = prevDisabled;
      }
      if (prevEnabled === undefined) {
        delete process.env.SUNO_CALLBACK_LEGACY_ENABLED;
      } else {
        process.env.SUNO_CALLBACK_LEGACY_ENABLED = prevEnabled;
      }
    }

    console.log("test: duplicate callback after missing R2 key — no duplicate rows");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, { providerTaskId: taskId, status: "completed" });
      await prisma.musicGenerationTrack.create({
        data: {
          musicGenerationId: record.id,
          providerTrackId: "trk_r2",
          title: "x",
          audioSourceUrl: "https://example.test/a.mp3",
          audioStorageKey: null,
        },
      });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId, [
          { id: "trk_r2", audio_url: "https://example.test/a.mp3" },
        ]),
      });
      const count = await prisma.musicGenerationTrack.count({
        where: { musicGenerationId: record.id, providerTrackId: "trk_r2" },
      });
      assert(count === 1, "no duplicate track rows");
    }

    console.log("test: unknown record → 200 warning");
    {
      const result = await handleSignedSunoMusicCallback({
        recordId: "cm_missing_record_id0001",
        token: tokenFor("cm_missing_record_id0001"),
        payload: completePayload("t"),
      });
      assert(result.statusCode === 200 && result.body.ignored === "unknown_record", "unknown safe");
    }

    console.log("\nPR4 callback integration tests passed");
  } finally {
    await cleanup();
    const { closeMusicTrackPersistenceQueue } = await import(
      "../queue/music-track-persistence-queue.js"
    );
    await closeMusicTrackPersistenceQueue();
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
