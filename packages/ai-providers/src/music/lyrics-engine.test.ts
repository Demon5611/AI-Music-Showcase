import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLyricsEngine } from "./lyrics-engine.js";
import type { MusicProvider } from "./domain/music-provider.interface.js";

describe("createLyricsEngine", () => {
  it("uses injected Suno lyrics methods and ignores active song provider", async () => {
    let generateCalls = 0;
    let statusCalls = 0;

    const stubSuno = {
      id: "sunoapi",
      generateSong: async () => {
        throw new Error("song path must not be used for lyrics");
      },
      getGenerationStatus: async () => {
        throw new Error("song status must not be used for lyrics");
      },
      generateLyrics: async () => {
        generateCalls += 1;
        return { provider: "sunoapi", taskId: "lyrics-task", status: "pending" as const };
      },
      getLyricsGenerationStatus: async () => {
        statusCalls += 1;
        return { status: "completed" as const, lyrics: [] };
      },
    } as unknown as MusicProvider;

    const engine = createLyricsEngine(stubSuno);
    const created = await engine.generateLyrics({ prompt: "brief" });
    const status = await engine.getLyricsGenerationStatus("lyrics-task");

    assert.equal(created.taskId, "lyrics-task");
    assert.equal(status.status, "completed");
    assert.equal(generateCalls, 1);
    assert.equal(statusCalls, 1);
  });
});
