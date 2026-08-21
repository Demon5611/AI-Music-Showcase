/**
 * Isolates Personal Voice capability from standard Music Create.
 *
 * Standard path (`usePersonalVoice=false`) is never gated by VoiceProfile,
 * VoiceSample, or voice query failures — only by credits / form validity
 * handled elsewhere.
 */
export type MusicCreateVoiceGateInput = {
  usePersonalVoice: boolean;
  hasReadyPersonalVoice: boolean;
  personalVoiceQueryError: boolean;
};

export type MusicCreateVoiceGate = {
  /** Generate button voice gate (credits/form checked separately). */
  canGenerateWithSelectedVoice: boolean;
  /** Red/amber blocker only when My Voice is ON without a ready profile. */
  showPersonalVoiceBlocker: boolean;
  /** Soft hint: add personal voice later (standard path, no ready profile). */
  showAddPersonalVoiceHint: boolean;
  /** Soft status when profile query failed — never blocks standard create. */
  showPersonalVoiceLoadErrorHint: boolean;
};

export function resolveMusicCreateVoiceGate(
  input: MusicCreateVoiceGateInput,
): MusicCreateVoiceGate {
  if (input.usePersonalVoice) {
    return {
      canGenerateWithSelectedVoice: input.hasReadyPersonalVoice,
      showPersonalVoiceBlocker: !input.hasReadyPersonalVoice,
      showAddPersonalVoiceHint: false,
      showPersonalVoiceLoadErrorHint: false,
    };
  }

  return {
    canGenerateWithSelectedVoice: true,
    showPersonalVoiceBlocker: false,
    showAddPersonalVoiceHint: !input.hasReadyPersonalVoice,
    showPersonalVoiceLoadErrorHint: input.personalVoiceQueryError,
  };
}
