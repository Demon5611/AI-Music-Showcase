-- Monetary refund requests for credit pack purchases (TBC).
-- Separate from ledger credit refunds.

CREATE TABLE "refund_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "reject_reason" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'tbc',
    "provider_refund_id" TEXT,
    "provider_reference" TEXT,
    "provider_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refund_requests_user_id_created_at_idx"
  ON "refund_requests"("user_id", "created_at" DESC);

CREATE INDEX "refund_requests_payment_id_status_idx"
  ON "refund_requests"("payment_id", "status");

CREATE INDEX "refund_requests_status_updated_at_idx"
  ON "refund_requests"("status", "updated_at");

ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "credit_pack_purchases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
