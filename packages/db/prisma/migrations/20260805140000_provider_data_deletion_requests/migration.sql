-- CreateTable
CREATE TABLE "provider_data_deletion_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "provider_external_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_data_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_data_deletion_requests_provider_status_requested_at_idx" ON "provider_data_deletion_requests"("provider", "status", "requested_at");

-- CreateIndex
CREATE INDEX "provider_data_deletion_requests_user_id_status_idx" ON "provider_data_deletion_requests"("user_id", "status");

-- AddForeignKey
ALTER TABLE "provider_data_deletion_requests" ADD CONSTRAINT "provider_data_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
