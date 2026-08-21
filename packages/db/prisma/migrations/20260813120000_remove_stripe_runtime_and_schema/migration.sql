-- Remove Stripe-only columns from current schema.
-- Historical migrations are immutable and still describe the old columns.
-- Showcase note: operational production evidence comments were removed.

DROP INDEX "credit_transactions_stripe_payment_id_key";
ALTER TABLE "credit_transactions" DROP COLUMN "stripe_payment_id";

DROP INDEX "subscriptions_stripe_subscription_id_key";
ALTER TABLE "subscriptions" DROP COLUMN "stripe_customer_id";
ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_id";
ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_schedule_id";
ALTER TABLE "subscriptions" DROP COLUMN "current_period_end";
ALTER TABLE "subscriptions" DROP COLUMN "pending_plan_id";
ALTER TABLE "subscriptions" DROP COLUMN "pending_checkout_session_id";
ALTER TABLE "subscriptions" DROP COLUMN "pending_change_status";
