ALTER TABLE "music_generations"
  ADD COLUMN "client_request_id" TEXT,
  ADD COLUMN "client_request_hash" TEXT,
  ADD COLUMN "provider_request_json" JSONB;

CREATE UNIQUE INDEX "music_generations_user_id_client_request_id_key"
  ON "music_generations"("user_id", "client_request_id");

CREATE INDEX "music_generations_status_updated_at_idx"
  ON "music_generations"("status", "updated_at");
