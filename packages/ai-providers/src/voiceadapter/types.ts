export interface ListVoiceadapterVoiceModelsParams {
  myModels?: boolean;
  instruments?: boolean;
  page?: number;
  perPage?: number;
  order?: "asc" | "desc";
}

export interface VoiceadapterVoiceModel {
  id: number;
  title: string;
  tags: string[];
  imageUrl: string | null;
  demoUrl: string | null;
}

export interface VoiceadapterPaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
}

export interface VoiceadapterVoiceModelsResponse {
  data: VoiceadapterVoiceModel[];
  meta: VoiceadapterPaginationMeta;
}

export interface VoiceadapterStemFileUrl {
  instrument: string;
  url: string;
}

export interface VoiceadapterVocalSeparationJob {
  id: number;
  createdAt: string;
  type: "separate";
  status: VoiceadapterJobStatus;
  jobStartTime: string | null;
  jobEndTime: string | null;
  vocalAudioFileUrl: string | null;
  lossyVocalAudioFileUrl: string | null;
  backingAudioFileUrl: string | null;
  stemFileUrls: VoiceadapterStemFileUrl[] | null;
  lossyStemFileUrls: VoiceadapterStemFileUrl[] | null;
}

export interface CreateVoiceadapterVocalSeparationInput {
  inputFile: Uint8Array;
  filename: string;
  mimeType?: string;
}

export type VoiceadapterJobStatus = "running" | "success" | "error" | "cancelled";

export interface VoiceadapterInferenceJob {
  id: number;
  createdAt: string;
  type: "infer" | "tts";
  status: VoiceadapterJobStatus;
  jobStartTime: string | null;
  jobEndTime: string | null;
  outputFileUrl: string | null;
  lossyOutputFileUrl: string | null;
  recombinedAudioFileUrl: string | null;
  voiceModelId: string | number | null;
}

export interface CreateVoiceadapterVoiceConversionInput {
  voiceModelId: number;
  soundFile: Uint8Array;
  filename: string;
  mimeType?: string;
}
