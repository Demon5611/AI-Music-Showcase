import { createHash } from "node:crypto";
import { config } from "dotenv";
import { resolve } from "node:path";
import { prisma } from "@ai-music/db";
import { createMusicService, createSunoApiClient } from "@ai-music/ai-providers";
import { getStorageService } from "../src/modules/storage/storage.service.js";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const songId = process.argv[2] ?? "cmqjnjolf000zks8z4clvy45t";

async function main() {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { stems: true },
  });

  if (!song) {
    console.log("Song not found");
    return;
  }

  console.log(
    JSON.stringify(
      {
        id: song.id,
        status: song.status,
        stemSeparationTaskId: song.stemSeparationTaskId,
        stemSeparationNotice: song.stemSeparationNotice,
        providerTaskId: song.providerTaskId,
        providerTrackId: song.providerTrackId,
        stems: song.stems.map((stem) => ({ type: stem.type, key: stem.audioStorageKey })),
        audioStorageKey: song.audioStorageKey,
      },
      null,
      2,
    ),
  );

  if (song.stemSeparationTaskId) {
    const client = createSunoApiClient();
    const raw = await client.getVocalRemovalDetails(song.stemSeparationTaskId);
    console.log("SUNO_RAW", JSON.stringify(raw, null, 2));

    const music = createMusicService();
    const mapped = await music.getStemSeparationStatus(
      song.stemSeparationTaskId,
      song.provider === "mureka" ? "mureka" : "sunoapi",
    );
    console.log("MAPPED", JSON.stringify(mapped, null, 2));
  }

  const storage = getStorageService();

  if (song.audioStorageKey) {
    const original = await storage.get(song.audioStorageKey);
    console.log("ORIGINAL_SIZE", original.length);
  }

  for (const stem of song.stems) {
    const buffer = await storage.get(stem.audioStorageKey);
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    console.log("STEM", stem.type, "bytes", buffer.length, "sha256", hash);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
