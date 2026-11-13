import { z } from "zod";
import { PURCHASABLE_CREDIT_PACKAGE_IDS } from "../constants/legacygateway-checkout.js";

/** Client may send only packageId (+ optional idempotency). Never amount/credits. */
export const createCreditPackCheckoutSchema = z
  .object({
    packageId: z.enum(PURCHASABLE_CREDIT_PACKAGE_IDS),
    /** Stable per double-click / retry; new key = new purchase allowed. */
    clientRequestId: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

export type CreateCreditPackCheckoutInput = z.infer<typeof createCreditPackCheckoutSchema>;

/** Public readiness DTO — boolean only, never credentials or merchant config. */
export const creditPackCheckoutStatusSchema = z
  .object({
    checkoutEnabled: z.boolean(),
  })
  .strict();

export type CreditPackCheckoutStatus = z.infer<typeof creditPackCheckoutStatusSchema>;

/** Browser-facing checkout result. Amount/credits stay server-side. */
export const creditPackCheckoutClientResultSchema = z
  .object({
    purchaseId: z.string().min(1),
    status: z.string().min(1),
    approvalUrl: z.string().url(),
  })
  .strict();

export type CreditPackCheckoutClientResult = z.infer<
  typeof creditPackCheckoutClientResultSchema
>;

export const legacygatewayCallbackBodySchema = z
  .object({
    PaymentId: z.string().trim().min(1),
  })
  .strict();

export type LegacygatewayCallbackBody = z.infer<typeof legacygatewayCallbackBodySchema>;

/**
 * Checkoutgateway host-to-host callback is a loosely-typed JSON object (flat or `{ response }`).
 * Signature verification happens in the service before any field is trusted.
 */
export const checkoutgatewayCallbackBodySchema = z.record(z.unknown());

export type CheckoutgatewayCallbackBody = z.infer<typeof checkoutgatewayCallbackBodySchema>;

/** Authenticated purchase status for browser return polling. Never payment proof. */
export const creditPackPurchaseStatusViewSchema = z
  .object({
    id: z.string().min(1),
    packageId: z.string().min(1),
    status: z.string().min(1),
    providerStatus: z.string().nullable(),
    creditsAmount: z.number(),
    priceAmount: z.number(),
    currency: z.string().min(1),
    paidAt: z.string().nullable(),
    creditedAt: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type CreditPackPurchaseStatusView = z.infer<
  typeof creditPackPurchaseStatusViewSchema
>;

/**
 * Public informational USD→GEL quote for Pricing cards.
 * Not payment proof; checkout persists its own authoritative snapshot on Buy.
 */
export const creditPackPricingFxQuoteSchema = z
  .object({
    available: z.boolean(),
    rate: z.string().nullable(),
    quotedAt: z.string().nullable(),
    source: z.string().nullable(),
    packs: z
      .object({
        starter: z.string().nullable(),
        creator: z.string().nullable(),
        studio: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export type CreditPackPricingFxQuote = z.infer<typeof creditPackPricingFxQuoteSchema>;
