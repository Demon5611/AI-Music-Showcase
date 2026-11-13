export type LegacyengineVoiceTaskStatus =
  | "wait_processing"
  | "processing_validate"
  | "processing_validate_fail"
  | "wait_validating"
  | "success"
  | "fail";

export interface LegacyengineVoiceValidateRequest {
  voiceUrl: string;
  vocalStartS: number;
  vocalEndS: number;
  language?: string;
  callBackUrl?: string;
}

export interface LegacyengineVoiceGenerateRequest {
  taskId: string;
  verifyUrl: string;
  voiceName?: string;
  description?: string;
  style?: string;
  singerSkillLevel?: "beginner" | "intermediate" | "advanced" | "professional";
  callBackUrl?: string;
}

export interface LegacyengineVoiceValidateInfo {
  taskId: string;
  validateInfo: string;
  status: LegacyengineVoiceTaskStatus | string;
  errorCode?: number;
  errorMessage?: string | null;
}

export interface LegacyengineVoiceRecordInfo {
  taskId: string;
  voiceId: string;
  status: LegacyengineVoiceTaskStatus | string;
  errorCode?: number;
  errorMessage?: string | null;
}

export interface LegacyengineFileUploadResult {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
}

export interface LegacyengineVoiceConfig {
  apiBaseUrl: string;
  fileUploadBaseUrl: string;
  apiKey: string;
  callbackUrl: string;
  requestTimeoutMs: number;
  voiceLanguage: string;
}
