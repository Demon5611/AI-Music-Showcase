-- Additive: account deletion lifecycle (independent from VoiceProfile disable).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "account_deletion_status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "account_deletion_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "account_deletion_finalized_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_account_deletion_status_updated_at_idx"
  ON "users"("account_deletion_status", "updated_at");

CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notification_email" TEXT,
    "email_sent_at" TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_deletion_requests_user_id_key"
  ON "account_deletion_requests"("user_id");

CREATE INDEX IF NOT EXISTS "account_deletion_requests_status_updated_at_idx"
  ON "account_deletion_requests"("status", "updated_at");

ALTER TABLE "account_deletion_requests"
  DROP CONSTRAINT IF EXISTS "account_deletion_requests_user_id_fkey";

ALTER TABLE "account_deletion_requests"
  ADD CONSTRAINT "account_deletion_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
