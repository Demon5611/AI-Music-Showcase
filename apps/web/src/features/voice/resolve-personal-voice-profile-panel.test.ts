import assert from "node:assert/strict";
import type { VoiceProfileDto } from "@ai-music/shared";
import {
  resolvePersonalVoicePanelPresentation,
  resolveProfileForSample,
} from "./resolve-personal-voice-profile-panel.js";

function profile(overrides: Partial<VoiceProfileDto>): VoiceProfileDto {
  return {
    id: "vp-1",
    status: "failed",
    provider: "mureka",
    sourceVoiceSampleId: "sample-a",
    refundConfirmed: false,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    ...overrides,
  };
}

// Previous failed profile + new sample → failed banner hidden.
assert.equal(
  resolveProfileForSample(profile({ sourceVoiceSampleId: "sample-a" }), "sample-b"),
  null,
);
assert.equal(
  resolvePersonalVoicePanelPresentation({
    profile: null,
    blockedReason: null,
  }).showFailedBanner,
  false,
);
assert.equal(
  resolvePersonalVoicePanelPresentation({
    profile: null,
    blockedReason: null,
  }).createCtaMode,
  "create",
);

// Current failed profile → error shown; refund copy only when ledger-confirmed.
const failedNoRefund = resolvePersonalVoicePanelPresentation({
  profile: profile({ status: "failed", refundConfirmed: false }),
  blockedReason: null,
});
assert.equal(failedNoRefund.showFailedBanner, true);
assert.equal(failedNoRefund.showRefundConfirmed, false);
assert.equal(failedNoRefund.createCtaMode, "retry");

const failedRefunded = resolvePersonalVoicePanelPresentation({
  profile: profile({ status: "failed", refundConfirmed: true }),
  blockedReason: null,
});
assert.equal(failedRefunded.showRefundConfirmed, true);
assert.equal(failedRefunded.createCtaMode, "retry");

// Ready profile for matching sample — create CTA hidden; deletion is Profile-only.
const ready = resolvePersonalVoicePanelPresentation({
  profile: profile({ status: "ready", sourceVoiceSampleId: "sample-a" }),
  blockedReason: null,
});
assert.equal(ready.showCreateCta, false);
assert.equal(ready.status, "ready");

console.log("resolve-personal-voice-profile-panel unit tests passed");
