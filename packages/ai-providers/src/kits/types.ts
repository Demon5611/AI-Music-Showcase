export interface ListKitsVoiceModelsParams {
  myModels?: boolean;
  instruments?: boolean;
  page?: number;
  perPage?: number;
  order?: "asc" | "desc";
}

export interface KitsVoiceModel {
  id: number;
  title: string;
  tags: string[];
  imageUrl: string | null;
  demoUrl: string | null;
}

export interface KitsPaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
}

export interface KitsVoiceModelsResponse {
  data: KitsVoiceModel[];
  meta: KitsPaginationMeta;
}

export interface KitsStemFileUrl {
  instrument: string;
  url: string;
}

export interface KitsVocalSeparationJob {
  id: number;
  createdAt: string;
  type: "separate";
  status: KitsJobStatus;
  jobStartTime: string | null;
  jobEndTime: string | null;
  vocalAudioFileUrl: string | null;
  lossyVocalAudioFileUrl: string | null;
  backingAudioFileUrl: string | null;
  stemFileUrls: KitsStemFileUrl[] | null;
  lossyStemFileUrls: KitsStemFileUrl[] | null;
}

export interface CreateKitsVocalSeparationInput {
  inputFile: Uint8Array;
  filename: string;
  mimeType?: string;
}

export type KitsJobStatus = "running" | "success" | "error" | "cancelled";

export interface KitsInferenceJob {
  id: number;
  createdAt: string;
  type: "infer" | "tts";
  status: KitsJobStatus;
  jobStartTime: string | null;
  jobEndTime: string | null;
  outputFileUrl: string | null;
  lossyOutputFileUrl: string | null;
  recombinedAudioFileUrl: string | null;
  voiceModelId: string | number | null;
}

export interface CreateKitsVoiceConversionInput {
  voiceModelId: number;
  soundFile: Uint8Array;
  filename: string;
  mimeType?: string;
}
