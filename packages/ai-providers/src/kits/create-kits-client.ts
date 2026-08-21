import { KitsClient } from "./kits-client.js";

export interface KitsClientConfig {
  baseUrl?: string;
  apiKey?: string;
}

export function createKitsClient(config: KitsClientConfig = {}): KitsClient {
  const baseUrl = config.baseUrl ?? process.env.KITS_API_BASE_URL;
  const apiKey = config.apiKey ?? process.env.KITS_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("KITS_API_BASE_URL and KITS_API_KEY are required");
  }

  return new KitsClient(baseUrl.replace(/\/$/, ""), apiKey);
}
