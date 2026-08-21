import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMurekaPrompt, buildSunoStyle, type MusicBrief } from "./music-brief.js";

describe("buildMurekaPrompt", () => {
  it("builds prompt without mixing lyrics", () => {
    const brief: MusicBrief = {
      genre: "pop",
      mood: "uplifting",
      tempo: "medium",
      instruments: ["guitar", "piano"],
      vocalRange: "mid",
      chorusIntensity: "high",
    };

    const prompt = buildMurekaPrompt(brief);
    assert.match(prompt, /genre: pop/);
    assert.match(prompt, /instruments: guitar, piano/);
    assert.doesNotMatch(prompt, /lyrics/i);
  });

  it("returns empty string for empty brief", () => {
    assert.equal(buildMurekaPrompt({}), "");
  });
});

describe("buildSunoStyle", () => {
  it("joins tags with commas", () => {
    assert.equal(
      buildSunoStyle({ genre: "rock", mood: "dark", instruments: ["drums"] }),
      "rock, dark, drums",
    );
  });
});
