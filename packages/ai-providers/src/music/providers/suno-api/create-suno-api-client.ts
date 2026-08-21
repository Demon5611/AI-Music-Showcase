import {
  resolveMusicProviderConfig,
  type MusicProviderConfig,
} from "../../music-config.js";
import { SunoApiClient } from "./suno-api.client.js";

export function createSunoApiClient(
  config: Pick<
    MusicProviderConfig,
    "sunoApiBaseUrl" | "sunoApiKey" | "requestTimeoutMs"
  > = resolveMusicProviderConfig(),
): SunoApiClient {
  return new SunoApiClient({
    baseUrl: config.sunoApiBaseUrl,
    apiKey: config.sunoApiKey,
    timeoutMs: config.requestTimeoutMs,
  });
}
