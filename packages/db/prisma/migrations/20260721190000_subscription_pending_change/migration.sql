-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "pending_plan_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "pending_checkout_session_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "pending_change_status" TEXT;
