import { isShowcaseMode } from "@ai-music/shared";
import { AUDIOENGINE_PROVIDER_ID } from "../music/providers/audioengine/audioengine-types.js";
import type { VoiceProvider } from "./voice-deletion.types.js";
import { createDemoVoiceProvider } from "./providers/demo/demo-voice.provider.js";
import { createAudioengineVoiceProvider } from "./providers/audioengine/audioengine-voice-provider.js";

export function createVoiceProvider(providerId: string): VoiceProvider | null {
  if (isShowcaseMode()) {
    return createDemoVoiceProvider();
  }

  if (providerId === AUDIOENGINE_PROVIDER_ID) {
    return createAudioengineVoiceProvider();
  }

  return null;
}
