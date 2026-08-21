import {
  prisma,
  type CreditPackPurchase,
  grantCreditsInTransaction,
} from "@ai-music/db";
import {
  FLITT_PAYMENT_PROVIDER,
  buildFlittCreditGrantIdempotencyKey,
  creditsToUnits,
} from "@ai-music/shared";
import {
  FlittCheckoutClient,
  FlittCheckoutError,
  assertFlittCheckoutEnabled,
  mapFlittOrderStatus,
  readFlittCallbackOrderId,
  readFlittCallbackPaymentId,
  unwrapFlittSignableObject,
  verifyFlittPaymentAgainstPurchase,
  verifyFlittSignature,
  type FlittCheckoutRuntimeConfig,
} from "./providers/flitt.js";

export type FlittCallbackResult = {
  ok: true;
  purchaseId?: string;
  status?: string;
  credited?: boolean;
  ignored?: boolean;
  reason?: string;
};

export type FlittFulfillmentDeps = {
  prismaClient?: typeof prisma;
  createClient?: (config: FlittCheckoutRuntimeConfig) => FlittCheckoutClient;
  log?: (payload: Record<string, unknown>) => void;
};

function defaultLog(payload: Record<string, unknown>): void {
  console.info(JSON.stringify(payload));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function unwrapFlittCallbackPayload(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) {
    return null;
  }
  return unwrapFlittSignableObject(root);
}

function safeCallbackLogFields(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    orderId: readFlittCallbackOrderId(payload),
    paymentId: readFlittCallbackPaymentId(payload),
    orderStatus:
      typeof payload.order_status === "string" ? payload.order_status : undefined,
    merchantId:
      typeof payload.merchant_id === "number" || typeof payload.merchant_id === "string"
        ? String(payload.merchant_id)
        : undefined,
  };
}

export async function handleFlittCallback(
  body: unknown,
  options: FlittFulfillmentDeps & { sourceIp?: string } = {},
): Promise<FlittCallbackResult> {
  const log = options.log ?? defaultLog;
  const db = options.prismaClient ?? prisma;
  const payload = unwrapFlittCallbackPayload(body);

  if (!payload) {
    throw new FlittCheckoutError("Flitt callback body is invalid", "validation", {
      code: "FLITT_CALLBACK_INVALID",
    });
  }

  const config = assertFlittCheckoutEnabled();

  if (!verifyFlittSignature(config.paymentKey, payload)) {
    log({
      event: "flitt_callback_signature_invalid",
      provider: FLITT_PAYMENT_PROVIDER,
      ...safeCallbackLogFields(payload),
    });
    throw new FlittCheckoutError("Invalid Flitt callback signature", "validation", {
      code: "FLITT_CALLBACK_SIGNATURE_INVALID",
    });
  }

  if (options.sourceIp) {
    log({
      event: "flitt_callback_received",
      provider: FLITT_PAYMENT_PROVIDER,
      sourceIp: options.sourceIp,
      ...safeCallbackLogFields(payload),
    });
  }

  const orderId = readFlittCallbackOrderId(payload);
  const paymentId = readFlittCallbackPaymentId(payload);

  let purchase: CreditPackPurchase | null = null;
  if (orderId) {
    purchase = await db.creditPackPurchase.findFirst({
      where: {
        provider: FLITT_PAYMENT_PROVIDER,
        merchantPaymentId: orderId,
      },
    });
  }

  if (!purchase && paymentId) {
    purchase = await db.creditPackPurchase.findFirst({
      where: {
        provider: FLITT_PAYMENT_PROVIDER,
        providerPaymentId: paymentId,
      },
    });
  }

  if (!purchase) {
    log({
      event: "flitt_callback_unknown_purchase",
      provider: FLITT_PAYMENT_PROVIDER,
      ...safeCallbackLogFields(payload),
    });
    return { ok: true, ignored: true, reason: "unknown_order_id" };
  }

  return processFlittPurchasePayment(purchase.id, options);
}

export async function reconcileFlittPurchase(
  purchaseId: string,
  options: FlittFulfillmentDeps = {},
): Promise<FlittCallbackResult> {
  return processFlittPurchasePayment(purchaseId, options);
}

async function processFlittPurchasePayment(
  purchaseId: string,
  options: FlittFulfillmentDeps = {},
): Promise<FlittCallbackResult> {
  const log = options.log ?? defaultLog;
  const db = options.prismaClient ?? prisma;
  const config = assertFlittCheckoutEnabled();
  const client =
    options.createClient?.(config) ??
    new FlittCheckoutClient({ config });

  const purchase = await db.creditPackPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    return { ok: true, ignored: true, reason: "purchase_not_found" };
  }

  if (purchase.provider !== FLITT_PAYMENT_PROVIDER) {
    return { ok: true, ignored: true, reason: "provider_mismatch" };
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

  if (!purchase.merchantPaymentId) {
    log({
      event: "flitt_payment_missing_order_id",
      provider: FLITT_PAYMENT_PROVIDER,
      purchaseId: purchase.id,
      packageId: purchase.packageId,
    });
    return {
      ok: true,
      purchaseId: purchase.id,
      ignored: true,
      reason: "missing_merchant_order_id",
    };
  }

  const payment = await client.getOrderStatus(purchase.merchantPaymentId);
  return applyFetchedFlittPayment(purchase, payment, config, { db, log });
}

export async function applyFetchedFlittPayment(
  purchase: CreditPackPurchase,
  payment: {
    paymentId: string;
    orderId: string;
    merchantId: string;
    amountMinor: number;
    actualAmountMinor: number | null;
    currency: string;
    orderStatus: string;
  },
  config: Pick<FlittCheckoutRuntimeConfig, "merchantId">,
  ctx: {
    db: typeof prisma;
    log: (payload: Record<string, unknown>) => void;
  },
): Promise<FlittCallbackResult> {
  const mapped = mapFlittOrderStatus(payment.orderStatus);

  await ctx.db.creditPackPurchase.update({
    where: { id: purchase.id },
    data: {
      providerStatus: payment.orderStatus,
      ...(purchase.providerPaymentId ? {} : { providerPaymentId: payment.paymentId }),
    },
  });

  if (!mapped.mayGrantCredits) {
    if (mapped.domainStatus) {
      await ctx.db.creditPackPurchase.update({
        where: { id: purchase.id },
        data: {
          status: mapped.domainStatus,
          ...(mapped.domainStatus === "failed" || mapped.domainStatus === "expired"
            ? {
                failureCode: `FLITT_${payment.orderStatus.toUpperCase()}`,
                failureMessage: `Provider status ${payment.orderStatus}`,
              }
            : {}),
        },
      });
    } else if (!mapped.known) {
      ctx.log({
        event: "flitt_unknown_provider_status",
        provider: FLITT_PAYMENT_PROVIDER,
        purchaseId: purchase.id,
        paymentId: payment.paymentId,
        packageId: purchase.packageId,
        providerStatus: payment.orderStatus,
      });
    }

    return {
      ok: true,
      purchaseId: purchase.id,
      status: mapped.domainStatus ?? purchase.status,
      credited: false,
      reason: mapped.known
        ? `provider_${payment.orderStatus.toLowerCase()}`
        : "unknown_provider_status",
    };
  }

  const verification = verifyFlittPaymentAgainstPurchase(purchase, payment, config);
  if (!verification.ok) {
    ctx.log({
      event: "flitt_payment_verification_failed",
      provider: FLITT_PAYMENT_PROVIDER,
      purchaseId: purchase.id,
      paymentId: payment.paymentId,
      packageId: purchase.packageId,
      reason: verification.reason,
      expectedAmount: verification.expected.amountMinor,
      expectedCurrency: verification.expected.currency,
      actualAmount: verification.actual.amountMinor,
      actualCurrency: verification.actual.currency,
    });

    await ctx.db.creditPackPurchase.update({
      where: { id: purchase.id },
      data: {
        status: "verification_failed",
        providerStatus: payment.orderStatus,
        failureCode: `FLITT_VERIFY_${verification.reason.toUpperCase()}`,
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

  const grantResult = await grantVerifiedFlittPurchaseCredits(purchase, payment, ctx.db);

  return {
    ok: true,
    purchaseId: purchase.id,
    status: grantResult.status,
    credited: grantResult.credited,
  };
}

export async function grantVerifiedFlittPurchaseCredits(
  purchase: CreditPackPurchase,
  payment: { paymentId: string; orderStatus: string },
  db: typeof prisma,
): Promise<{ status: string; credited: boolean }> {
  const payId = purchase.providerPaymentId ?? payment.paymentId;
  const idempotencyKey = buildFlittCreditGrantIdempotencyKey(payId);
  const amountUnits = creditsToUnits(purchase.creditsAmount);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT id FROM credit_pack_purchases WHERE id = ${purchase.id} FOR UPDATE
    `;

    const locked = await tx.creditPackPurchase.findUniqueOrThrow({
      where: { id: purchase.id },
    });

    if (locked.status === "credited" && locked.creditedAt) {
      return { status: locked.status, credited: false };
    }

    await grantCreditsInTransaction(
      {
        userId: locked.userId,
        amountUnits,
        reason: `flitt_credit_pack:${locked.packageId}:${locked.id}`,
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
        providerPaymentId: locked.providerPaymentId ?? payment.paymentId,
        providerStatus: payment.orderStatus,
        paidAt: locked.paidAt ?? new Date(),
        creditedAt: locked.creditedAt ?? new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });

    return { status: updated.status, credited: true };
  });
}
