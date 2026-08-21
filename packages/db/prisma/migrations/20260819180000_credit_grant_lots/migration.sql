-- Additive FIFO grant lots for credit-pack refund eligibility.
-- Existing ledger rows are unchanged; lots are created for new grants.

CREATE TABLE "credit_grant_lots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_purchase_id" TEXT,
    "source_ledger_entry_id" TEXT NOT NULL,
    "grant_amount_units" INTEGER NOT NULL,
    "remaining_amount_units" INTEGER NOT NULL,
    "reserved_amount_units" INTEGER NOT NULL DEFAULT 0,
    "reserved_refund_request_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_grant_lots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_grant_lots_source_ledger_entry_id_key" ON "credit_grant_lots"("source_ledger_entry_id");
CREATE UNIQUE INDEX "credit_grant_lots_reserved_refund_request_id_key" ON "credit_grant_lots"("reserved_refund_request_id");
CREATE INDEX "credit_grant_lots_user_id_created_at_idx" ON "credit_grant_lots"("user_id", "created_at");
CREATE INDEX "credit_grant_lots_source_purchase_id_idx" ON "credit_grant_lots"("source_purchase_id");

ALTER TABLE "credit_grant_lots" ADD CONSTRAINT "credit_grant_lots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_grant_lots" ADD CONSTRAINT "credit_grant_lots_source_purchase_id_fkey" FOREIGN KEY ("source_purchase_id") REFERENCES "credit_pack_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "credit_grant_lot_allocations" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "spend_ledger_entry_id" TEXT NOT NULL,
    "amount_units" INTEGER NOT NULL,
    "restored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_grant_lot_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_grant_lot_allocations_spend_ledger_entry_id_lot_id_key" ON "credit_grant_lot_allocations"("spend_ledger_entry_id", "lot_id");
CREATE INDEX "credit_grant_lot_allocations_spend_ledger_entry_id_idx" ON "credit_grant_lot_allocations"("spend_ledger_entry_id");

ALTER TABLE "credit_grant_lot_allocations" ADD CONSTRAINT "credit_grant_lot_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "credit_grant_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
