import assert from "node:assert/strict";
import {
  preferReadyProfileForSample,
  resolvePersonalVoicePanelPresentation,
  resolveProfileForSample,
} from "./resolve-personal-voice-profile-panel.js";
import type { VoiceProfileDto } from "@ai-music/shared";

function profile(
  status: VoiceProfileDto["status"],
  overrides?: Partial<VoiceProfileDto>,
): VoiceProfileDto {
  return {
    id: overrides?.id ?? "vp-1",
    provider: "mureka",
    status,
    sourceVoiceSampleId: overrides?.sourceVoiceSampleId ?? "sample-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    refundConfirmed: status === "failed",
    ...overrides,
  };
}

// Failed creation: only failure/refund — not deletion copy
{
  const view = resolvePersonalVoicePanelPresentation({
    profile: profile("failed"),
    blockedReason: null,
  });
  assert.equal(view.showFailedBanner, true);
  assert.equal(view.showRefundConfirmed, true);
  assert.equal(view.createCtaMode, "retry");
}

// Ready: create CTA hidden (enable/disable is Music Create toggle)
{
  const view = resolvePersonalVoicePanelPresentation({
    profile: profile("ready"),
    blockedReason: null,
  });
  assert.equal(view.showFailedBanner, false);
  assert.equal(view.showCreateCta, false);
  assert.equal(view.status, "ready");
}

// F. ready + processing blockedReason from purged sample must not matter at panel
// (parent clears blockedReason when ready; presentation stays ready-only)
{
  const view = resolvePersonalVoicePanelPresentation({
    profile: profile("ready"),
    blockedReason: "processing",
  });
  assert.equal(view.status, "ready");
  assert.equal(view.showFailedBanner, false);
  assert.equal(view.showCreateCta, false);
}

// G. old failed profiles with same sample do not override current ready
{
  const failed = profile("failed", { id: "vp-failed-old" });
  const ready = profile("ready", { id: "vp-ready-paid" });
  const chosen = preferReadyProfileForSample([failed, ready], "sample-1");
  assert.equal(chosen?.id, "vp-ready-paid");
  assert.equal(chosen?.status, "ready");

  const resolved = resolveProfileForSample(ready, "sample-1");
  assert.equal(resolved?.id, "vp-ready-paid");
  const presentation = resolvePersonalVoicePanelPresentation({
    profile: resolved,
    blockedReason: null,
  });
  assert.equal(presentation.status, "ready");
  assert.equal(presentation.showFailedBanner, false);
}

// Deletion lifecycle must not mix with failed/retry UI
for (const status of [
  "deletion_requested",
  "deleted_locally",
  "provider_deletion_pending",
  "provider_deleted",
] as const) {
  const view = resolvePersonalVoicePanelPresentation({
    profile: profile(status),
    blockedReason: null,
  });
  assert.equal(view.showFailedBanner, false, status);
  assert.equal(view.showCreateCta, false, status);
  assert.equal(view.createCtaMode, null, status);
}

console.log("resolve-personal-voice-profile-panel.deletion-states.test.ts: ok");
