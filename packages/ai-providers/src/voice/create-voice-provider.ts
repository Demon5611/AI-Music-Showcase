import { isShowcaseMode } from "@ai-music/shared";
import { MUREKA_PROVIDER_ID } from "../music/providers/mureka/mureka-types.js";
import type { VoiceProvider } from "./voice-deletion.types.js";
import { createDemoVoiceProvider } from "./providers/demo/demo-voice.provider.js";
import { createMurekaVoiceProvider } from "./providers/mureka/mureka-voice-provider.js";

export function createVoiceProvider(providerId: string): VoiceProvider | null {
  if (isShowcaseMode()) {
    return createDemoVoiceProvider();
  }

  if (providerId === MUREKA_PROVIDER_ID) {
    return createMurekaVoiceProvider();
  }

  return null;
}
