-- CreateEnum
CREATE TYPE "MusicTrackPersistenceState" AS ENUM (
  'pending',
  'processing',
  'stored',
  'failed'
);

-- AlterTable
ALTER TABLE "music_generation_tracks"
  ADD COLUMN "persistence_state" "MusicTrackPersistenceState" NOT NULL DEFAULT 'pending',
  ADD COLUMN "persistence_attempted_at" TIMESTAMP(3),
  ADD COLUMN "persistence_completed_at" TIMESTAMP(3),
  ADD COLUMN "persistence_heartbeat_at" TIMESTAMP(3),
  ADD COLUMN "persistence_error_code" TEXT,
  ADD COLUMN "persistence_error_message" TEXT,
  ADD COLUMN "persistence_attempts" INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing storage / source URL state
UPDATE "music_generation_tracks"
SET
  "persistence_state" = 'stored',
  "persistence_completed_at" = COALESCE("persistence_completed_at", "created_at")
WHERE "audio_storage_key" IS NOT NULL;

UPDATE "music_generation_tracks"
SET "persistence_state" = 'pending'
WHERE "audio_storage_key" IS NULL
  AND "audio_source_url" IS NOT NULL;

UPDATE "music_generation_tracks"
SET
  "persistence_state" = 'failed',
  "persistence_error_code" = 'MISSING_SOURCE',
  "persistence_error_message" = 'No audio source URL or storage key at backfill'
WHERE "audio_storage_key" IS NULL
  AND "audio_source_url" IS NULL;

-- CreateIndex
CREATE INDEX "music_generation_tracks_persistence_state_persistence_heartbeat_at_idx"
  ON "music_generation_tracks"("persistence_state", "persistence_heartbeat_at");
