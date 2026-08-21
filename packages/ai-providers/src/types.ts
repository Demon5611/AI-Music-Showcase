export interface ConvertVoiceInput {
  sourceAudioUrl: string;
  voiceSampleUrl: string;
}

export interface ConvertedVoiceResult {
  audioUrl: string;
  providerJobId: string;
}

export interface VoiceConversionProvider {
  convertVoice(input: ConvertVoiceInput): Promise<ConvertedVoiceResult>;
}
