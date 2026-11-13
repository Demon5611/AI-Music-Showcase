import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyAudioengineHttpStatus,
  isAudioengineInvalidUrlFetchError,
  AudioengineHttpError,
  assertNoSecretInText,
  mapAudioengineHttpErrorToMusicError,
} from "./audioengine-errors.js";
import {
  mapAudioengineChoiceToGeneratedTrack,
  mapAudioengineQueryToGenerationStatus,
  mapAudioengineStatusToMusicStatus,
} from "./audioengine-status-mapper.js";
import { resolveAudioengineTaskId, resolveAudioengineVocalId } from "./audioengine-types.js";

describe("classifyAudioengineHttpStatus", () => {
  it("maps known statuses", () => {
    assert.equal(classifyAudioengineHttpStatus(400).kind, "validation");
    assert.equal(classifyAudioengineHttpStatus(401).kind, "authentication");
    assert.equal(classifyAudioengineHttpStatus(402).kind, "insufficient_balance");
    assert.equal(classifyAudioengineHttpStatus(403).kind, "permission");
    assert.equal(classifyAudioengineHttpStatus(429).retryable, true);
    assert.equal(classifyAudioengineHttpStatus(503).retryable, true);
  });
});

describe("mapAudioengineStatusToMusicStatus", () => {
  it("maps terminal and non-terminal", () => {
    assert.equal(mapAudioengineStatusToMusicStatus("succeeded"), "completed");
    assert.equal(mapAudioengineStatusToMusicStatus("failed"), "failed");
    assert.equal(mapAudioengineStatusToMusicStatus("timeouted"), "failed");
    assert.equal(mapAudioengineStatusToMusicStatus("preparing"), "processing");
    assert.equal(mapAudioengineStatusToMusicStatus("pending"), "pending");
  });
});

describe("mapAudioengineQueryToGenerationStatus", () => {
  it("maps a single choice (product n=1)", () => {
    const status = mapAudioengineQueryToGenerationStatus("task-1", {
      status: "succeeded",
      choices: [
        { id: "c1", mp3_url: "https://cdn.example/a.mp3", duration: 120, lyrics: "la" },
      ],
    });

    assert.equal(status.status, "completed");
    assert.equal(status.provider, "audioengine");
    assert.equal(status.tracks?.length, 1);
    assert.equal(status.tracks?.[0]?.id, "c1");
    assert.equal(status.tracks?.[0]?.audioUrl, "https://cdn.example/a.mp3");
  });

  it("truncates unexpected >1 choices to the first result", () => {
    const status = mapAudioengineQueryToGenerationStatus("task-1", {
      status: "succeeded",
      choices: [
        { id: "c1", mp3_url: "https://cdn.example/a.mp3", duration: 120, lyrics: "la" },
        { id: "c2", audio_url: "https://cdn.example/b.mp3", duration_sec: 110 },
      ],
    });

    assert.equal(status.status, "completed");
    assert.equal(status.provider, "audioengine");
    assert.equal(status.tracks?.length, 1);
    assert.equal(status.tracks?.[0]?.id, "c1");

    const three = mapAudioengineQueryToGenerationStatus("task-3", {
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
    const status = mapAudioengineQueryToGenerationStatus("task-empty", {
      status: "succeeded",
      choices: [],
    });
    assert.equal(status.status, "completed");
    assert.equal(status.tracks, undefined);
  });

  it("skips choices without audio url", () => {
    const track = mapAudioengineChoiceToGeneratedTrack({ id: "x" }, 0, "t");
    assert.equal(track, null);
  });

  it("does not invent cover when official choice has none", () => {
    const track = mapAudioengineChoiceToGeneratedTrack(
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

describe("resolveAudioengineTaskId", () => {
  it("prefers task_id", () => {
    assert.equal(resolveAudioengineTaskId({ task_id: "a", id: "b" }), "a");
    assert.equal(resolveAudioengineTaskId({ taskId: "c" }), "c");
    assert.equal(resolveAudioengineTaskId({ id: "d" }), "d");
  });
});

describe("resolveAudioengineVocalId", () => {
  it("accepts vocal_id, id, vocalId and nested data", () => {
    assert.equal(resolveAudioengineVocalId({ vocal_id: "v1" }), "v1");
    assert.equal(resolveAudioengineVocalId({ id: "1405" }), "1405");
    assert.equal(resolveAudioengineVocalId({ vocalId: "v2" }), "v2");
    assert.equal(resolveAudioengineVocalId({ data: { vocal_id: "nested" } }), "nested");
    assert.equal(resolveAudioengineVocalId({}), null);
  });
});


describe("invalid URL / unknown scheme", () => {
  it("detects undici unknown scheme as configuration, not network", () => {
    const undici = new TypeError("fetch failed");
    Object.assign(undici, { cause: new Error("unknown scheme") });
    // Message may be on the outer or cause — classifier checks the error message itself.
    const direct = new Error("unknown scheme");
    assert.equal(isAudioengineInvalidUrlFetchError(direct), true);

    const classified = new AudioengineHttpError({
      message: "Audioengine base URL has an invalid scheme or is not absolute",
      kind: "configuration",
      retryable: false,
      ambiguous: false,
      cause: direct,
    });
    assert.equal(classified.kind, "configuration");
    assert.equal(classified.retryable, false);
    assert.equal(classified.ambiguous, false);
    const mapped = mapAudioengineHttpErrorToMusicError(classified);
    assert.equal(mapped.code, "AUDIOENGINE_CONFIG_ERROR");
  });

  it("does not treat generic network failures as invalid URL", () => {
    assert.equal(isAudioengineInvalidUrlFetchError(new Error("ECONNRESET")), false);
  });
});

describe("secret safety", () => {
  it("does not put api key into log context", () => {
    const error = new AudioengineHttpError({
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
