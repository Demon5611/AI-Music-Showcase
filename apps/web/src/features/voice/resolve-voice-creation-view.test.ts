import assert from "node:assert/strict";
import {
  resolveVoiceCreationMode,
  resolveVoiceCreationView,
  type PersonalVoiceCapabilityState,
  type VoiceCreationSampleState,
  type VoiceSampleDurationBounds,
} from "./resolve-voice-creation-view";

const durationBounds: VoiceSampleDurationBounds = { minSec: 15, maxSec: 30 };

const loaded: PersonalVoiceCapabilityState = {
  isLoading: false,
  isError: false,
  hasData: true,
};
const firstLoad: PersonalVoiceCapabilityState = {
  isLoading: true,
  isError: false,
  hasData: false,
};
const failedFirstLoad: PersonalVoiceCapabilityState = {
  isLoading: false,
  isError: true,
  hasData: false,
};
const failedRefetch: PersonalVoiceCapabilityState = {
  isLoading: false,
  isError: true,
  hasData: true,
};

const eligibleSample: VoiceCreationSampleState = {
  status: "ready",
  consentConfirmed: true,
  durationSec: 20,
  readyForGeneration: false,
};

assert.equal(resolveVoiceCreationMode(true, firstLoad), "mureka");
assert.equal(resolveVoiceCreationMode(true, loaded), "mureka");
assert.equal(resolveVoiceCreationMode(true, failedRefetch), "mureka");
assert.equal(resolveVoiceCreationMode(true, failedFirstLoad), "unavailable");
assert.equal(resolveVoiceCreationMode(false, firstLoad), "suno");
assert.equal(resolveVoiceCreationMode(false, failedFirstLoad), "suno");

// Mureka path: the legacy Suno verification block stays hidden in every sample state.
for (const sample of [
  eligibleSample,
  { ...eligibleSample, status: "pending" as const },
  { ...eligibleSample, consentConfirmed: false },
  { ...eligibleSample, durationSec: 5 },
  { ...eligibleSample, readyForGeneration: true },
]) {
  const view = resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: loaded,
    sample,
    voiceProfileStatus: null,
    durationBounds,
  });

  assert.equal(view.mode, "mureka");
  assert.equal(view.showSunoVerification, false);
  assert.equal(view.showPersonalVoicePanel, true);
  assert.equal(view.showPersonalVoiceUnavailable, false);
}

assert.deepEqual(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: loaded,
    sample: eligibleSample,
    voiceProfileStatus: null,
    durationBounds,
  }),
  {
    mode: "mureka",
    showSunoVerification: false,
    showPersonalVoicePanel: true,
    personalVoiceBlockedReason: null,
    showPersonalVoiceStaleWarning: false,
    showPersonalVoiceUnavailable: false,
    showReadyCta: false,
  },
);

// First load failed: no Suno fallback, no paid CTA, no profile polling surface.
assert.deepEqual(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: failedFirstLoad,
    sample: eligibleSample,
    voiceProfileStatus: null,
    durationBounds,
  }),
  {
    mode: "unavailable",
    showSunoVerification: false,
    showPersonalVoicePanel: false,
    personalVoiceBlockedReason: null,
    showPersonalVoiceStaleWarning: false,
    showPersonalVoiceUnavailable: true,
    showReadyCta: false,
  },
);

// A Suno-verified sample must not resurrect the verification flow on an error either.
assert.deepEqual(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: failedFirstLoad,
    sample: { ...eligibleSample, readyForGeneration: true },
    voiceProfileStatus: "ready",
    durationBounds,
  }),
  {
    mode: "unavailable",
    showSunoVerification: false,
    showPersonalVoicePanel: false,
    personalVoiceBlockedReason: null,
    showPersonalVoiceStaleWarning: false,
    showPersonalVoiceUnavailable: true,
    showReadyCta: false,
  },
);

// Failed refetch with cached data: keep showing the profile, warn without blocking.
assert.deepEqual(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: failedRefetch,
    sample: eligibleSample,
    voiceProfileStatus: "creating",
    durationBounds,
  }),
  {
    mode: "mureka",
    showSunoVerification: false,
    showPersonalVoicePanel: true,
    personalVoiceBlockedReason: null,
    showPersonalVoiceStaleWarning: true,
    showPersonalVoiceUnavailable: false,
    showReadyCta: false,
  },
);

assert.equal(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: failedRefetch,
    sample: eligibleSample,
    voiceProfileStatus: "ready",
    durationBounds,
  }).showReadyCta,
  true,
);

// While the first load is in flight, the paid action is not offered.
assert.equal(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: firstLoad,
    sample: eligibleSample,
    voiceProfileStatus: null,
    durationBounds,
  }).personalVoiceBlockedReason,
  "loading",
);

// Local validation blocks the paid create action before any provider call.
assert.equal(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: loaded,
    sample: { ...eligibleSample, status: "pending" },
    voiceProfileStatus: null,
    durationBounds,
  }).personalVoiceBlockedReason,
  "processing",
);

assert.equal(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: loaded,
    sample: { ...eligibleSample, consentConfirmed: false },
    voiceProfileStatus: null,
    durationBounds,
  }).personalVoiceBlockedReason,
  "consent",
);

assert.equal(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: firstLoad,
    sample: { ...eligibleSample, durationSec: 45 },
    voiceProfileStatus: null,
    durationBounds,
  }).personalVoiceBlockedReason,
  "duration",
);

// Ready CTA on the Mureka path depends on VoiceProfile, not on the Suno persona.
assert.equal(
  resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: loaded,
    sample: eligibleSample,
    voiceProfileStatus: "creating",
    durationBounds,
  }).showReadyCta,
  false,
);

// Legacy Suno path keeps the verification flow.
assert.deepEqual(
  resolveVoiceCreationView({
    personalVoiceEnabled: false,
    capability: loaded,
    sample: eligibleSample,
    voiceProfileStatus: null,
    durationBounds,
  }),
  {
    mode: "suno",
    showSunoVerification: true,
    showPersonalVoicePanel: false,
    personalVoiceBlockedReason: null,
    showPersonalVoiceStaleWarning: false,
    showPersonalVoiceUnavailable: false,
    showReadyCta: false,
  },
);

assert.deepEqual(
  resolveVoiceCreationView({
    personalVoiceEnabled: false,
    capability: failedFirstLoad,
    sample: { ...eligibleSample, readyForGeneration: true },
    voiceProfileStatus: null,
    durationBounds,
  }),
  {
    mode: "suno",
    showSunoVerification: false,
    showPersonalVoicePanel: false,
    personalVoiceBlockedReason: null,
    showPersonalVoiceStaleWarning: false,
    showPersonalVoiceUnavailable: false,
    showReadyCta: true,
  },
);

// No sample yet: only the upload form is relevant on the available paths.
for (const personalVoiceEnabled of [true, false]) {
  const view = resolveVoiceCreationView({
    personalVoiceEnabled,
    capability: loaded,
    sample: null,
    voiceProfileStatus: null,
    durationBounds,
  });

  assert.equal(view.showSunoVerification, false);
  assert.equal(view.showPersonalVoicePanel, false);
  assert.equal(view.personalVoiceBlockedReason, null);
  assert.equal(view.showReadyCta, false);
}

// F. ready profile + audio_purged sample → ready, no processing warning
{
  const view = resolveVoiceCreationView({
    personalVoiceEnabled: true,
    capability: loaded,
    sample: {
      ...eligibleSample,
      status: "audio_purged",
      readyForGeneration: false,
    },
    voiceProfileStatus: "ready",
    durationBounds,
  });
  assert.equal(view.personalVoiceBlockedReason, null);
  assert.equal(view.showReadyCta, true);
  assert.equal(view.showPersonalVoicePanel, true);
}

console.log("resolve-voice-creation-view tests passed");
