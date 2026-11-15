import { createAudioengineClient, type AudioengineClient, type AudioengineVocalCloneInput } from "./audioengine-client.js";
import { AudioengineHttpError } from "./audioengine-errors.js";
import { getAudioengineVocalCloneLimiter } from "./audioengine-rate-limiter.js";
import { AUDIOENGINE_PROVIDER_ID } from "./audioengine-types.js";

export interface CreateAudioengineVocalCloneResult {
  provider: typeof AUDIOENGINE_PROVIDER_ID;
  vocalId: string;
}

/**
 * Paid vocal-clone boundary. Caller owns credits + VoiceProfile persistence.
 */
export class AudioengineVocalCloneProvider {
  readonly id = AUDIOENGINE_PROVIDER_ID;

  constructor(private readonly client: AudioengineClient = createAudioengineClient()) {}

  async createVocalClone(input: AudioengineVocalCloneInput): Promise<CreateAudioengineVocalCloneResult> {
    const limiter = getAudioengineVocalCloneLimiter();
    const permit = await limiter.acquire();

    try {
      const response = await this.client.createVocalClone(input);
      return {
        provider: AUDIOENGINE_PROVIDER_ID,
        vocalId: response.vocal_id,
      };
    } catch (error) {
      if (error instanceof AudioengineHttpError) {
        throw error;
      }
      throw error;
    } finally {
      await permit.release();
    }
  }
}

export function createAudioengineVocalCloneProvider(
  client?: AudioengineClient,
): AudioengineVocalCloneProvider {
  return new AudioengineVocalCloneProvider(client ?? createAudioengineClient());
}
