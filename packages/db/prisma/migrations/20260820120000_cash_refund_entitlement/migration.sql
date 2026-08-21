-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'purchase_remainder';

-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN "cash_refund_credit_units" INTEGER;

-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN "source_spend_ledger_entry_id" TEXT;

-- AlterTable
ALTER TABLE "credit_grant_lot_allocations" ADD COLUMN "cash_refund_request_id" TEXT;

-- CreateIndex
CREATE INDEX "refund_requests_source_spend_ledger_entry_id_idx" ON "refund_requests"("source_spend_ledger_entry_id");

-- CreateIndex
CREATE INDEX "credit_grant_lot_allocations_cash_refund_request_id_idx" ON "credit_grant_lot_allocations"("cash_refund_request_id");
