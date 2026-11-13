/** Voiceengine UI components allowed in this project (visual layer only). */
export const VOICEENGINE_ALLOWED_COMPONENTS = [
  "orb",
  "waveform",
  "audio-player",
  "skeleton",
  "progress",
  "shimmering-text",
] as const;

/** Registry slugs that must never be added (voice agent / chat UI). */
export const VOICEENGINE_FORBIDDEN_COMPONENTS = [
  "conversation",
  "conversation-bar",
  "voice-chat-01",
  "voice-chat-02",
  "voice-chat-03",
  "voice-button",
  "speech-input",
  "transcriber-01",
  "realtime-transcriber-01",
  "transcript-viewer",
  "mic-selector",
  "voice-picker",
  "voice-form-01",
  "voice-nav-01",
] as const;

/** Editor paths where Voiceengine UI imports are forbidden. */
export const VOICEENGINE_FORBIDDEN_PATH_PREFIX =
  "apps/web/src/features/music-editor/";
