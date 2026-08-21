-- Snapshot USD SoT + USD→GEL FX used at Flitt checkout.
-- price_amount/currency remain the charged amount (GEL for Flitt).

ALTER TABLE "credit_pack_purchases"
  ADD COLUMN "base_price_amount" DECIMAL(12,2),
  ADD COLUMN "base_currency" TEXT,
  ADD COLUMN "fx_rate" DECIMAL(18,8),
  ADD COLUMN "fx_quoted_at" TIMESTAMP(3),
  ADD COLUMN "fx_source" TEXT;
