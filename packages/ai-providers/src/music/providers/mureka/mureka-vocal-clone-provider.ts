import { createMurekaClient, type MurekaClient, type MurekaVocalCloneInput } from "./mureka-client.js";
import { MurekaHttpError } from "./mureka-errors.js";
import { getMurekaVocalCloneLimiter } from "./mureka-rate-limiter.js";
import { MUREKA_PROVIDER_ID } from "./mureka-types.js";

export interface CreateMurekaVocalCloneResult {
  provider: typeof MUREKA_PROVIDER_ID;
  vocalId: string;
}

/**
 * Paid vocal-clone boundary. Caller owns credits + VoiceProfile persistence.
 */
export class MurekaVocalCloneProvider {
  readonly id = MUREKA_PROVIDER_ID;

  constructor(private readonly client: MurekaClient = createMurekaClient()) {}

  async createVocalClone(input: MurekaVocalCloneInput): Promise<CreateMurekaVocalCloneResult> {
    const limiter = getMurekaVocalCloneLimiter();
    const permit = await limiter.acquire();

    try {
      const response = await this.client.createVocalClone(input);
      return {
        provider: MUREKA_PROVIDER_ID,
        vocalId: response.vocal_id,
      };
    } catch (error) {
      if (error instanceof MurekaHttpError) {
        throw error;
      }
      throw error;
    } finally {
      await permit.release();
    }
  }
}

export function createMurekaVocalCloneProvider(
  client?: MurekaClient,
): MurekaVocalCloneProvider {
  return new MurekaVocalCloneProvider(client ?? createMurekaClient());
}
