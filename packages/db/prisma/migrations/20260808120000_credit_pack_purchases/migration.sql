-- Additive: one-time prepaid credit pack purchases (TBC Checkout Stage 1).
-- Does not alter Stripe Subscription / CreditTransaction columns.

CREATE TABLE "credit_pack_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'tbc',
    "package_id" TEXT NOT NULL,
    "price_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "credits_amount" INTEGER NOT NULL,
    "merchant_payment_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "provider_status" TEXT,
    "approval_url" TEXT,
    "client_request_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "credited_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_pack_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_pack_purchases_merchant_payment_id_key"
  ON "credit_pack_purchases"("merchant_payment_id");

CREATE UNIQUE INDEX "credit_pack_purchases_user_id_client_request_id_key"
  ON "credit_pack_purchases"("user_id", "client_request_id");

CREATE UNIQUE INDEX "credit_pack_purchases_provider_provider_payment_id_key"
  ON "credit_pack_purchases"("provider", "provider_payment_id");

CREATE INDEX "credit_pack_purchases_user_id_created_at_idx"
  ON "credit_pack_purchases"("user_id", "created_at" DESC);

CREATE INDEX "credit_pack_purchases_status_updated_at_idx"
  ON "credit_pack_purchases"("status", "updated_at");

ALTER TABLE "credit_pack_purchases"
  ADD CONSTRAINT "credit_pack_purchases_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
