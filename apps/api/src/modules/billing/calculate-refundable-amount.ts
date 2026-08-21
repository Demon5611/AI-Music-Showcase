import { Prisma, prisma } from "@ai-music/db";
import { REFUND_MONEY_COUNTED_STATUSES } from "@ai-music/shared";
import { BadRequestError, NotFoundError } from "../../common/errors.js";

/**
 * Statuses that allow creating/approving a *new* monetary refund.
 * Fully refunded purchases must stay excluded — eligibility only.
 */
const REFUNDABLE_PURCHASE_STATUSES = new Set([
  "credited",
  "paid",
  "partial_refunded",
]);

export type RefundableAmountResult = {
  paymentId: string;
  currency: string;
  originalPaidAmount: number;
  alreadyRefundedAmount: number;
  remainingRefundableAmount: number;
  purchaseStatus: string;
  provider: string;
  providerPaymentId: string | null;
};

type PurchaseRow = {
  id: string;
  currency: string;
  priceAmount: Prisma.Decimal | number | string;
  status: string;
  provider: string;
  providerPaymentId: string | null;
};

function toMoneyNumber(value: Prisma.Decimal | number | string): number {
  return Number(value);
}

async function loadPurchaseOrThrow(
  paymentId: string,
  db: typeof prisma,
): Promise<PurchaseRow> {
  const purchase = await db.creditPackPurchase.findUnique({
    where: { id: paymentId },
  });

  if (!purchase) {
    throw new NotFoundError("Purchase not found");
  }

  return purchase;
}

async function buildRefundableAmountSnapshot(
  purchase: PurchaseRow,
  db: typeof prisma,
): Promise<RefundableAmountResult> {
  const originalPaidAmount = toMoneyNumber(purchase.priceAmount);

  const aggregated = await db.refundRequest.aggregate({
    where: {
      paymentId: purchase.id,
      status: { in: [...REFUND_MONEY_COUNTED_STATUSES] },
    },
    _sum: { amount: true },
  });

  const alreadyRefundedAmount = toMoneyNumber(aggregated._sum.amount ?? 0);
  const remainingRefundableAmount = Math.max(
    0,
    roundMoney(originalPaidAmount - alreadyRefundedAmount),
  );

  return {
    paymentId: purchase.id,
    currency: purchase.currency,
    originalPaidAmount,
    alreadyRefundedAmount,
    remainingRefundableAmount,
    purchaseStatus: purchase.status,
    provider: purchase.provider,
    providerPaymentId: purchase.providerPaymentId,
  };
}

/**
 * Server-side max monetary refund for a CreditPackPurchase (eligibility).
 * Rejects fully refunded / non-refundable statuses — used by create/approve.
 * Does NOT subtract used credits — that is an admin policy decision.
 */
export async function calculateRefundableAmount(
  paymentId: string,
  options?: { prismaClient?: typeof prisma },
): Promise<RefundableAmountResult> {
  const db = options?.prismaClient ?? prisma;
  const purchase = await loadPurchaseOrThrow(paymentId, db);

  if (!REFUNDABLE_PURCHASE_STATUSES.has(purchase.status)) {
    throw new BadRequestError(
      "Purchase is not refundable in its current status",
      "PURCHASE_NOT_REFUNDABLE",
    );
  }

  return buildRefundableAmountSnapshot(purchase, db);
}

/**
 * Admin read-only refundable snapshot.
 * Includes terminal `refunded` purchases (remaining=0) so GET does not 400.
 * Must NOT be used for create/approve eligibility.
 */
export async function getAdminRefundableAmountSnapshot(
  paymentId: string,
  options?: { prismaClient?: typeof prisma },
): Promise<RefundableAmountResult> {
  const db = options?.prismaClient ?? prisma;
  const purchase = await loadPurchaseOrThrow(paymentId, db);
  return buildRefundableAmountSnapshot(purchase, db);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function assertRefundAmountAllowed(
  amount: number,
  remainingRefundableAmount: number,
): void {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    throw new BadRequestError("Refund amount must be greater than 0", "INVALID_REFUND_AMOUNT");
  }

  if (amount > remainingRefundableAmount + 1e-9) {
    throw new BadRequestError(
      "Refund amount exceeds remaining refundable amount",
      "REFUND_AMOUNT_EXCEEDS_REMAINING",
    );
  }
}
