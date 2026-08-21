/**
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/music-create/utils/resolve-music-create-voice-gate.test.ts
 */
import assert from "node:assert/strict";
import { resolveMusicCreateVoiceGate } from "./resolve-music-create-voice-gate.js";

const standardNoProfile = resolveMusicCreateVoiceGate({
  usePersonalVoice: false,
  hasReadyPersonalVoice: false,
  personalVoiceQueryError: false,
});
assert.deepEqual(standardNoProfile, {
  canGenerateWithSelectedVoice: true,
  showPersonalVoiceBlocker: false,
  showAddPersonalVoiceHint: true,
  showPersonalVoiceLoadErrorHint: false,
});

const standardQueryError = resolveMusicCreateVoiceGate({
  usePersonalVoice: false,
  hasReadyPersonalVoice: false,
  personalVoiceQueryError: true,
});
assert.equal(standardQueryError.canGenerateWithSelectedVoice, true);
assert.equal(standardQueryError.showPersonalVoiceBlocker, false);
assert.equal(standardQueryError.showPersonalVoiceLoadErrorHint, true);

const personalOnReady = resolveMusicCreateVoiceGate({
  usePersonalVoice: true,
  hasReadyPersonalVoice: true,
  personalVoiceQueryError: false,
});
assert.deepEqual(personalOnReady, {
  canGenerateWithSelectedVoice: true,
  showPersonalVoiceBlocker: false,
  showAddPersonalVoiceHint: false,
  showPersonalVoiceLoadErrorHint: false,
});

const personalOnMissing = resolveMusicCreateVoiceGate({
  usePersonalVoice: true,
  hasReadyPersonalVoice: false,
  personalVoiceQueryError: false,
});
assert.equal(personalOnMissing.canGenerateWithSelectedVoice, false);
assert.equal(personalOnMissing.showPersonalVoiceBlocker, true);

const readyProfileStandard = resolveMusicCreateVoiceGate({
  usePersonalVoice: false,
  hasReadyPersonalVoice: true,
  personalVoiceQueryError: false,
});
assert.equal(readyProfileStandard.canGenerateWithSelectedVoice, true);
assert.equal(readyProfileStandard.showAddPersonalVoiceHint, false);

console.log("resolve-music-create-voice-gate.test.ts: ok");
