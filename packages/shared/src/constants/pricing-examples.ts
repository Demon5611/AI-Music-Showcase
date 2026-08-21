import {
  OPERATION_COST_CREDITS,
  STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS,
} from "./credits-economy.js";
import {
  CREDIT_PACKAGES,
  FREE_CREDIT_OFFER,
  type CreditPackageId,
} from "./credit-packages.js";
import { MUREKA_OUTPUT_COUNT } from "./mureka-economics.js";

/**
 * Marketing estimate helpers derived from credit-economy SoT.
 * These are examples, not guarantees — real spend depends on selected AI operations.
 */

export interface StandardMusicGenerationExample {
  /** Credits for one standard AI flow (lyrics + Mureka generateSongs). */
  creditsPerGeneration: number;
  generations: number;
  /** Outputs per generation; follows Mureka default variant count. */
  variants: number;
}

export interface PersonalVoiceGenerationExample {
  personalVoiceCostCredits: number;
  /** 1 when pack can afford creating a Personal AI Voice, else 0. */
  personalVoiceCreations: number;
  generationsAfterVoice: number;
  variantsAfterVoice: number;
  generationsWithoutNewVoice: number;
  variantsWithoutNewVoice: number;
}

export function computeStandardMusicGenerationExample(
  availableCredits: number,
): StandardMusicGenerationExample {
  const creditsPerGeneration = STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS;
  const generations = Math.floor(availableCredits / creditsPerGeneration);

  return {
    creditsPerGeneration,
    generations,
    variants: generations * MUREKA_OUTPUT_COUNT,
  };
}

export function computePersonalVoiceGenerationExample(
  availableCredits: number,
): PersonalVoiceGenerationExample {
  const personalVoiceCostCredits = OPERATION_COST_CREDITS.createPersonalVoice;
  const canCreateVoice = availableCredits >= personalVoiceCostCredits;
  const remaining = canCreateVoice
    ? availableCredits - personalVoiceCostCredits
    : availableCredits;
  const afterVoice = computeStandardMusicGenerationExample(remaining);
  const withoutVoice = computeStandardMusicGenerationExample(availableCredits);

  return {
    personalVoiceCostCredits,
    personalVoiceCreations: canCreateVoice ? 1 : 0,
    generationsAfterVoice: afterVoice.generations,
    variantsAfterVoice: afterVoice.variants,
    generationsWithoutNewVoice: withoutVoice.generations,
    variantsWithoutNewVoice: withoutVoice.variants,
  };
}

export function getPackageStandardExample(
  packageId: "free" | CreditPackageId,
): StandardMusicGenerationExample {
  const credits =
    packageId === "free"
      ? FREE_CREDIT_OFFER.credits
      : CREDIT_PACKAGES.find((pkg) => pkg.id === packageId)?.credits;

  if (credits === undefined) {
    throw new Error(`Unknown credit package: ${packageId}`);
  }

  return computeStandardMusicGenerationExample(credits);
}

export function getPackagePersonalVoiceExample(
  packageId: CreditPackageId,
): PersonalVoiceGenerationExample {
  const pkg = CREDIT_PACKAGES.find((item) => item.id === packageId);

  if (!pkg) {
    throw new Error(`Unknown credit package: ${packageId}`);
  }

  return computePersonalVoiceGenerationExample(pkg.credits);
}
