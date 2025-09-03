-- CreateTable
CREATE TABLE "public"."escrow_payments" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "recipient_vpa" TEXT NOT NULL,
    "recipient_name" TEXT,
    "category" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'collection_created',
    "collection_txn_id" TEXT NOT NULL,
    "payout_txn_id" TEXT,
    "payout_initiated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "escrow_payments_reference_id_key" ON "public"."escrow_payments"("reference_id");

-- CreateIndex
CREATE INDEX "escrow_payments_reference_id_idx" ON "public"."escrow_payments"("reference_id");

-- CreateIndex
CREATE INDEX "escrow_payments_user_id_idx" ON "public"."escrow_payments"("user_id");

-- CreateIndex
CREATE INDEX "escrow_payments_status_idx" ON "public"."escrow_payments"("status");
