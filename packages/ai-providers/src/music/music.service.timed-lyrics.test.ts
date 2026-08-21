/**
 * MusicService.getTimestampedLyrics must use Suno regardless of default provider.
 * Run: pnpm --filter @ai-music/ai-providers exec tsx src/music/music.service.timed-lyrics.test.ts
 */
import assert from "node:assert/strict";
import { MusicService } from "./music.service.js";
import { MusicProviderFactory } from "./music-provider.factory.js";
import type { MusicProvider } from "./domain/music-provider.interface.js";
import type {
  TimestampedLyricsInput,
  TimestampedLyricsResult,
} from "./domain/music.types.js";

function stubProvider(
  id: MusicProvider["id"],
  getTimestampedLyrics?: (input: TimestampedLyricsInput) => Promise<TimestampedLyricsResult>,
): MusicProvider {
  return {
    id,
    generateSong: async () => {
      throw new Error("unused");
    },
    extendSong: async () => {
      throw new Error("unused");
    },
    getGenerationStatus: async () => {
      throw new Error("unused");
    },
    ...(getTimestampedLyrics ? { getTimestampedLyrics } : {}),
  };
}

async function testForcesSunoWhenDefaultIsMureka(): Promise<void> {
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "mureka";

  let calledWith: TimestampedLyricsInput | null = null;
  let murekaCalled = false;

  try {
    const factory = new MusicProviderFactory({
      mureka: stubProvider("mureka", async () => {
        murekaCalled = true;
        throw new Error("mureka must not handle timed lyrics");
      }),
      sunoapi: stubProvider("sunoapi", async (input) => {
        calledWith = input;
        return {
          lines: [{ startSec: 0, endSec: 1, text: "hi" }],
          words: [{ startSec: 0, endSec: 1, text: "hi" }],
        };
      }),
    });

    assert.equal(factory.getProvider().id, "mureka");

    const service = new MusicService(factory);
    const result = await service.getTimestampedLyrics({
      taskId: "suno-task",
      audioId: "suno-audio",
    });

    assert.equal(murekaCalled, false);
    assert.deepEqual(calledWith, { taskId: "suno-task", audioId: "suno-audio" });
    assert.equal(result.lines.length, 1);
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

async function testRejectsMissingIds(): Promise<void> {
  const factory = new MusicProviderFactory({
    sunoapi: stubProvider("sunoapi", async () => {
      throw new Error("should not call provider");
    }),
  });
  const service = new MusicService(factory);

  try {
    await service.getTimestampedLyrics({ taskId: " ", audioId: "audio" });
    assert.fail("expected missing ids error");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /taskId and audioId/);
  }
}

await testForcesSunoWhenDefaultIsMureka();
await testRejectsMissingIds();
console.log("music.service.timed-lyrics.test.ts: ok");
