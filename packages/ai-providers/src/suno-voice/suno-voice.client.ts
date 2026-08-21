import {
  assertSunoApiKey,
  mapSunoApiCodeToError,
  parseSunoEnvelope,
} from "../music/providers/suno-api/suno-api.errors.js";
import type {
  SunoVoiceGenerateRequest,
  SunoVoiceRecordInfo,
  SunoVoiceValidateInfo,
  SunoVoiceValidateRequest,
} from "./suno-voice.types.js";

const API_PREFIX = "/api/v1";

export interface SunoVoiceClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export class SunoVoiceClient {
  constructor(private readonly config: SunoVoiceClientConfig) {
    assertSunoApiKey(config.apiKey);
  }

  createValidationPhrase(body: SunoVoiceValidateRequest): Promise<string> {
    return this.createTask("/voice/validate", body);
  }

  generateCustomVoice(body: SunoVoiceGenerateRequest): Promise<string> {
    return this.createTask("/voice/generate", body);
  }

  regenerateValidationPhrase(taskId: string, callbackUrl: string): Promise<string> {
    return this.createTask("/voice/regenerate", {
      taskId,
      calBackUrl: callbackUrl,
    });
  }

  getValidationPhraseInfo(taskId: string): Promise<SunoVoiceValidateInfo> {
    return this.fetchTask<Record<string, unknown>>(
      `/voice/validate-info?taskId=${encodeURIComponent(taskId)}`,
    ).then((raw) => this.normalizeValidateInfo(raw));
  }

  async getVoiceRecordInfo(taskId: string): Promise<SunoVoiceRecordInfo> {
    return this.fetchTask<Record<string, unknown>>(
      `/voice/record-info?taskId=${encodeURIComponent(taskId)}`,
    ).then((raw) => this.normalizeRecordInfo(raw));
  }

  checkVoiceAvailability(id: string): Promise<boolean> {
    return this.checkVoiceAvailabilityByPayload({ task_id: id }).then(async (available) => {
      if (available) {
        return true;
      }

      return this.checkVoiceAvailabilityByPayload({ voice_id: id });
    });
  }

  /** For music generation personaId — only Suno Voice `voice_id`, not task_id. */
  checkVoiceIdAvailability(voiceId: string): Promise<boolean> {
    const trimmed = voiceId.trim();

    if (!trimmed) {
      return Promise.resolve(false);
    }

    return this.checkVoiceAvailabilityByPayload({ voice_id: trimmed });
  }

  /**
   * Persona readiness: some Suno tasks return voiceId === taskId; check-voice
   * may answer on task_id while voice_id-only check fails — try both.
   */
  async checkPersonaVoiceAvailability(id: string): Promise<boolean> {
    const trimmed = id.trim();

    if (!trimmed) {
      return false;
    }

    if (await this.checkVoiceIdAvailability(trimmed)) {
      return true;
    }

    return this.checkVoiceAvailability(trimmed);
  }

  private checkVoiceAvailabilityByPayload(
    body: Record<string, string>,
  ): Promise<boolean> {
    return this.request<{ isAvailable: boolean }>("/voice/check-voice", {
      method: "POST",
      body: JSON.stringify(body),
    })
      .then((data) => data.isAvailable)
      .catch(() => false);
  }

  private async createTask(path: string, body: unknown): Promise<string> {
    const data = await this.request<{ taskId: string }>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!data.taskId) {
      throw mapSunoApiCodeToError(500, "Suno Voice API did not return taskId");
    }

    return data.taskId;
  }

  private async fetchTask<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private normalizeValidateInfo(raw: Record<string, unknown>): SunoVoiceValidateInfo {
    const phrase = raw.validateInfo ?? raw.validate_info;
    const errorMessage = raw.errorMessage ?? raw.error_message;

    return {
      taskId: String(raw.taskId ?? raw.task_id ?? ""),
      validateInfo: typeof phrase === "string" ? phrase : "",
      status: String(raw.status ?? ""),
      errorCode: typeof raw.errorCode === "number" ? raw.errorCode : undefined,
      errorMessage: typeof errorMessage === "string" ? errorMessage : null,
    };
  }

  private normalizeRecordInfo(raw: Record<string, unknown>): SunoVoiceRecordInfo {
    const voiceIdRaw = raw.voiceId ?? raw.voice_id;
    const errorMessage = raw.errorMessage ?? raw.error_message;
    const voiceId = typeof voiceIdRaw === "string" ? voiceIdRaw.trim() : "";

    return {
      taskId: String(raw.taskId ?? raw.task_id ?? ""),
      voiceId,
      status: String(raw.status ?? ""),
      errorCode: typeof raw.errorCode === "number" ? raw.errorCode : undefined,
      errorMessage: typeof errorMessage === "string" ? errorMessage : null,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}${API_PREFIX}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });

      const envelope = await parseSunoEnvelope<T>(response);
      return envelope.data;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function isSunoVoiceTaskPending(status: string): boolean {
  return (
    status === "wait_processing" ||
    status === "processing_validate" ||
    status === "wait_validating"
  );
}

export function isSunoVoiceTaskFailed(status: string): boolean {
  return status === "fail" || status === "processing_validate_fail";
}
