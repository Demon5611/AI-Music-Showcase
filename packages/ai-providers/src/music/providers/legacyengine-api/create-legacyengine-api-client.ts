import {
  resolveMusicProviderConfig,
  type MusicProviderConfig,
} from "../../music-config.js";
import { LegacyengineApiClient } from "./legacyengine-api.client.js";

export function createLegacyengineApiClient(
  config: Pick<
    MusicProviderConfig,
    "legacyengineApiBaseUrl" | "legacyengineApiKey" | "requestTimeoutMs"
  > = resolveMusicProviderConfig(),
): LegacyengineApiClient {
  return new LegacyengineApiClient({
    baseUrl: config.legacyengineApiBaseUrl,
    apiKey: config.legacyengineApiKey,
    timeoutMs: config.requestTimeoutMs,
  });
}
