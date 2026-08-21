import type {
  CreateKitsVocalSeparationInput,
  CreateKitsVoiceConversionInput,
  KitsInferenceJob,
  KitsVoiceModel,
  KitsVoiceModelsResponse,
  KitsVocalSeparationJob,
  ListKitsVoiceModelsParams,
} from "./types.js";
import { throwKitsApiError } from "./kits-api-error.js";

export class KitsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async listVoiceModels(
    params: ListKitsVoiceModelsParams = {},
  ): Promise<KitsVoiceModelsResponse> {
    const search = new URLSearchParams();

    if (params.myModels) {
      search.set("myModels", "true");
    }

    if (params.instruments === false) {
      search.set("instruments", "false");
    }

    if (params.page) {
      search.set("page", String(params.page));
    }

    if (params.perPage) {
      search.set("perPage", String(params.perPage));
    }

    if (params.order) {
      search.set("order", params.order);
    }

    const query = search.toString();
    const url = `${this.baseUrl}/voice-models${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      await throwKitsApiError(response, "Kits listVoiceModels");
    }

    return response.json() as Promise<KitsVoiceModelsResponse>;
  }

  async getVoiceModel(id: number): Promise<KitsVoiceModel> {
    const response = await fetch(`${this.baseUrl}/voice-models/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      await throwKitsApiError(response, "Kits getVoiceModel");
    }

    return response.json() as Promise<KitsVoiceModel>;
  }

  async createVoiceConversion(
    input: CreateKitsVoiceConversionInput,
  ): Promise<KitsInferenceJob> {
    const form = new FormData();
    form.append("voiceModelId", String(input.voiceModelId));

    const bytes = Uint8Array.from(input.soundFile);
    const blob = new Blob([bytes], {
      type: input.mimeType ?? "audio/mpeg",
    });
    form.append("soundFile", blob, input.filename);

    const response = await fetch(`${this.baseUrl}/voice-conversions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      await throwKitsApiError(response, "Kits createVoiceConversion");
    }

    return response.json() as Promise<KitsInferenceJob>;
  }

  async getVoiceConversion(id: number): Promise<KitsInferenceJob> {
    const response = await fetch(`${this.baseUrl}/voice-conversions/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      await throwKitsApiError(response, "Kits getVoiceConversion");
    }

    return response.json() as Promise<KitsInferenceJob>;
  }

  async createVocalSeparation(
    input: CreateKitsVocalSeparationInput,
  ): Promise<KitsVocalSeparationJob> {
    const form = new FormData();
    const bytes = Uint8Array.from(input.inputFile);
    const blob = new Blob([bytes], {
      type: input.mimeType ?? "audio/mpeg",
    });
    form.append("inputFile", blob, input.filename);

    const response = await fetch(`${this.baseUrl}/vocal-separations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      await throwKitsApiError(response, "Kits createVocalSeparation");
    }

    return response.json() as Promise<KitsVocalSeparationJob>;
  }

  async getVocalSeparation(id: number): Promise<KitsVocalSeparationJob> {
    const response = await fetch(`${this.baseUrl}/vocal-separations/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      await throwKitsApiError(response, "Kits getVocalSeparation");
    }

    return response.json() as Promise<KitsVocalSeparationJob>;
  }
}
