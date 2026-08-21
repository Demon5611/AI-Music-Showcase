export type CreditUnits = number;

export const CREDIT_UNIT_SCALE = 1000;

/**
 * Product billing costs in display credits (1 credit = CREDIT_UNIT_SCALE units).
 * Not provider wholesale credits — our own abstraction.
 */
export const OPERATION_COST_CREDITS = {
  generateText: 1,
  /** Suno generation, 2 variants. */
  generateTrack: 15,
  /** Mureka generation product credit. Independent of current default 1 provider output. */
  generateSongs: 24,
  createPersonalVoice: 1_200,
  reusePersonalVoice: 0,
  enablePersonalVoice: 0,
  disablePersonalVoice: 0,
  deletePersonalVoice: 0,
  /** Separate vocal / instrumental. */
  stemSeparation: 12,
  karaokeLyrics: 1,
  sfxGeneration: 3,
  replaceMusicSection: 6,
  extendMusic: 15,
  uploadExtend: 15,
  uploadReplaceAudio: 15,
  addInstrumental: 15,
  addVocal: 15,
  advancedStemSeparation: 24,
  fullStemSeparation: 60,
  musicVideo: 3,
  boostMusicStyle: 1,
  /** Cover generation — free while provider COGS is 0. */
  albumCover: 0,
  wavExport: 0,
  renderMp3: 0,
  mp3Export: 0,
  manualEditorOperation: 0,
  cachedDownload: 0,
} as const;

export type OperationCostKey = keyof typeof OPERATION_COST_CREDITS;

export function creditsToUnits(credits: number): CreditUnits {
  return Math.round(credits * CREDIT_UNIT_SCALE);
}

export function unitsToCredits(units: CreditUnits): number {
  return units / CREDIT_UNIT_SCALE;
}

/** Ledger units for every product operation. Prefer this over hardcoded numbers. */
export const OPERATION_COST_UNITS = {
  generateText: creditsToUnits(OPERATION_COST_CREDITS.generateText),
  generateTrack: creditsToUnits(OPERATION_COST_CREDITS.generateTrack),
  generateSongs: creditsToUnits(OPERATION_COST_CREDITS.generateSongs),
  createPersonalVoice: creditsToUnits(OPERATION_COST_CREDITS.createPersonalVoice),
  reusePersonalVoice: creditsToUnits(OPERATION_COST_CREDITS.reusePersonalVoice),
  enablePersonalVoice: creditsToUnits(OPERATION_COST_CREDITS.enablePersonalVoice),
  disablePersonalVoice: creditsToUnits(OPERATION_COST_CREDITS.disablePersonalVoice),
  deletePersonalVoice: creditsToUnits(OPERATION_COST_CREDITS.deletePersonalVoice),
  stemSeparation: creditsToUnits(OPERATION_COST_CREDITS.stemSeparation),
  karaokeLyrics: creditsToUnits(OPERATION_COST_CREDITS.karaokeLyrics),
  sfxGeneration: creditsToUnits(OPERATION_COST_CREDITS.sfxGeneration),
  replaceMusicSection: creditsToUnits(OPERATION_COST_CREDITS.replaceMusicSection),
  extendMusic: creditsToUnits(OPERATION_COST_CREDITS.extendMusic),
  uploadExtend: creditsToUnits(OPERATION_COST_CREDITS.uploadExtend),
  uploadReplaceAudio: creditsToUnits(OPERATION_COST_CREDITS.uploadReplaceAudio),
  addInstrumental: creditsToUnits(OPERATION_COST_CREDITS.addInstrumental),
  addVocal: creditsToUnits(OPERATION_COST_CREDITS.addVocal),
  advancedStemSeparation: creditsToUnits(OPERATION_COST_CREDITS.advancedStemSeparation),
  fullStemSeparation: creditsToUnits(OPERATION_COST_CREDITS.fullStemSeparation),
  musicVideo: creditsToUnits(OPERATION_COST_CREDITS.musicVideo),
  boostMusicStyle: creditsToUnits(OPERATION_COST_CREDITS.boostMusicStyle),
  albumCover: creditsToUnits(OPERATION_COST_CREDITS.albumCover),
  wavExport: creditsToUnits(OPERATION_COST_CREDITS.wavExport),
  renderMp3: creditsToUnits(OPERATION_COST_CREDITS.renderMp3),
  mp3Export: creditsToUnits(OPERATION_COST_CREDITS.mp3Export),
  manualEditorOperation: creditsToUnits(OPERATION_COST_CREDITS.manualEditorOperation),
  cachedDownload: creditsToUnits(OPERATION_COST_CREDITS.cachedDownload),
} as const satisfies Record<OperationCostKey, CreditUnits>;

/**
 * Marketing example only — not a guarantee.
 * Real spend depends on selected AI operations.
 * Default standard AI flow: lyrics + Mureka generation product credit.
 */
export const STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS =
  OPERATION_COST_CREDITS.generateText + OPERATION_COST_CREDITS.generateSongs;

/** @deprecated Prefer STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS for marketing. */
export const FULL_PRODUCTION_FLOW_UNITS = creditsToUnits(
  STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS,
);

/** Free signup one-time grant. Must stay equal to `FREE_CREDIT_OFFER.credits` / free pack. */
export const FREE_DEMO_CREDITS = 50;
export const FREE_DEMO_CREDIT_UNITS = FREE_DEMO_CREDITS * CREDIT_UNIT_SCALE;

export function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCreditsFromUnits(units: CreditUnits): string {
  return formatCredits(unitsToCredits(units));
}

export function canAffordTrackGeneration(
  balance: number,
  costUnits: CreditUnits = OPERATION_COST_UNITS.generateTrack,
): boolean {
  return balance >= unitsToCredits(costUnits);
}

export function isZeroCostOperation(costUnits: CreditUnits): boolean {
  return costUnits <= 0;
}

/** Personal AI Voice create gate is credits-only (no pack entitlement). */
export function canAffordPersonalVoiceCreation(balanceCredits: number): boolean {
  return balanceCredits >= OPERATION_COST_CREDITS.createPersonalVoice;
}
