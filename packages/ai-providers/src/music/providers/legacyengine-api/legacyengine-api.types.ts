export type LegacyengineMusicTaskStatus =
  | "PENDING"
  | "TEXT_SUCCESS"
  | "FIRST_SUCCESS"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_AUDIO_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR";

export type LegacyengineLyricsTaskStatus =
  | "PENDING"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_LYRICS_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR";

export type LegacyengineModelId = "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5";

export interface LegacyengineApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

export interface LegacyengineTaskIdData {
  taskId: string;
}

export interface LegacyengineTrackRaw {
  id: string;
  title?: string;
  audioUrl?: string;
  audio_url?: string;
  streamAudioUrl?: string;
  stream_audio_url?: string;
  imageUrl?: string;
  image_url?: string;
  prompt?: string;
  tags?: string;
  duration?: number;
}

export interface LegacyengineMusicResponseRaw {
  taskId?: string;
  legacyengineData?: LegacyengineTrackRaw[];
  data?: LegacyengineTrackRaw[];
}

export interface LegacyengineMusicTaskRaw {
  taskId: string;
  status: LegacyengineMusicTaskStatus | string;
  errorMessage?: string | null;
  response?: LegacyengineMusicResponseRaw | null;
}

export interface LegacyengineLyricsItemRaw {
  text: string;
  title: string;
  status?: string;
  errorMessage?: string;
}

export interface LegacyengineLyricsResponseRaw {
  taskId?: string;
  data?: LegacyengineLyricsItemRaw[];
}

export interface LegacyengineLyricsTaskRaw {
  taskId: string;
  status: LegacyengineLyricsTaskStatus | string;
  errorMessage?: string | null;
  response?: LegacyengineLyricsResponseRaw | null;
}

export interface LegacyengineGenerateLyricsRequest {
  prompt: string;
  callBackUrl: string;
}

export interface LegacyengineGenerateMusicRequest {
  prompt?: string;
  style?: string;
  title?: string;
  customMode: boolean;
  instrumental: boolean;
  model: LegacyengineModelId;
  callBackUrl: string;
  personaId?: string;
  personaModel?: "voice_persona" | "style_persona";
  vocalGender?: "m" | "f";
}

export interface LegacyengineUploadCoverRequest extends LegacyengineGenerateMusicRequest {
  uploadUrl: string;
}

export interface LegacyengineExtendMusicRequest {
  audioId: string;
  defaultParamFlag: boolean;
  prompt?: string;
  style?: string;
  title?: string;
  continueAt?: number;
  model: LegacyengineModelId;
  callBackUrl: string;
}

export interface LegacyengineVocalRemovalRequest {
  taskId: string;
  audioId: string;
  type: "separate_vocal" | "split_stem";
  callBackUrl: string;
}

export interface LegacyengineVocalRemovalResponseRaw {
  vocalUrl?: string;
  vocal_url?: string;
  instrumentalUrl?: string;
  instrumental_url?: string;
  originUrl?: string;
  origin_url?: string;
}

export interface LegacyengineVocalRemovalTaskRaw {
  taskId: string;
  successFlag?: string;
  errorMessage?: string | null;
  response?: LegacyengineVocalRemovalResponseRaw | null;
}

export interface LegacyengineTimestampedLyricsRequest {
  taskId: string;
  audioId: string;
}

export interface LegacyengineAlignedWordRaw {
  word: string;
  startS: number;
  endS: number;
  success?: boolean;
}

export interface LegacyengineTimestampedLyricsDataRaw {
  alignedWords?: LegacyengineAlignedWordRaw[];
  waveformData?: number[];
  hootCer?: number;
  isStreamed?: boolean;
}

export interface LegacyengineAlbumCoverGenerateRequest {
  taskId: string;
  callBackUrl: string;
}

export interface LegacyengineAlbumCoverTaskRaw {
  taskId: string;
  parentTaskId?: string;
  successFlag?: number;
  errorMessage?: string | null;
  response?: {
    images?: string[];
  } | null;
}
