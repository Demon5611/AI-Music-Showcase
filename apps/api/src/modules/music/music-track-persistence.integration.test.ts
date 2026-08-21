/**
 * PR5 async track persistence + callback latency hotfix integration tests.
 * Requires Postgres + Redis. Run:
 *   pnpm --filter @ai-music/api test:track-persist
 */
import "../../common/load-env.js";
import { randomUUID } from "node:crypto";
import { grantCredits, prisma, type Prisma } from "@ai-music/db";
import {
  getMusicMetrics,
  resetMusicMetricsForTests,
} from "@ai-music/observability";
import {
  createSunoCallbackToken,
  musicTrackPersistJobId,
  OPERATION_COST_UNITS,
  resolveMusicTrackAudioPersistence,
} from "@ai-music/shared";
import { Queue } from "bullmq";
import { resolveProviderReferenceSecret } from "../../config/env.js";
import { handleSignedSunoMusicCallback } from "./suno-callback.service.js";
import {
  getMusicTrackPersistenceQueue,
  enqueueMusicTrackPersistJob,
  closeMusicTrackPersistenceQueue,
} from "../queue/music-track-persistence-queue.js";
import { getMusicGenerationTrackAudio } from "./music-record.service.js";
import { isAppError } from "../../common/errors.js";
import { upsertTracksAndEnqueuePersistence } from "./music-track-metadata.js";

const COST = OPERATION_COST_UNITS.generateTrack;
const createdUserIds: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function createUser(): Promise<string> {
  const id = `test_pr5_${randomUUID()}`;
  await prisma.user.create({ data: { id, email: `${id}@test.local`, name: "PR5" } });
  createdUserIds.push(id);
  await grantCredits({
    userId: id,
    amountUnits: COST * 5,
    reason: "test_grant",
    idempotencyKey: `test:${id}:grant`,
  });
  return id;
}

async function createRecord(userId: string, taskId: string) {
  const record = await prisma.musicGeneration.create({
    data: {
      userId,
      type: "song",
      providerTaskId: taskId,
      prompt: "pr5",
      status: "pending",
      submissionState: "submitted",
      providerRequestJson: { prompt: "pr5" } as Prisma.InputJsonValue,
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

function tokenFor(recordId: string): string {
  return createSunoCallbackToken(resolveProviderReferenceSecret(), recordId, 3600);
}

function completePayload(taskId: string, tracks: Array<Record<string, unknown>>) {
  return {
    code: 200,
    data: {
      callbackType: "complete" as const,
      task_id: taskId,
      data: tracks,
    },
  };
}

async function cleanup(): Promise<void> {
  if (createdUserIds.length === 0) {
    return;
  }
  const tracks = await prisma.musicGenerationTrack.findMany({
    where: { musicGeneration: { userId: { in: createdUserIds } } },
    select: { id: true },
  });
  const queue = getMusicTrackPersistenceQueue();
  for (const track of tracks) {
    const job = await queue.getJob(musicTrackPersistJobId(track.id));
    if (job) {
      await job.remove().catch(() => undefined);
    }
  }
  await prisma.musicGenerationTrack.deleteMany({
    where: { musicGeneration: { userId: { in: createdUserIds } } },
  });
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.musicGeneration.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

async function main(): Promise<void> {
  try {
    console.log("test: signed complete → fast 200, pending persistence, one job");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      const started = Date.now();
      const result = await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId, [
          {
            id: "p5t1",
            title: "t",
            audio_url: "https://example.test/pr5.mp3",
            duration: 12,
          },
        ]),
      });
      const durationMs = Date.now() - started;
      assert(result.statusCode === 200, "callback 200");
      assert(durationMs < 2000, `callback under 2s (was ${durationMs}ms)`);

      const after = await prisma.musicGeneration.findUnique({
        where: { id: record.id },
        include: { tracks: true },
      });
      assert(after?.status === "completed", "generation completed");
      assert(after?.tracks.length === 1, "one track row");
      assert(after?.tracks[0]?.persistenceState === "pending", "persistence pending");
      assert(after?.tracks[0]?.audioStorageKey === null, "no storage key yet");

      const job = await getMusicTrackPersistenceQueue().getJob(
        musicTrackPersistJobId(after!.tracks[0]!.id),
      );
      assert(Boolean(job), "deterministic job enqueued");
    }

    console.log("test: two tracks processed in parallel");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      const queue = getMusicTrackPersistenceQueue();
      const originalAdd = queue.add.bind(queue);
      let inFlight = 0;
      let maxInFlight = 0;

      queue.add = (async (...args: Parameters<typeof queue.add>) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 80));
        try {
          return await originalAdd(...args);
        } finally {
          inFlight -= 1;
        }
      }) as typeof queue.add;

      try {
        const started = Date.now();
        const result = await handleSignedSunoMusicCallback({
          recordId: record.id,
          token: tokenFor(record.id),
          payload: completePayload(taskId, [
            {
              id: "par1",
              title: "a",
              audio_url: "https://example.test/a.mp3",
              duration: 1,
            },
            {
              id: "par2",
              title: "b",
              audio_url: "https://example.test/b.mp3",
              duration: 2,
            },
          ]),
        });
        const durationMs = Date.now() - started;
        assert(result.statusCode === 200, "parallel callback 200");
        assert(maxInFlight >= 2, `two enqueues overlapped (maxInFlight=${maxInFlight})`);
        assert(durationMs < 400, `parallel wall under serial 160ms+ (was ${durationMs}ms)`);

        const tracks = await prisma.musicGenerationTrack.findMany({
          where: { musicGenerationId: record.id },
        });
        assert(tracks.length === 2, "two track rows");
        for (const track of tracks) {
          const job = await queue.getJob(musicTrackPersistJobId(track.id));
          assert(Boolean(job), `job for ${track.providerTrackId}`);
        }
      } finally {
        queue.add = originalAdd;
      }
    }

    console.log("test: duplicate callback skips Redis inspections + no second job");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      const payload = completePayload(taskId, [
        { id: "dup", title: "t", audio_url: "https://example.test/d.mp3", duration: 1 },
      ]);

      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload,
      });

      const tracks = await prisma.musicGenerationTrack.findMany({
        where: { musicGenerationId: record.id },
      });
      assert(tracks.length === 1, "one track after first");
      const jobId = musicTrackPersistJobId(tracks[0]!.id);
      const jobBefore = await getMusicTrackPersistenceQueue().getJob(jobId);
      assert(Boolean(jobBefore), "job present after first");

      const queueProto = Queue.prototype as Queue & {
        getJob: typeof Queue.prototype.getJob;
        getJobCounts?: unknown;
      };
      const originalGetJob = queueProto.getJob;
      let getJobCalls = 0;
      queueProto.getJob = async function (...args: Parameters<typeof originalGetJob>) {
        getJobCalls += 1;
        return originalGetJob.apply(this, args);
      };

      const originalAdd = getMusicTrackPersistenceQueue().add.bind(getMusicTrackPersistenceQueue());
      let addCalls = 0;
      getMusicTrackPersistenceQueue().add = (async (...args: Parameters<typeof originalAdd>) => {
        addCalls += 1;
        return originalAdd(...args);
      }) as typeof originalAdd;

      try {
        resetMusicMetricsForTests();
        const metrics = getMusicMetrics();
        const completedBefore = await metrics.musicGenerationCompletedTotal.get();

        const second = await handleSignedSunoMusicCallback({
          recordId: record.id,
          token: tokenFor(record.id),
          payload,
        });
        assert(second.statusCode === 200, "duplicate 200");
        assert(Boolean(second.body.duplicate), "duplicate flag");
        assert(getJobCalls === 0, `duplicate path did not call getJob (calls=${getJobCalls})`);
        assert(addCalls === 0, `duplicate path did not call queue.add (calls=${addCalls})`);

        const completedAfter = await metrics.musicGenerationCompletedTotal.get();
        assert(
          completedAfter.values[0]?.value === completedBefore.values[0]?.value,
          "completed counter not incremented on duplicate",
        );

        const jobAfter = await originalGetJob.call(getMusicTrackPersistenceQueue(), jobId);
        assert(Boolean(jobAfter), "same job still present");
        assert(jobAfter!.id === jobBefore!.id, "job id unchanged");
      } finally {
        queueProto.getJob = originalGetJob;
        getMusicTrackPersistenceQueue().add = originalAdd;
      }

      const jobBeforeRepeat = await getMusicTrackPersistenceQueue().getJob(jobId);
      const tsBefore = jobBeforeRepeat?.timestamp;
      await enqueueMusicTrackPersistJob({
        trackId: tracks[0]!.id,
        musicGenerationId: record.id,
        userId,
      });
      const jobAfterRepeat = await getMusicTrackPersistenceQueue().getJob(jobId);
      assert(Boolean(jobAfterRepeat), "job still present after repeat add");
      assert(jobAfterRepeat!.timestamp === tsBefore, "repeat add did not create a second job");
    }

    console.log("test: changed provider URL on duplicate is saved");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId, [
          { id: "url1", title: "t", audio_url: "https://example.test/old.mp3" },
        ]),
      });
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId, [
          { id: "url1", title: "t", audio_url: "https://example.test/new.mp3" },
        ]),
      });
      const track = await prisma.musicGenerationTrack.findFirst({
        where: { musicGenerationId: record.id },
      });
      assert(track?.audioSourceUrl === "https://example.test/new.mp3", "URL updated on duplicate");
      assert(track?.persistenceState === "pending", "still pending after URL change");
    }

    console.log("test: enqueue failure leaves DB recoverable by reconciler path");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      await prisma.musicGeneration.update({
        where: { id: record.id },
        data: { status: "completed" },
      });

      const queue = getMusicTrackPersistenceQueue();
      const originalAdd = queue.add.bind(queue);
      queue.add = (async () => {
        throw new Error("redis_unavailable_test");
      }) as typeof queue.add;

      try {
        await upsertTracksAndEnqueuePersistence(
          { id: record.id, userId },
          [
            {
              id: "fail_enq",
              title: "t",
              audioUrl: "https://example.test/recover.mp3",
              durationSec: 3,
            },
          ],
          { transition: "applied" },
        );
      } finally {
        queue.add = originalAdd;
      }

      const track = await prisma.musicGenerationTrack.findFirst({
        where: { musicGenerationId: record.id, providerTrackId: "fail_enq" },
      });
      assert(track?.persistenceState === "pending", "DB left pending after enqueue failure");
      assert(track?.audioSourceUrl === "https://example.test/recover.mp3", "source URL kept");
      assert(track?.audioStorageKey === null, "no storage key");

      const recovered = await enqueueMusicTrackPersistJob({
        trackId: track!.id,
        musicGenerationId: record.id,
        userId,
      });
      assert(recovered === "enqueued", "reconciler-style enqueue succeeds later");
      const job = await queue.getJob(musicTrackPersistJobId(track!.id));
      assert(Boolean(job), "job present after recovery enqueue");
    }

    console.log("test: audio endpoint not ready");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      await handleSignedSunoMusicCallback({
        recordId: record.id,
        token: tokenFor(record.id),
        payload: completePayload(taskId, [
          { id: "nr", title: "t", audio_url: "https://example.test/n.mp3" },
        ]),
      });
      const track = await prisma.musicGenerationTrack.findFirst({
        where: { musicGenerationId: record.id },
      });
      try {
        await getMusicGenerationTrackAudio(userId, track!.id);
        throw new Error("expected AudioNotReadyError");
      } catch (error) {
        assert(isAppError(error) && error.code === "AUDIO_NOT_READY", "AUDIO_NOT_READY");
      }
    }

    console.log("test: persistence failure → no refund");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      await prisma.musicGeneration.update({
        where: { id: record.id },
        data: { status: "completed" },
      });
      const track = await prisma.musicGenerationTrack.create({
        data: {
          musicGenerationId: record.id,
          providerTrackId: "fail1",
          title: "t",
          audioSourceUrl: "https://example.test/x.mp3",
          persistenceState: "failed",
          persistenceErrorCode: "OVERSIZE",
        },
      });
      const refund = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey: `generation:${record.id}:refund` },
      });
      assert(refund === null, "no refund on persistence failure");
      assert(track.persistenceState === "failed", "track failed");
      const phase = resolveMusicTrackAudioPersistence("completed", [
        { persistenceState: "failed" },
      ]);
      assert(phase === "failed", "audioPersistence failed");
    }

    console.log("test: saving vs ready derived phase");
    {
      assert(
        resolveMusicTrackAudioPersistence("completed", [{ persistenceState: "pending" }]) ===
          "saving",
        "saving",
      );
      assert(
        resolveMusicTrackAudioPersistence("completed", [{ persistenceState: "stored" }]) ===
          "ready",
        "ready",
      );
      assert(resolveMusicTrackAudioPersistence("processing", []) === "none", "none");
      assert(
        resolveMusicTrackAudioPersistence("completed", []) === "saving",
        "completed without tracks is still saving",
      );
    }

    console.log("test: already stored → enqueue already_queued or enqueued ok");
    {
      const userId = await createUser();
      const taskId = `task_${randomUUID()}`;
      const record = await createRecord(userId, taskId);
      await prisma.musicGeneration.update({
        where: { id: record.id },
        data: { status: "completed" },
      });
      const track = await prisma.musicGenerationTrack.create({
        data: {
          musicGenerationId: record.id,
          providerTrackId: "stored1",
          title: "t",
          audioSourceUrl: "https://example.test/s.mp3",
          audioStorageKey: `music-generations/${userId}/${record.id}/x.mp3`,
          persistenceState: "stored",
        },
      });
      const outcome = await enqueueMusicTrackPersistJob({
        trackId: track.id,
        musicGenerationId: record.id,
        userId,
      });
      assert(outcome === "enqueued", "enqueue allowed");
    }

    console.log("\nPR5 track persistence integration tests passed");
  } finally {
    await cleanup();
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
