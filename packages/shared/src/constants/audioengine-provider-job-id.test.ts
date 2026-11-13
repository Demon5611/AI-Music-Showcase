import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBullMqJobId } from "./bullmq-job-id.js";
import { audioengineProviderJobId } from "./audioengine-provider-job-queue.js";

describe("createBullMqJobId", () => {
  it("joins parts with hyphen and rejects colon", () => {
    assert.equal(createBullMqJobId("audioengine-poll", "rec1", 2), "audioengine-poll-rec1-2");
    assert.throws(() => createBullMqJobId("a:b"), /must not contain/);
    assert.throws(() => createBullMqJobId("ok", "has:colon"), /must not contain/);
  });
});

describe("audioengineProviderJobId", () => {
  it("builds generate/poll/vocal-clone ids without colon", () => {
    const generateId = audioengineProviderJobId({
      type: "audioengine_music_generate",
      userId: "u1",
      recordId: "cmsho2ehp0005o60ls2li8xfp",
      songInputJson: "{}",
      spendReason: "x",
    });
    assert.equal(generateId, "audioengine-music-generate-cmsho2ehp0005o60ls2li8xfp");
    assert.equal(generateId.includes(":"), false);

    const poll1 = audioengineProviderJobId({
      type: "audioengine_music_poll",
      userId: "u1",
      recordId: "cmsho2ehp0005o60ls2li8xfp",
      providerTaskId: "task-1",
      submittedAtMs: 1,
      attempt: 1,
    });
    const poll2 = audioengineProviderJobId({
      type: "audioengine_music_poll",
      userId: "u1",
      recordId: "cmsho2ehp0005o60ls2li8xfp",
      providerTaskId: "task-1",
      submittedAtMs: 1,
      attempt: 2,
    });
    assert.equal(poll1, "audioengine-poll-cmsho2ehp0005o60ls2li8xfp-1");
    assert.equal(poll2, "audioengine-poll-cmsho2ehp0005o60ls2li8xfp-2");
    assert.notEqual(poll1, poll2);
    assert.equal(poll1.includes(":"), false);
    assert.equal(poll2.includes(":"), false);

    const vocalId = audioengineProviderJobId({
      type: "audioengine_vocal_clone",
      userId: "u1",
      voiceProfileId: "vp1",
      voiceSampleId: "vs1",
      spendReason: "x",
    });
    assert.equal(vocalId, "audioengine-vocal-clone-vp1");
    assert.equal(vocalId.includes(":"), false);
  });
});
