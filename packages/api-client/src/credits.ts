import type { CreditsBalance } from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createCreditsApi(client: ApiClient) {
  return {
    getBalance: () => client.get<CreditsBalance>("/api/credits/balance"),
  };
}
