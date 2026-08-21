/**
 * Worker-side persistence tests (SSRF reject, already-stored noop, deleted track).
 * Requires Postgres. Run: pnpm --filter @ai-music/worker test:track-persist
 */
import "./common/load-env.js";
import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@ai-music/db";
import { processPersistMusicTrack } from "./processors/persist-music-track.js";

const createdUserIds: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function createFixture(sourceUrl: string | null, overrides: {
  audioStorageKey?: string | null;
  persistenceState?: "pending" | "processing" | "stored" | "failed";
} = {}) {
  const userId = `test_pr5w_${randomUUID()}`;
  await prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, name: "PR5W" } });
  createdUserIds.push(userId);

  const record = await prisma.musicGeneration.create({
    data: {
      userId,
      type: "song",
      providerTaskId: `task_${randomUUID()}`,
      prompt: "pr5w",
      status: "completed",
      submissionState: "submitted",
      providerRequestJson: { prompt: "x" } as Prisma.InputJsonValue,
    },
  });

  const track = await prisma.musicGenerationTrack.create({
    data: {
      musicGenerationId: record.id,
      providerTrackId: `pt_${randomUUID()}`,
      title: "t",
      audioSourceUrl: sourceUrl,
      audioStorageKey: overrides.audioStorageKey ?? null,
      persistenceState: overrides.persistenceState ?? "pending",
    },
  });

  return { userId, record, track };
}

async function cleanup(): Promise<void> {
  if (createdUserIds.length === 0) {
    return;
  }
  await prisma.musicGenerationTrack.deleteMany({
    where: { musicGeneration: { userId: { in: createdUserIds } } },
  });
  await prisma.musicGeneration.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

async function main(): Promise<void> {
  try {
    console.log("test: SSRF localhost → failed, generation stays completed");
    {
      const { record, track, userId } = await createFixture("http://127.0.0.1/secret.mp3");
      await processPersistMusicTrack({
        trackId: track.id,
        musicGenerationId: record.id,
        userId,
      });
      const after = await prisma.musicGenerationTrack.findUnique({ where: { id: track.id } });
      const gen = await prisma.musicGeneration.findUnique({ where: { id: record.id } });
      assert(after?.persistenceState === "failed", "persistence failed");
      assert(after?.persistenceErrorCode === "SSRF_IP" || after?.persistenceErrorCode === "SSRF_HOST", "ssrf code");
      assert(gen?.status === "completed", "generation not failed");
      const refund = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey: `generation:${record.id}:refund` },
      });
      assert(refund === null, "no refund");
    }

    console.log("test: already stored → noop");
    {
      const { record, track, userId } = await createFixture("https://example.test/a.mp3", {
        audioStorageKey: "music-generations/u/g/t.mp3",
        persistenceState: "stored",
      });
      await processPersistMusicTrack({
        trackId: track.id,
        musicGenerationId: record.id,
        userId,
      });
      const after = await prisma.musicGenerationTrack.findUnique({ where: { id: track.id } });
      assert(after?.persistenceState === "stored", "still stored");
      assert(after?.persistenceAttempts === 0, "no attempt bump");
    }

    console.log("test: deleted track → safe noop");
    {
      await processPersistMusicTrack({
        trackId: "cm_missing_track_id_pr5",
        musicGenerationId: "x",
        userId: "y",
      });
      assert(true, "deleted track no throw");
    }

    console.log("test: concurrent claim — one winner");
    {
      const { record, track, userId } = await createFixture("http://127.0.0.1/race.mp3");
      await Promise.all([
        processPersistMusicTrack({
          trackId: track.id,
          musicGenerationId: record.id,
          userId,
        }),
        processPersistMusicTrack({
          trackId: track.id,
          musicGenerationId: record.id,
          userId,
        }),
      ]);
      const after = await prisma.musicGenerationTrack.findUnique({ where: { id: track.id } });
      assert(after?.persistenceState === "failed", "ended failed from SSRF");
      assert((after?.persistenceAttempts ?? 0) >= 1, "at least one attempt");
    }

    console.log("\nPR5 worker persist tests passed");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
