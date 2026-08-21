export type SunoMusicTaskStatus =
  | "PENDING"
  | "TEXT_SUCCESS"
  | "FIRST_SUCCESS"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_AUDIO_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR";

export type SunoLyricsTaskStatus =
  | "PENDING"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_LYRICS_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR";

export type SunoModelId = "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5";

export interface SunoApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

export interface SunoTaskIdData {
  taskId: string;
}

export interface SunoTrackRaw {
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

export interface SunoMusicResponseRaw {
  taskId?: string;
  sunoData?: SunoTrackRaw[];
  data?: SunoTrackRaw[];
}

export interface SunoMusicTaskRaw {
  taskId: string;
  status: SunoMusicTaskStatus | string;
  errorMessage?: string | null;
  response?: SunoMusicResponseRaw | null;
}

export interface SunoLyricsItemRaw {
  text: string;
  title: string;
  status?: string;
  errorMessage?: string;
}

export interface SunoLyricsResponseRaw {
  taskId?: string;
  data?: SunoLyricsItemRaw[];
}

export interface SunoLyricsTaskRaw {
  taskId: string;
  status: SunoLyricsTaskStatus | string;
  errorMessage?: string | null;
  response?: SunoLyricsResponseRaw | null;
}

export interface SunoGenerateLyricsRequest {
  prompt: string;
  callBackUrl: string;
}

export interface SunoGenerateMusicRequest {
  prompt?: string;
  style?: string;
  title?: string;
  customMode: boolean;
  instrumental: boolean;
  model: SunoModelId;
  callBackUrl: string;
  personaId?: string;
  personaModel?: "voice_persona" | "style_persona";
  vocalGender?: "m" | "f";
}

export interface SunoUploadCoverRequest extends SunoGenerateMusicRequest {
  uploadUrl: string;
}

export interface SunoExtendMusicRequest {
  audioId: string;
  defaultParamFlag: boolean;
  prompt?: string;
  style?: string;
  title?: string;
  continueAt?: number;
  model: SunoModelId;
  callBackUrl: string;
}

export interface SunoVocalRemovalRequest {
  taskId: string;
  audioId: string;
  type: "separate_vocal" | "split_stem";
  callBackUrl: string;
}

export interface SunoVocalRemovalResponseRaw {
  vocalUrl?: string;
  vocal_url?: string;
  instrumentalUrl?: string;
  instrumental_url?: string;
  originUrl?: string;
  origin_url?: string;
}

export interface SunoVocalRemovalTaskRaw {
  taskId: string;
  successFlag?: string;
  errorMessage?: string | null;
  response?: SunoVocalRemovalResponseRaw | null;
}

export interface SunoTimestampedLyricsRequest {
  taskId: string;
  audioId: string;
}

export interface SunoAlignedWordRaw {
  word: string;
  startS: number;
  endS: number;
  success?: boolean;
}

export interface SunoTimestampedLyricsDataRaw {
  alignedWords?: SunoAlignedWordRaw[];
  waveformData?: number[];
  hootCer?: number;
  isStreamed?: boolean;
}

export interface SunoAlbumCoverGenerateRequest {
  taskId: string;
  callBackUrl: string;
}

export interface SunoAlbumCoverTaskRaw {
  taskId: string;
  parentTaskId?: string;
  successFlag?: number;
  errorMessage?: string | null;
  response?: {
    images?: string[];
  } | null;
}
