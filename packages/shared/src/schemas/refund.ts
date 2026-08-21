import { z } from "zod";
import { CASH_REFUND_SCOPES } from "../constants/cash-refund.js";

export const createRefundRequestSchema = z
  .object({
    paymentId: z.string().min(1).optional(),
    reason: z.string().trim().min(3).max(1000),
    scope: z.enum(CASH_REFUND_SCOPES).optional(),
    /** Exact CreditTransaction.id of type=spend for scope=operation. */
    sourceSpendLedgerEntryId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const scope =
      data.scope ??
      (data.sourceSpendLedgerEntryId ? "operation" : "purchase_remainder");

    if (scope === "purchase_remainder") {
      if (!data.paymentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paymentId"],
          message: "paymentId is required for purchase_remainder refund",
        });
      }
      if (data.sourceSpendLedgerEntryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceSpendLedgerEntryId"],
          message: "sourceSpendLedgerEntryId is only valid for operation refund",
        });
      }
    }

    if (scope === "operation") {
      if (!data.sourceSpendLedgerEntryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceSpendLedgerEntryId"],
          message: "sourceSpendLedgerEntryId is required for operation refund",
        });
      }
    }
  });

export type CreateRefundRequestInput = z.infer<typeof createRefundRequestSchema>;

export const approveRefundRequestSchema = z
  .object({
    mode: z.enum(["full", "partial"]).optional(),
    amount: z.number().positive().finite().optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.mode ?? (data.amount !== undefined ? "partial" : "full");

    if (mode === "partial" && data.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "amount is required for partial refund",
      });
    }

    if (mode === "full" && data.amount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "amount must not be set for full refund",
      });
    }
  });

export type ApproveRefundRequestInput = z.infer<typeof approveRefundRequestSchema>;

export const rejectRefundRequestSchema = z.object({
  reason: z.string().trim().min(3).max(1000).optional(),
});

export type RejectRefundRequestInput = z.infer<typeof rejectRefundRequestSchema>;
