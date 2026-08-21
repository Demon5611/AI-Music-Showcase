import assert from "node:assert/strict";
import { MuteTrackOperationSchema } from "./music-editor.js";

assert.equal(
  MuteTrackOperationSchema.safeParse({
    type: "MUTE_TRACK",
    trackId: "vocal",
    muted: true,
  }).success,
  true,
  "mute without regionId is valid",
);

assert.equal(
  MuteTrackOperationSchema.safeParse({
    type: "MUTE_TRACK",
    trackId: "instrumental",
    regionId: "legacy-region",
    muted: false,
  }).success,
  true,
  "legacy mute with regionId remains valid",
);

assert.equal(
  MuteTrackOperationSchema.safeParse({
    type: "MUTE_TRACK",
    trackId: "vocal",
  }).success,
  false,
  "muted flag is required",
);

console.log("mute-track-operation-schema.test.ts: ok");
