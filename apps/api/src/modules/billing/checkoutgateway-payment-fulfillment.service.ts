import {
  prisma,
  type CreditPackPurchase,
  grantCreditsInTransaction,
} from "@ai-music/db";
import {
  CHECKOUTGATEWAY_PAYMENT_PROVIDER,
  buildCheckoutgatewayCreditGrantIdempotencyKey,
  creditsToUnits,
} from "@ai-music/shared";
import {
  CheckoutgatewayCheckoutClient,
  CheckoutgatewayCheckoutError,
  assertCheckoutgatewayCheckoutEnabled,
  mapCheckoutgatewayOrderStatus,
  readCheckoutgatewayCallbackOrderId,
  readCheckoutgatewayCallbackPaymentId,
  unwrapCheckoutgatewaySignableObject,
  verifyCheckoutgatewayPaymentAgainstPurchase,
  verifyCheckoutgatewaySignature,
  type CheckoutgatewayCheckoutRuntimeConfig,
} from "./providers/checkoutgateway.js";

export type CheckoutgatewayCallbackResult = {
  ok: true;
  purchaseId?: string;
  status?: string;
  credited?: boolean;
  ignored?: boolean;
  reason?: string;
};

export type CheckoutgatewayFulfillmentDeps = {
  prismaClient?: typeof prisma;
  createClient?: (config: CheckoutgatewayCheckoutRuntimeConfig) => CheckoutgatewayCheckoutClient;
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

export function unwrapCheckoutgatewayCallbackPayload(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) {
    return null;
  }
  return unwrapCheckoutgatewaySignableObject(root);
}

function safeCallbackLogFields(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    orderId: readCheckoutgatewayCallbackOrderId(payload),
    paymentId: readCheckoutgatewayCallbackPaymentId(payload),
    orderStatus:
      typeof payload.order_status === "string" ? payload.order_status : undefined,
    merchantId:
      typeof payload.merchant_id === "number" || typeof payload.merchant_id === "string"
        ? String(payload.merchant_id)
        : undefined,
  };
}

export async function handleCheckoutgatewayCallback(
  body: unknown,
  options: CheckoutgatewayFulfillmentDeps & { sourceIp?: string } = {},
): Promise<CheckoutgatewayCallbackResult> {
  const log = options.log ?? defaultLog;
  const db = options.prismaClient ?? prisma;
  const payload = unwrapCheckoutgatewayCallbackPayload(body);

  if (!payload) {
    throw new CheckoutgatewayCheckoutError("Checkoutgateway callback body is invalid", "validation", {
      code: "CHECKOUTGATEWAY_CALLBACK_INVALID",
    });
  }

  const config = assertCheckoutgatewayCheckoutEnabled();

  if (!verifyCheckoutgatewaySignature(config.paymentKey, payload)) {
    log({
      event: "checkoutgateway_callback_signature_invalid",
      provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
      ...safeCallbackLogFields(payload),
    });
    throw new CheckoutgatewayCheckoutError("Invalid Checkoutgateway callback signature", "validation", {
      code: "CHECKOUTGATEWAY_CALLBACK_SIGNATURE_INVALID",
    });
  }

  if (options.sourceIp) {
    log({
      event: "checkoutgateway_callback_received",
      provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
      sourceIp: options.sourceIp,
      ...safeCallbackLogFields(payload),
    });
  }

  const orderId = readCheckoutgatewayCallbackOrderId(payload);
  const paymentId = readCheckoutgatewayCallbackPaymentId(payload);

  let purchase: CreditPackPurchase | null = null;
  if (orderId) {
    purchase = await db.creditPackPurchase.findFirst({
      where: {
        provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
        merchantPaymentId: orderId,
      },
    });
  }

  if (!purchase && paymentId) {
    purchase = await db.creditPackPurchase.findFirst({
      where: {
        provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
        providerPaymentId: paymentId,
      },
    });
  }

  if (!purchase) {
    log({
      event: "checkoutgateway_callback_unknown_purchase",
      provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
      ...safeCallbackLogFields(payload),
    });
    return { ok: true, ignored: true, reason: "unknown_order_id" };
  }

  return processCheckoutgatewayPurchasePayment(purchase.id, options);
}

export async function reconcileCheckoutgatewayPurchase(
  purchaseId: string,
  options: CheckoutgatewayFulfillmentDeps = {},
): Promise<CheckoutgatewayCallbackResult> {
  return processCheckoutgatewayPurchasePayment(purchaseId, options);
}

async function processCheckoutgatewayPurchasePayment(
  purchaseId: string,
  options: CheckoutgatewayFulfillmentDeps = {},
): Promise<CheckoutgatewayCallbackResult> {
  const log = options.log ?? defaultLog;
  const db = options.prismaClient ?? prisma;
  const config = assertCheckoutgatewayCheckoutEnabled();
  const client =
    options.createClient?.(config) ??
    new CheckoutgatewayCheckoutClient({ config });

  const purchase = await db.creditPackPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    return { ok: true, ignored: true, reason: "purchase_not_found" };
  }

  if (purchase.provider !== CHECKOUTGATEWAY_PAYMENT_PROVIDER) {
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
      event: "checkoutgateway_payment_missing_order_id",
      provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
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
  return applyFetchedCheckoutgatewayPayment(purchase, payment, config, { db, log });
}

export async function applyFetchedCheckoutgatewayPayment(
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
  config: Pick<CheckoutgatewayCheckoutRuntimeConfig, "merchantId">,
  ctx: {
    db: typeof prisma;
    log: (payload: Record<string, unknown>) => void;
  },
): Promise<CheckoutgatewayCallbackResult> {
  const mapped = mapCheckoutgatewayOrderStatus(payment.orderStatus);

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
                failureCode: `CHECKOUTGATEWAY_${payment.orderStatus.toUpperCase()}`,
                failureMessage: `Provider status ${payment.orderStatus}`,
              }
            : {}),
        },
      });
    } else if (!mapped.known) {
      ctx.log({
        event: "checkoutgateway_unknown_provider_status",
        provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
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

  const verification = verifyCheckoutgatewayPaymentAgainstPurchase(purchase, payment, config);
  if (!verification.ok) {
    ctx.log({
      event: "checkoutgateway_payment_verification_failed",
      provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
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
        failureCode: `CHECKOUTGATEWAY_VERIFY_${verification.reason.toUpperCase()}`,
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

  const grantResult = await grantVerifiedCheckoutgatewayPurchaseCredits(purchase, payment, ctx.db);

  return {
    ok: true,
    purchaseId: purchase.id,
    status: grantResult.status,
    credited: grantResult.credited,
  };
}

export async function grantVerifiedCheckoutgatewayPurchaseCredits(
  purchase: CreditPackPurchase,
  payment: { paymentId: string; orderStatus: string },
  db: typeof prisma,
): Promise<{ status: string; credited: boolean }> {
  const payId = purchase.providerPaymentId ?? payment.paymentId;
  const idempotencyKey = buildCheckoutgatewayCreditGrantIdempotencyKey(payId);
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
        reason: `checkoutgateway_credit_pack:${locked.packageId}:${locked.id}`,
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
