-- CreateEnum
CREATE TYPE "MusicSubmissionState" AS ENUM (
  'queued',
  'dispatching',
  'submitted',
  'submit_unknown',
  'failed'
);

-- AlterTable
ALTER TABLE "music_generations"
  ADD COLUMN "submission_state" "MusicSubmissionState" NOT NULL DEFAULT 'queued',
  ADD COLUMN "submit_attempt_id" TEXT,
  ADD COLUMN "submit_attempted_at" TIMESTAMP(3),
  ADD COLUMN "submit_completed_at" TIMESTAMP(3),
  ADD COLUMN "submit_error_code" TEXT,
  ADD COLUMN "submit_error_message" TEXT;

-- Backfill
UPDATE "music_generations"
SET "submission_state" = 'failed'
WHERE "status" = 'failed';

UPDATE "music_generations"
SET "submission_state" = 'submitted'
WHERE "status" <> 'failed'
  AND "provider_task_id" NOT LIKE 'queue:%';

UPDATE "music_generations"
SET "submission_state" = 'queued'
WHERE "status" <> 'failed'
  AND "provider_task_id" LIKE 'queue:%';

-- CreateIndex
CREATE INDEX "music_generations_submission_state_submit_attempted_at_idx"
  ON "music_generations"("submission_state", "submit_attempted_at");
