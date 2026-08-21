import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyMurekaHttpStatus,
  isMurekaInvalidUrlFetchError,
  MurekaHttpError,
  assertNoSecretInText,
  mapMurekaHttpErrorToMusicError,
} from "./mureka-errors.js";
import {
  mapMurekaChoiceToGeneratedTrack,
  mapMurekaQueryToGenerationStatus,
  mapMurekaStatusToMusicStatus,
} from "./mureka-status-mapper.js";
import { resolveMurekaTaskId, resolveMurekaVocalId } from "./mureka-types.js";

describe("classifyMurekaHttpStatus", () => {
  it("maps known statuses", () => {
    assert.equal(classifyMurekaHttpStatus(400).kind, "validation");
    assert.equal(classifyMurekaHttpStatus(401).kind, "authentication");
    assert.equal(classifyMurekaHttpStatus(402).kind, "insufficient_balance");
    assert.equal(classifyMurekaHttpStatus(403).kind, "permission");
    assert.equal(classifyMurekaHttpStatus(429).retryable, true);
    assert.equal(classifyMurekaHttpStatus(503).retryable, true);
  });
});

describe("mapMurekaStatusToMusicStatus", () => {
  it("maps terminal and non-terminal", () => {
    assert.equal(mapMurekaStatusToMusicStatus("succeeded"), "completed");
    assert.equal(mapMurekaStatusToMusicStatus("failed"), "failed");
    assert.equal(mapMurekaStatusToMusicStatus("timeouted"), "failed");
    assert.equal(mapMurekaStatusToMusicStatus("preparing"), "processing");
    assert.equal(mapMurekaStatusToMusicStatus("pending"), "pending");
  });
});

describe("mapMurekaQueryToGenerationStatus", () => {
  it("maps a single choice (product n=1)", () => {
    const status = mapMurekaQueryToGenerationStatus("task-1", {
      status: "succeeded",
      choices: [
        { id: "c1", mp3_url: "https://cdn.example/a.mp3", duration: 120, lyrics: "la" },
      ],
    });

    assert.equal(status.status, "completed");
    assert.equal(status.provider, "mureka");
    assert.equal(status.tracks?.length, 1);
    assert.equal(status.tracks?.[0]?.id, "c1");
    assert.equal(status.tracks?.[0]?.audioUrl, "https://cdn.example/a.mp3");
  });

  it("truncates unexpected >1 choices to the first result", () => {
    const status = mapMurekaQueryToGenerationStatus("task-1", {
      status: "succeeded",
      choices: [
        { id: "c1", mp3_url: "https://cdn.example/a.mp3", duration: 120, lyrics: "la" },
        { id: "c2", audio_url: "https://cdn.example/b.mp3", duration_sec: 110 },
      ],
    });

    assert.equal(status.status, "completed");
    assert.equal(status.provider, "mureka");
    assert.equal(status.tracks?.length, 1);
    assert.equal(status.tracks?.[0]?.id, "c1");

    const three = mapMurekaQueryToGenerationStatus("task-3", {
      status: "succeeded",
      choices: [
        { id: "c1", mp3_url: "https://cdn.example/a.mp3" },
        { id: "c2", mp3_url: "https://cdn.example/b.mp3" },
        { id: "c3", mp3_url: "https://cdn.example/c.mp3" },
      ],
    });
    assert.equal(three.tracks?.length, 1);
    assert.equal(three.tracks?.[0]?.id, "c1");
  });

  it("returns no tracks when choices are empty (provider failure path upstream)", () => {
    const status = mapMurekaQueryToGenerationStatus("task-empty", {
      status: "succeeded",
      choices: [],
    });
    assert.equal(status.status, "completed");
    assert.equal(status.tracks, undefined);
  });

  it("skips choices without audio url", () => {
    const track = mapMurekaChoiceToGeneratedTrack({ id: "x" }, 0, "t");
    assert.equal(track, null);
  });

  it("does not invent cover when official choice has none", () => {
    const track = mapMurekaChoiceToGeneratedTrack(
      {
        id: "c1",
        url: "https://cdn.example/a.mp3",
        flac_url: "https://cdn.example/a.flac",
        duration: 120,
      },
      0,
      "t",
    );
    assert.equal(track?.audioUrl, "https://cdn.example/a.mp3");
    assert.equal(track?.imageUrl, undefined);
  });
});

describe("resolveMurekaTaskId", () => {
  it("prefers task_id", () => {
    assert.equal(resolveMurekaTaskId({ task_id: "a", id: "b" }), "a");
    assert.equal(resolveMurekaTaskId({ taskId: "c" }), "c");
    assert.equal(resolveMurekaTaskId({ id: "d" }), "d");
  });
});

describe("resolveMurekaVocalId", () => {
  it("accepts vocal_id, id, vocalId and nested data", () => {
    assert.equal(resolveMurekaVocalId({ vocal_id: "v1" }), "v1");
    assert.equal(resolveMurekaVocalId({ id: "1405" }), "1405");
    assert.equal(resolveMurekaVocalId({ vocalId: "v2" }), "v2");
    assert.equal(resolveMurekaVocalId({ data: { vocal_id: "nested" } }), "nested");
    assert.equal(resolveMurekaVocalId({}), null);
  });
});


describe("invalid URL / unknown scheme", () => {
  it("detects undici unknown scheme as configuration, not network", () => {
    const undici = new TypeError("fetch failed");
    Object.assign(undici, { cause: new Error("unknown scheme") });
    // Message may be on the outer or cause — classifier checks the error message itself.
    const direct = new Error("unknown scheme");
    assert.equal(isMurekaInvalidUrlFetchError(direct), true);

    const classified = new MurekaHttpError({
      message: "Mureka base URL has an invalid scheme or is not absolute",
      kind: "configuration",
      retryable: false,
      ambiguous: false,
      cause: direct,
    });
    assert.equal(classified.kind, "configuration");
    assert.equal(classified.retryable, false);
    assert.equal(classified.ambiguous, false);
    const mapped = mapMurekaHttpErrorToMusicError(classified);
    assert.equal(mapped.code, "MUREKA_CONFIG_ERROR");
  });

  it("does not treat generic network failures as invalid URL", () => {
    assert.equal(isMurekaInvalidUrlFetchError(new Error("ECONNRESET")), false);
  });
});

describe("secret safety", () => {
  it("does not put api key into log context", () => {
    const error = new MurekaHttpError({
      message: "boom",
      kind: "server",
      httpStatus: 500,
    });
    const ctx = error.toLogContext();
    assert.equal("apiKey" in ctx, false);
    assert.equal("Authorization" in ctx, false);
  });

  it("assertNoSecretInText throws when key leaks", () => {
    assert.throws(() => assertNoSecretInText("token=SECRET123", "SECRET123"));
  });

  it("assertNoSecretInText coerces non-string vendor payloads", () => {
    assert.doesNotThrow(() =>
      assertNoSecretInText({ code: "invalid_audio" }, "SECRET123"),
    );
    assert.throws(() => assertNoSecretInText(["SECRET123"], "SECRET123"));
  });
});
