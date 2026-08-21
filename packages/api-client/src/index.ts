export { ApiError, createApiClient } from "./client.js";
export type { ApiClient, ApiClientOptions } from "./client.js";
export { createVoiceSamplesApi } from "./voice-samples.js";
export { createVoiceProfilesApi } from "./voice-profiles.js";
export { createAccountApi } from "./account.js";
export type { AccountDeletionState } from "./account.js";
export { createGenerationsApi } from "./generations.js";
export { createTracksApi } from "./tracks.js";
export { createBillingApi } from "./billing.js";
export { createUsersApi } from "./users.js";
export { createCreditsApi } from "./credits.js";
export { createMusicApi } from "./music.js";
export type { GenerateSongBody } from "./music.js";
export { createMusicEditorApi } from "./music-editor.js";

import type { ApiClientOptions } from "./client.js";
import { createApiClient } from "./client.js";
import { createBillingApi } from "./billing.js";
import { createCreditsApi } from "./credits.js";
import { createGenerationsApi } from "./generations.js";
import { createTracksApi } from "./tracks.js";
import { createUsersApi } from "./users.js";
import { createMusicApi } from "./music.js";
import { createMusicEditorApi } from "./music-editor.js";
import { createVoiceSamplesApi } from "./voice-samples.js";
import { createVoiceProfilesApi } from "./voice-profiles.js";
import { createAccountApi } from "./account.js";

export function createApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    voiceSamples: createVoiceSamplesApi(client),
    voiceProfiles: createVoiceProfilesApi(client),
    generations: createGenerationsApi(client),
    tracks: createTracksApi(client),
    music: createMusicApi(client),
    musicEditor: createMusicEditorApi(client),
    billing: createBillingApi(client),
    users: createUsersApi(client),
    credits: createCreditsApi(client),
    account: createAccountApi(client),
  };
}

export type Api = ReturnType<typeof createApi>;
