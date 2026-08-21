import { assertSunoApiKey } from "../music/providers/suno-api/suno-api.errors.js";
import type { SunoFileUploadResult } from "./suno-voice.types.js";

const UPLOAD_PATH = "voice-samples";

export interface SunoFileUploadClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export class SunoFileUploadClient {
  constructor(private readonly config: SunoFileUploadClientConfig) {
    assertSunoApiKey(config.apiKey);
  }

  async uploadAudio(
    data: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<SunoFileUploadResult> {
    const form = new FormData();
    const bytes = new Uint8Array(data);
    const blob = new Blob([bytes], { type: mimeType });
    form.append("file", blob, filename);
    form.append("uploadPath", UPLOAD_PATH);
    form.append("fileName", filename);

    const url = `${this.config.baseUrl.replace(/\/$/, "")}/api/file-stream-upload`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: form,
        signal: controller.signal,
      });

      const body = (await response.json()) as {
        success?: boolean;
        code?: number;
        msg?: string;
        data?: {
          downloadUrl?: string;
          fileName?: string;
          mimeType?: string;
        };
      };

      if (!response.ok || body.code !== 200 || !body.data?.downloadUrl) {
        throw new Error(body.msg ?? `Suno file upload failed (${response.status})`);
      }

      return {
        downloadUrl: body.data.downloadUrl,
        fileName: body.data.fileName ?? filename,
        mimeType: body.data.mimeType ?? mimeType,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
