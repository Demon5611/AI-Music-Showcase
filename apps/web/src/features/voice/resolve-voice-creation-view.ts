import type { VoiceProfileStatus, VoiceSampleStatus } from "@ai-music/shared";

/**
 * Active personal-voice path for the voice creation screen.
 * `unavailable` keeps personal voice from silently degrading to the Suno flow
 * when the capability state cannot be loaded at all.
 */
export type VoiceCreationMode = "mureka" | "suno" | "unavailable";

/** `GET /api/voice-profiles/me` observer state. `hasData` means it resolved once. */
export interface PersonalVoiceCapabilityState {
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
}

export type PersonalVoiceBlockedReason =
  | "loading"
  | "processing"
  | "consent"
  | "duration";

export interface VoiceCreationSampleState {
  status: VoiceSampleStatus;
  consentConfirmed: boolean;
  durationSec: number;
  /** Legacy Suno persona readiness (`isVoiceSampleReadyForGeneration`). */
  readyForGeneration: boolean;
}

export interface VoiceSampleDurationBounds {
  minSec: number;
  maxSec: number;
}

export interface VoiceCreationViewInput {
  personalVoiceEnabled: boolean;
  capability: PersonalVoiceCapabilityState;
  sample: VoiceCreationSampleState | null;
  voiceProfileStatus: VoiceProfileStatus | null;
  durationBounds: VoiceSampleDurationBounds;
}

export interface VoiceCreationView {
  mode: VoiceCreationMode;
  /** Legacy Suno phrase verification block — only on the Suno path. */
  showSunoVerification: boolean;
  showPersonalVoicePanel: boolean;
  /** Local validation result; blocks the paid create action until resolved. */
  personalVoiceBlockedReason: PersonalVoiceBlockedReason | null;
  /** Refresh failed but cached profile state is still shown — non-blocking. */
  showPersonalVoiceStaleWarning: boolean;
  showPersonalVoiceUnavailable: boolean;
  showReadyCta: boolean;
}

export function resolveVoiceCreationMode(
  personalVoiceEnabled: boolean,
  capability: PersonalVoiceCapabilityState,
): VoiceCreationMode {
  if (!personalVoiceEnabled) {
    return "suno";
  }

  return capability.isError && !capability.hasData ? "unavailable" : "mureka";
}

function resolveLocalBlockedReason(
  sample: VoiceCreationSampleState,
  bounds: VoiceSampleDurationBounds,
): PersonalVoiceBlockedReason | null {
  if (sample.status !== "ready") {
    return "processing";
  }

  if (!sample.consentConfirmed) {
    return "consent";
  }

  if (sample.durationSec < bounds.minSec || sample.durationSec > bounds.maxSec) {
    return "duration";
  }

  return null;
}

function resolvePersonalVoiceBlockedReason(
  sample: VoiceCreationSampleState | null,
  bounds: VoiceSampleDurationBounds,
  capability: PersonalVoiceCapabilityState,
): PersonalVoiceBlockedReason | null {
  if (!sample) {
    return null;
  }

  const localReason = resolveLocalBlockedReason(sample, bounds);
  if (localReason) {
    return localReason;
  }

  // Profile state is still unknown — do not offer the paid action yet.
  return capability.isLoading && !capability.hasData ? "loading" : null;
}

export function resolveVoiceCreationView(
  input: VoiceCreationViewInput,
): VoiceCreationView {
  const {
    personalVoiceEnabled,
    capability,
    sample,
    voiceProfileStatus,
    durationBounds,
  } = input;
  const mode = resolveVoiceCreationMode(personalVoiceEnabled, capability);

  if (mode === "unavailable") {
    return {
      mode,
      showSunoVerification: false,
      showPersonalVoicePanel: false,
      personalVoiceBlockedReason: null,
      showPersonalVoiceStaleWarning: false,
      showPersonalVoiceUnavailable: true,
      showReadyCta: false,
    };
  }

  if (mode === "mureka") {
    const readyProfile = voiceProfileStatus === "ready";
    return {
      mode,
      showSunoVerification: false,
      showPersonalVoicePanel: sample !== null,
      // Ready Mureka vocal_id is reusable without source sample audio.
      personalVoiceBlockedReason: readyProfile
        ? null
        : resolvePersonalVoiceBlockedReason(
            sample,
            durationBounds,
            capability,
          ),
      showPersonalVoiceStaleWarning: capability.isError && capability.hasData,
      showPersonalVoiceUnavailable: false,
      showReadyCta: readyProfile,
    };
  }

  return {
    mode,
    showSunoVerification: sample !== null && !sample.readyForGeneration,
    showPersonalVoicePanel: false,
    personalVoiceBlockedReason: null,
    showPersonalVoiceStaleWarning: false,
    showPersonalVoiceUnavailable: false,
    showReadyCta: sample?.readyForGeneration === true,
  };
}
