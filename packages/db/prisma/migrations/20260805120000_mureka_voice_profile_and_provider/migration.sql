-- AlterTable
ALTER TABLE "music_generations" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'sunoapi';

-- AlterTable
ALTER TABLE "music_generations" ADD COLUMN "voice_profile_id" TEXT;

-- CreateIndex
CREATE INDEX "music_generations_provider_status_updated_at_idx" ON "music_generations"("provider", "status", "updated_at");

-- CreateTable
CREATE TABLE "voice_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "source_voice_sample_id" TEXT NOT NULL,
    "consent_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "voice_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_profiles_user_id_provider_status_deleted_at_idx" ON "voice_profiles"("user_id", "provider", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "voice_profiles_user_id_provider_external_id_key" ON "voice_profiles"("user_id", "provider", "external_id");

-- AddForeignKey
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
