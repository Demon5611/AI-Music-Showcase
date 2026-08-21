import { z } from "zod";
import {
  MAX_VOICE_SAMPLE_DURATION_SEC,
  MIN_VOICE_SAMPLE_DURATION_SEC,
} from "../constants/index.js";
import {
  isVoiceConsentPhraseForLanguage,
  voiceLanguageSchema,
} from "../voice-language/index.js";

export const musicStyleSchema = z.enum([
  "pop",
  "rock",
  "hip-hop",
  "electronic",
  "r-and-b",
  "acoustic",
]);

export const createGenerationSchema = z.object({
  prompt: z.string().min(3).max(500),
  style: musicStyleSchema,
  voiceSampleId: z.string().min(1),
  duration: z.number().int().min(30).max(180).default(60),
});

export const uploadVoiceSampleFieldsSchema = z
  .object({
    confirmed: z.literal(true),
    voiceLanguage: voiceLanguageSchema,
    consentPhrase: z.string().min(1),
    durationSec: z.coerce
      .number()
      .int()
      .min(MIN_VOICE_SAMPLE_DURATION_SEC)
      .max(MAX_VOICE_SAMPLE_DURATION_SEC),
  })
  .superRefine((data, ctx) => {
    if (!isVoiceConsentPhraseForLanguage(data.consentPhrase, data.voiceLanguage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consentPhrase"],
        message: "Consent phrase does not match voice language",
      });
    }
  });

/** @deprecated Use uploadVoiceSampleFieldsSchema — consent is language-bound. */
export const voiceConsentSchema = z.object({
  confirmed: z.literal(true),
  voiceLanguage: voiceLanguageSchema,
  consentPhrase: z.string().min(1),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
export type VoiceConsentInput = z.infer<typeof voiceConsentSchema>;
export type UploadVoiceSampleFields = z.infer<typeof uploadVoiceSampleFieldsSchema>;

export {
  createCreditPackCheckoutSchema,
  creditPackCheckoutStatusSchema,
  creditPackCheckoutClientResultSchema,
  creditPackPurchaseStatusViewSchema,
  creditPackPricingFxQuoteSchema,
  tbcCallbackBodySchema,
  flittCallbackBodySchema,
} from "./credit-pack-checkout.js";
export type {
  CreateCreditPackCheckoutInput,
  CreditPackCheckoutStatus,
  CreditPackCheckoutClientResult,
  CreditPackPurchaseStatusView,
  CreditPackPricingFxQuote,
  TbcCallbackBody,
  FlittCallbackBody,
} from "./credit-pack-checkout.js";

export {
  approveRefundRequestSchema,
  createRefundRequestSchema,
  rejectRefundRequestSchema,
} from "./refund.js";
export type {
  ApproveRefundRequestInput,
  CreateRefundRequestInput,
  RejectRefundRequestInput,
} from "./refund.js";

export { createSignedReadUrlSchema } from "./storage-signed-url.js";
export type { CreateSignedReadUrlInput } from "./storage-signed-url.js";

export {
  ApplyOperationBodySchema,
  DeleteRegionOperationSchema,
  DuplicateRegionOperationSchema,
  EditOperationSchema,
  FadeOperationSchema,
  MoveRegionOperationSchema,
  MuteTrackOperationSchema,
  SoloTrackOperationSchema,
  normalizeLegacyEditOperation,
  SetVolumeOperationSchema,
  SplitRegionOperationSchema,
} from "./music-editor.js";
export type { ParsedApplyOperationBody, ParsedEditOperation } from "./music-editor.js";

export const musicRemixBodySchema = z
  .object({
    styleId: musicStyleSchema,
  })
  .strict();

export type MusicRemixBody = z.infer<typeof musicRemixBodySchema>;

export {
  musicGenerateBodySchema,
  providerGenerationOptionsSchema,
  sunoGenerationOptionsSchema,
  murekaGenerationOptionsSchema,
  musicBriefSchema,
} from "./music-generate-body.js";
export type { MusicGenerateBody, MusicBriefBody } from "./music-generate-body.js";

export { musicLyricsGenerateBodySchema } from "./music-lyrics-generate-body.js";
export type { MusicLyricsGenerateBody } from "./music-lyrics-generate-body.js";

export { createMurekaVoiceProfileSchema } from "./voice-profile.js";
export type { CreateMurekaVoiceProfileBody } from "./voice-profile.js";
