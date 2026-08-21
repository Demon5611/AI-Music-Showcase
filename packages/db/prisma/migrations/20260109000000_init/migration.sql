-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "vocal_gender" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_samples" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "consent_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "suno_voice_id" TEXT,
    "suno_voice_task_id" TEXT,
    "suno_validate_phrase" TEXT,
    "voice_clone_status" TEXT NOT NULL DEFAULT 'pending',
    "voice_clone_error" TEXT,
    "voice_clone_started_at" TIMESTAMP(3),
    "suno_validate_regen_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "audio_r2_key" TEXT NOT NULL,
    "cover_r2_key" TEXT,
    "share_slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "voice_sample_id" TEXT NOT NULL,
    "track_id" TEXT,
    "prompt" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "provider_job_id" TEXT,
    "credits_cost_units" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_generations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider_task_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "style" TEXT,
    "title" TEXT,
    "custom_mode" BOOLEAN NOT NULL DEFAULT false,
    "instrumental" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "raw_status" TEXT,
    "error_message" TEXT,
    "lyrics_result" JSONB,
    "album_cover_images_json" JSONB,
    "album_cover_task_id" TEXT,
    "selected_album_cover_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_generation_tracks" (
    "id" TEXT NOT NULL,
    "music_generation_id" TEXT NOT NULL,
    "provider_track_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration_sec" INTEGER,
    "audio_storage_key" TEXT,
    "audio_source_url" TEXT,
    "image_source_url" TEXT,
    "lyrics_text" TEXT,
    "timed_lyrics_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_generation_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_track_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'sunoapi',
    "provider_task_id" TEXT NOT NULL,
    "provider_track_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_stems',
    "audio_storage_key" TEXT,
    "duration_ms" INTEGER,
    "stem_separation_task_id" TEXT,
    "stem_separation_notice" TEXT,
    "pending_action" TEXT,
    "pending_task_id" TEXT,
    "pending_region_id" TEXT,
    "pending_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_stems" (
    "id" TEXT NOT NULL,
    "song_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "audio_storage_key" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_stems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_regions" (
    "id" TEXT NOT NULL,
    "song_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,
    "replacement_audio_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_versions" (
    "id" TEXT NOT NULL,
    "song_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "rendered_audio_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_operations" (
    "id" TEXT NOT NULL,
    "song_version_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),

    CONSTRAINT "edit_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_jobs" (
    "id" TEXT NOT NULL,
    "song_id" TEXT NOT NULL,
    "song_version_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount_units" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "stripe_payment_id" TEXT,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_objects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "checksum" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL DEFAULT 'free',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "voice_samples_user_id_status_created_at_idx" ON "voice_samples"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_share_slug_key" ON "tracks"("share_slug");

-- CreateIndex
CREATE INDEX "tracks_user_id_created_at_idx" ON "tracks"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "generation_jobs_user_id_status_created_at_idx" ON "generation_jobs"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "music_generations_provider_task_id_key" ON "music_generations"("provider_task_id");

-- CreateIndex
CREATE INDEX "music_generations_user_id_created_at_idx" ON "music_generations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "music_generations_user_id_status_created_at_idx" ON "music_generations"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "music_generation_tracks_music_generation_id_idx" ON "music_generation_tracks"("music_generation_id");

-- CreateIndex
CREATE UNIQUE INDEX "music_generation_tracks_music_generation_id_provider_track__key" ON "music_generation_tracks"("music_generation_id", "provider_track_id");

-- CreateIndex
CREATE UNIQUE INDEX "songs_source_track_id_key" ON "songs"("source_track_id");

-- CreateIndex
CREATE INDEX "songs_user_id_created_at_idx" ON "songs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "song_stems_song_id_type_key" ON "song_stems"("song_id", "type");

-- CreateIndex
CREATE INDEX "song_regions_song_id_order_index_idx" ON "song_regions"("song_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "song_versions_song_id_version_number_key" ON "song_versions"("song_id", "version_number");

-- CreateIndex
CREATE INDEX "edit_operations_song_version_id_created_at_idx" ON "edit_operations"("song_version_id", "created_at");

-- CreateIndex
CREATE INDEX "edit_operations_song_version_id_undone_at_idx" ON "edit_operations"("song_version_id", "undone_at");

-- CreateIndex
CREATE INDEX "render_jobs_song_id_created_at_idx" ON "render_jobs"("song_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "render_jobs_status_created_at_idx" ON "render_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_idempotency_key_key" ON "credit_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_stripe_payment_id_key" ON "credit_transactions"("stripe_payment_id");

-- CreateIndex
CREATE INDEX "credit_transactions_user_id_created_at_idx" ON "credit_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_transactions_related_entity_type_related_entity_id_idx" ON "credit_transactions"("related_entity_type", "related_entity_id");

-- CreateIndex
CREATE INDEX "webhook_events_provider_type_created_at_idx" ON "webhook_events"("provider", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "storage_objects_user_id_kind_created_at_idx" ON "storage_objects"("user_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "storage_objects_entity_type_entity_id_idx" ON "storage_objects"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "storage_objects_deleted_at_idx" ON "storage_objects"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_bucket_key_key" ON "storage_objects"("bucket", "key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- AddForeignKey
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_voice_sample_id_fkey" FOREIGN KEY ("voice_sample_id") REFERENCES "voice_samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_generations" ADD CONSTRAINT "music_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_generation_tracks" ADD CONSTRAINT "music_generation_tracks_music_generation_id_fkey" FOREIGN KEY ("music_generation_id") REFERENCES "music_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_source_track_id_fkey" FOREIGN KEY ("source_track_id") REFERENCES "music_generation_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_stems" ADD CONSTRAINT "song_stems_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_regions" ADD CONSTRAINT "song_regions_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edit_operations" ADD CONSTRAINT "edit_operations_song_version_id_fkey" FOREIGN KEY ("song_version_id") REFERENCES "song_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_song_version_id_fkey" FOREIGN KEY ("song_version_id") REFERENCES "song_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

