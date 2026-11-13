import {
  prisma,
  type CreditPackPurchase,
  grantCreditsInTransaction,
} from "@ai-music/db";
import {
  LEGACYGATEWAY_PAYMENT_PROVIDER,
  buildLegacygatewayCreditGrantIdempotencyKey,
  creditsToUnits,
} from "@ai-music/shared";
import { NotFoundError } from "../../common/errors.js";
import {
  LegacygatewayCheckoutClient,
  assertLegacygatewayCheckoutEnabled,
  mapLegacygatewayProviderStatus,
  verifyLegacygatewayPaymentAgainstPurchase,
  type LegacygatewayPaymentDetails,
} from "./providers/integration.example.invalid";

export type LegacygatewayCallbackResult = {
  ok: true;
  purchaseId?: string;
  status?: string;
  credited?: boolean;
  ignored?: boolean;
  reason?: string;
};

export type LegacygatewayFulfillmentDeps = {
  prismaClient?: typeof prisma;
  createClient?: () => LegacygatewayCheckoutClient;
  log?: (payload: Record<string, unknown>) => void;
};

function defaultLog(payload: Record<string, unknown>): void {
  console.info(JSON.stringify(payload));
}

export async function handleLegacygatewayCallback(
  paymentId: string,
  options: LegacygatewayFulfillmentDeps & { sourceIp?: string } = {},
): Promise<LegacygatewayCallbackResult> {
  // Legacy only: lookup is scoped to provider=legacygateway. Never grants to Checkoutgateway/other rows.
  const log = options.log ?? defaultLog;
  const db = options.prismaClient ?? prisma;

  if (options.sourceIp) {
    log({
      event: "legacygateway_callback_received",
      provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
      payId: paymentId,
      sourceIp: options.sourceIp,
    });
  }

  const purchase = await db.creditPackPurchase.findFirst({
    where: {
      provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
      providerPaymentId: paymentId,
    },
  });

  if (!purchase) {
    log({
      event: "legacygateway_callback_unknown_payment",
      provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
      payId: paymentId,
    });
    return { ok: true, ignored: true, reason: "unknown_payment_id" };
  }

  return processLegacygatewayPurchasePayment(purchase.id, options);
}

export async function reconcileLegacygatewayPurchase(
  purchaseId: string,
  options: LegacygatewayFulfillmentDeps = {},
): Promise<LegacygatewayCallbackResult> {
  return processLegacygatewayPurchasePayment(purchaseId, options);
}

async function processLegacygatewayPurchasePayment(
  purchaseId: string,
  options: LegacygatewayFulfillmentDeps = {},
): Promise<LegacygatewayCallbackResult> {
  const log = options.log ?? defaultLog;
  const db = options.prismaClient ?? prisma;

  const purchase = await db.creditPackPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    throw new NotFoundError("Purchase not found");
  }

  if (purchase.provider !== LEGACYGATEWAY_PAYMENT_PROVIDER) {
    log({
      event: "legacygateway_fulfillment_provider_mismatch",
      provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
      purchaseId: purchase.id,
      storedProvider: purchase.provider,
    });
    return {
      ok: true,
      purchaseId: purchase.id,
      ignored: true,
      reason: "provider_mismatch",
    };
  }

  if (purchase.status === "credited" && purchase.creditedAt) {
    return {
      ok: true,
      purchaseId: purchase.id,
      status: purchase.status,
      credited: false,
      ignored: true,
      reason: "already_credited",
    };
  }

  const config = assertLegacygatewayCheckoutEnabled();
  const client = (options.createClient ?? (() => new LegacygatewayCheckoutClient({ config })))();

  if (!purchase.providerPaymentId) {
    log({
      event: "legacygateway_payment_missing_provider_id",
      provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
      purchaseId: purchase.id,
      packageId: purchase.packageId,
    });
    return {
      ok: true,
      purchaseId: purchase.id,
      ignored: true,
      reason: "missing_provider_payment_id",
    };
  }

  const payment = await client.getPayment(purchase.providerPaymentId);
  return applyFetchedLegacygatewayPayment(purchase, payment, { db, log });
}

export async function applyFetchedLegacygatewayPayment(
  purchase: CreditPackPurchase,
  payment: LegacygatewayPaymentDetails,
  ctx: {
    db: typeof prisma;
    log: (payload: Record<string, unknown>) => void;
  },
): Promise<LegacygatewayCallbackResult> {
  if (purchase.provider !== LEGACYGATEWAY_PAYMENT_PROVIDER) {
    ctx.log({
      event: "legacygateway_fulfillment_provider_mismatch",
      provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
      purchaseId: purchase.id,
      storedProvider: purchase.provider,
    });
    return {
      ok: true,
      purchaseId: purchase.id,
      credited: false,
      ignored: true,
      reason: "provider_mismatch",
    };
  }

  const mapped = mapLegacygatewayProviderStatus(payment.status);

  await ctx.db.creditPackPurchase.update({
    where: { id: purchase.id },
    data: { providerStatus: payment.status },
  });

  if (!mapped.mayGrantCredits) {
    if (mapped.domainStatus) {
      await ctx.db.creditPackPurchase.update({
        where: { id: purchase.id },
        data: {
          status: mapped.domainStatus,
          ...(mapped.domainStatus === "failed" || mapped.domainStatus === "expired"
            ? {
                failureCode: `LEGACYGATEWAY_${payment.status.toUpperCase()}`,
                failureMessage: `Provider status ${payment.status}`,
              }
            : {}),
        },
      });
    } else if (!mapped.known) {
      ctx.log({
        event: "legacygateway_unknown_provider_status",
        provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
        purchaseId: purchase.id,
        payId: payment.payId,
        packageId: purchase.packageId,
        providerStatus: payment.status,
      });
    }

    return {
      ok: true,
      purchaseId: purchase.id,
      status: mapped.domainStatus ?? purchase.status,
      credited: false,
      reason: mapped.known
        ? `provider_${payment.status.toLowerCase()}`
        : "unknown_provider_status",
    };
  }

  const verification = verifyLegacygatewayPaymentAgainstPurchase(purchase, payment);
  if (!verification.ok) {
    ctx.log({
      event: "legacygateway_payment_verification_failed",
      provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
      purchaseId: purchase.id,
      payId: payment.payId,
      packageId: purchase.packageId,
      reason: verification.reason,
      expectedAmount: verification.expected.amount,
      expectedCurrency: verification.expected.currency,
      actualAmount: verification.actual.amount,
      actualCurrency: verification.actual.currency,
    });

    await ctx.db.creditPackPurchase.update({
      where: { id: purchase.id },
      data: {
        status: "verification_failed",
        providerStatus: payment.status,
        failureCode: `LEGACYGATEWAY_VERIFY_${verification.reason.toUpperCase()}`,
        failureMessage: "Payment verification failed",
      },
    });

    return {
      ok: true,
      purchaseId: purchase.id,
      status: "verification_failed",
      credited: false,
      reason: verification.reason,
    };
  }

  const grantResult = await grantVerifiedLegacygatewayPurchaseCredits(purchase, payment, ctx.db);

  return {
    ok: true,
    purchaseId: purchase.id,
    status: grantResult.status,
    credited: grantResult.credited,
  };
}

/**
 * Exactly-once grant: row lock + ledger unique idempotencyKey.
 */
export async function grantVerifiedLegacygatewayPurchaseCredits(
  purchase: CreditPackPurchase,
  payment: LegacygatewayPaymentDetails,
  db: typeof prisma,
): Promise<{ status: string; credited: boolean }> {
  const payId = purchase.providerPaymentId!;
  const idempotencyKey = buildLegacygatewayCreditGrantIdempotencyKey(payId);
  const amountUnits = creditsToUnits(purchase.creditsAmount);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT id FROM credit_pack_purchases WHERE id = ${purchase.id} FOR UPDATE
    `;

    const locked = await tx.creditPackPurchase.findUniqueOrThrow({
      where: { id: purchase.id },
    });

    if (locked.provider !== LEGACYGATEWAY_PAYMENT_PROVIDER) {
      return { status: locked.status, credited: false };
    }

    if (locked.status === "credited" && locked.creditedAt) {
      return { status: locked.status, credited: false };
    }

    await grantCreditsInTransaction(
      {
        userId: locked.userId,
        amountUnits,
        reason: `legacygateway_credit_pack:${locked.packageId}:${locked.id}`,
        idempotencyKey,
        relatedEntityType: "credit_pack_purchase",
        relatedEntityId: locked.id,
      },
      tx,
    );

    const updated = await tx.creditPackPurchase.update({
      where: { id: locked.id },
      data: {
        status: "credited",
        providerStatus: payment.status,
        paidAt: locked.paidAt ?? new Date(),
        creditedAt: locked.creditedAt ?? new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });

    return { status: updated.status, credited: true };
  });
}
