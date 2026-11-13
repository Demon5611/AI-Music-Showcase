import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAudioenginePrompt, buildLegacyengineStyle, type MusicBrief } from "./music-brief.js";

describe("buildAudioenginePrompt", () => {
  it("builds prompt without mixing lyrics", () => {
    const brief: MusicBrief = {
      genre: "pop",
      mood: "uplifting",
      tempo: "medium",
      instruments: ["guitar", "piano"],
      vocalRange: "mid",
      chorusIntensity: "high",
    };

    const prompt = buildAudioenginePrompt(brief);
    assert.match(prompt, /genre: pop/);
    assert.match(prompt, /instruments: guitar, piano/);
    assert.doesNotMatch(prompt, /lyrics/i);
  });

  it("returns empty string for empty brief", () => {
    assert.equal(buildAudioenginePrompt({}), "");
  });
});

describe("buildLegacyengineStyle", () => {
  it("joins tags with commas", () => {
    assert.equal(
      buildLegacyengineStyle({ genre: "rock", mood: "dark", instruments: ["drums"] }),
      "rock, dark, drums",
    );
  });
});
