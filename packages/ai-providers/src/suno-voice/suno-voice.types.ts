export type SunoVoiceTaskStatus =
  | "wait_processing"
  | "processing_validate"
  | "processing_validate_fail"
  | "wait_validating"
  | "success"
  | "fail";

export interface SunoVoiceValidateRequest {
  voiceUrl: string;
  vocalStartS: number;
  vocalEndS: number;
  language?: string;
  callBackUrl?: string;
}

export interface SunoVoiceGenerateRequest {
  taskId: string;
  verifyUrl: string;
  voiceName?: string;
  description?: string;
  style?: string;
  singerSkillLevel?: "beginner" | "intermediate" | "advanced" | "professional";
  callBackUrl?: string;
}

export interface SunoVoiceValidateInfo {
  taskId: string;
  validateInfo: string;
  status: SunoVoiceTaskStatus | string;
  errorCode?: number;
  errorMessage?: string | null;
}

export interface SunoVoiceRecordInfo {
  taskId: string;
  voiceId: string;
  status: SunoVoiceTaskStatus | string;
  errorCode?: number;
  errorMessage?: string | null;
}

export interface SunoFileUploadResult {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
}

export interface SunoVoiceConfig {
  apiBaseUrl: string;
  fileUploadBaseUrl: string;
  apiKey: string;
  callbackUrl: string;
  requestTimeoutMs: number;
  voiceLanguage: string;
}
