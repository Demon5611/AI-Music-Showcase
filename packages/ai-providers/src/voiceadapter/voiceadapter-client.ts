import type {
  CreateVoiceadapterVocalSeparationInput,
  CreateVoiceadapterVoiceConversionInput,
  VoiceadapterInferenceJob,
  VoiceadapterVoiceModel,
  VoiceadapterVoiceModelsResponse,
  VoiceadapterVocalSeparationJob,
  ListVoiceadapterVoiceModelsParams,
} from "./types.js";
import { throwVoiceadapterApiError } from "./voiceadapter-api-error.js";

export class VoiceadapterClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async listVoiceModels(
    params: ListVoiceadapterVoiceModelsParams = {},
  ): Promise<VoiceadapterVoiceModelsResponse> {
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
      await throwVoiceadapterApiError(response, "Voiceadapter listVoiceModels");
    }

    return response.json() as Promise<VoiceadapterVoiceModelsResponse>;
  }

  async getVoiceModel(id: number): Promise<VoiceadapterVoiceModel> {
    const response = await fetch(`${this.baseUrl}/voice-models/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      await throwVoiceadapterApiError(response, "Voiceadapter getVoiceModel");
    }

    return response.json() as Promise<VoiceadapterVoiceModel>;
  }

  async createVoiceConversion(
    input: CreateVoiceadapterVoiceConversionInput,
  ): Promise<VoiceadapterInferenceJob> {
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
      await throwVoiceadapterApiError(response, "Voiceadapter createVoiceConversion");
    }

    return response.json() as Promise<VoiceadapterInferenceJob>;
  }

  async getVoiceConversion(id: number): Promise<VoiceadapterInferenceJob> {
    const response = await fetch(`${this.baseUrl}/voice-conversions/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      await throwVoiceadapterApiError(response, "Voiceadapter getVoiceConversion");
    }

    return response.json() as Promise<VoiceadapterInferenceJob>;
  }

  async createVocalSeparation(
    input: CreateVoiceadapterVocalSeparationInput,
  ): Promise<VoiceadapterVocalSeparationJob> {
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
      await throwVoiceadapterApiError(response, "Voiceadapter createVocalSeparation");
    }

    return response.json() as Promise<VoiceadapterVocalSeparationJob>;
  }

  async getVocalSeparation(id: number): Promise<VoiceadapterVocalSeparationJob> {
    const response = await fetch(`${this.baseUrl}/vocal-separations/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      await throwVoiceadapterApiError(response, "Voiceadapter getVocalSeparation");
    }

    return response.json() as Promise<VoiceadapterVocalSeparationJob>;
  }
}
