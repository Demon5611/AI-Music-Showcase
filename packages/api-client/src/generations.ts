import type { CreateGenerationInput, GenerationJob } from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createGenerationsApi(client: ApiClient) {
  return {
    create: (input: CreateGenerationInput) =>
      client.post<{ jobId: string }>("/api/generations", input),
    get: (id: string) => client.get<GenerationJob>(`/api/generations/${id}`),
    getStatus: (id: string) =>
      client.get<{ status: GenerationJob["status"] }>(
        `/api/generations/${id}/status`,
      ),
  };
}
