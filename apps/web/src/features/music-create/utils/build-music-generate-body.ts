import type { LyricsLanguage, MusicGenerateBody } from "@ai-music/shared";

export type MusicGenerateFormInput = {
  prompt: string;
  style: string;
  title: string;
  durationSec: number;
  voiceSampleId: string | null;
  voiceProfileId: string | null;
  usePersonalVoice: boolean;
  lyricsLanguage?: LyricsLanguage | string;
};

/**
 * Builds POST /api/music/generate body.
 *
 * Personal Voice ON → Mureka (+ voiceProfileId; backend resolves vocal_id).
 * Personal Voice OFF → SunoAPI (standard AI vocal). Ready profile alone does not
 * select Mureka.
 */
export function buildMusicGenerateBody(input: MusicGenerateFormInput): MusicGenerateBody {
  const prompt = input.prompt.trim();
  const style = input.style.trim() || undefined;
  const title = input.title.trim() || undefined;
  const durationSec = input.durationSec > 0 ? input.durationSec : undefined;
  const lyricsLanguage = (input.lyricsLanguage ?? "auto") as LyricsLanguage;

  if (input.usePersonalVoice) {
    const voiceProfileId = input.voiceProfileId?.trim();
    if (!voiceProfileId) {
      throw new Error("voiceProfileId is required for personal voice generation");
    }

    return {
      prompt,
      style,
      title,
      durationSec,
      mode: "song",
      voiceProfileId,
      usePersonalVoice: true,
      lyricsLanguage,
      musicBrief: style ? { additionalInstructions: style } : undefined,
      providerOptions: {
        providerId: "mureka",
        options: {
          voiceProfileId,
        },
      },
    };
  }

  return {
    prompt,
    style,
    title,
    customMode: true,
    instrumental: false,
    durationSec,
    usePersonalVoice: false,
    lyricsLanguage,
  };
}
