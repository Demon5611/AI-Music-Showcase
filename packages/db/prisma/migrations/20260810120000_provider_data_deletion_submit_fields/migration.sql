-- Provider data deletion email submit tracking (Mureka Vocal ID deletion).
ALTER TABLE "provider_data_deletion_requests"
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_attempt_at" TIMESTAMP(3),
ADD COLUMN "last_error" TEXT,
ADD COLUMN "provider_reference" TEXT;
