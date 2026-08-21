/**
 * Landing standard-path CTA after the optional Personal Voice section.
 *
 * Always enabled: VoiceProfile / VoiceSample / consent / mic / Mureka state
 * must not disable "Create a track with AI vocals".
 */
export type ContinueWithoutVoiceCtaInput = {
  voiceProfileQueryError?: boolean;
  hasReadyVoiceProfile?: boolean;
  hasFailedVoiceSample?: boolean;
  hasFailedVoiceProfile?: boolean;
  consentUnchecked?: boolean;
  microphoneDenied?: boolean;
};

export type ContinueWithoutVoiceCta = {
  href: "/music-create";
  enabled: true;
};

export function resolveContinueWithoutVoiceCta(
  input: ContinueWithoutVoiceCtaInput = {},
): ContinueWithoutVoiceCta {
  // Keep the parameter for the product contract / tests: voice state is ignored.
  void input;
  return {
    href: "/music-create",
    enabled: true,
  };
}
