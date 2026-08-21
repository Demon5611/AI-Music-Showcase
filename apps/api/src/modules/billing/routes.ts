import type { FastifyInstance } from "fastify";
import {
  createCreditPackCheckoutSchema,
  flittCallbackBodySchema,
  tbcCallbackBodySchema,
} from "@ai-music/shared";
import { RATE_LIMITS, userRateLimitRouteConfig } from "../../common/rate-limit.js";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import {
  assertCheckoutAvailableOrThrow,
  createCreditPackCheckout,
  getCreditPackCheckoutStatus,
  getCreditPackPricingFxQuote,
  getCreditPackPurchaseStatusOnly,
  handleFlittCallback,
  handleTbcCallback,
  normalizeBillingError,
} from "./credit-pack-checkout.service.js";
import { getUserSubscriptionSummary } from "./entitlements.service.js";

export async function registerBillingRoutes(app: FastifyInstance) {
  app.get("/api/billing/subscription", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const summary = await getUserSubscriptionSummary(request.userId!);
      return reply.send(summary);
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  /**
   * Public CTA readiness. Boolean only — no credentials, merchant ids, or URLs.
   * checkoutEnabled=true only when Flitt is enabled and configured.
   * TBC env never enables the CTA. Unknown PAYMENT_PROVIDER fails closed.
   */
  app.get("/api/billing/credit-packs/checkout-status", async (_request, reply) => {
    return reply.send(getCreditPackCheckoutStatus());
  });

  /**
   * Public informational USD→GEL equivalents for Pricing cards.
   * Soft-fail when NBG is unavailable (available=false, packs null).
   * Never payment proof — Buy uses a fresh checkout snapshot.
   */
  app.get(
    "/api/billing/credit-packs/pricing-fx",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.billingPricingFx.max,
        RATE_LIMITS.billingPricingFx.timeWindowMs,
      ),
    },
    async (_request, reply) => {
      return reply.send(await getCreditPackPricingFxQuote());
    },
  );
  /**
   * One-time prepaid credit packs. New purchases are Flitt-only (`provider=flitt`).
   * Client may send packageId (+ optional clientRequestId) only.
   */
  app.post(
    "/api/billing/credit-packs/checkout",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.billingCheckout.max,
        RATE_LIMITS.billingCheckout.timeWindowMs,
      ),
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = createCreditPackCheckoutSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        assertCheckoutAvailableOrThrow();
        const result = await createCreditPackCheckout(request.userId!, parsed.data);
        return reply.send({
          purchaseId: result.purchaseId,
          status: result.status,
          approvalUrl: result.approvalUrl,
        });
      } catch (error) {
        return sendAppError(reply, normalizeBillingError(error));
      }
    },
  );

  /** UX poll after browser returnUrl — never grants credits. */
  app.get(
    "/api/billing/purchases/:purchaseId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const purchaseId = (request.params as { purchaseId: string }).purchaseId;

      try {
        const purchase = await getCreditPackPurchaseStatusOnly(request.userId!, purchaseId);
        return reply.send(purchase);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  /**
   * LEGACY ONLY. No new TBC purchases are created.
   * Kept for historical CreditPackPurchase.provider=tbc rows.
   * Looks up by provider=tbc + providerPaymentId; never attaches or grants
   * to a non-TBC purchase. Body alone is not payment proof —
   * handler always GETs payment details before any grant.
   * @deprecated
   */
  app.post("/api/billing/tbc/callback", async (request, reply) => {
    const parsed = tbcCallbackBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const sourceIp =
        typeof request.headers["x-forwarded-for"] === "string"
          ? request.headers["x-forwarded-for"].split(",")[0]?.trim()
          : request.ip;

      const result = await handleTbcCallback(parsed.data.PaymentId, { sourceIp });
      return reply.status(200).send(result);
    } catch (error) {
      return sendAppError(reply, normalizeBillingError(error));
    }
  });

  /**
   * Flitt host-to-host callback. Signature is verified before any field is trusted.
   * Browser return URL is never payment proof. HTTP 200 stops Flitt retries.
   */
  app.post("/api/billing/flitt/callback", async (request, reply) => {
    const parsed = flittCallbackBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const sourceIp =
        typeof request.headers["x-forwarded-for"] === "string"
          ? request.headers["x-forwarded-for"].split(",")[0]?.trim()
          : request.ip;

      const result = await handleFlittCallback(parsed.data, { sourceIp });
      return reply.status(200).send(result);
    } catch (error) {
      return sendAppError(reply, normalizeBillingError(error));
    }
  });
}
