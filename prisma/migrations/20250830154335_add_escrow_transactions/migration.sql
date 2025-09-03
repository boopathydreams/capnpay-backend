-- CreateEnum
CREATE TYPE "public"."EscrowStatus" AS ENUM ('INITIATED', 'PAID', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "public"."escrow_transactions" (
    "id" TEXT NOT NULL,
    "payer_upi" TEXT NOT NULL,
    "recipient_upi" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT NOT NULL,
    "status" "public"."EscrowStatus" NOT NULL DEFAULT 'INITIATED',
    "escrow_collection_id" TEXT,
    "escrow_payout_id" TEXT,
    "collection_status" TEXT,
    "payout_status" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escrow_transactions_payer_upi_idx" ON "public"."escrow_transactions"("payer_upi");

-- CreateIndex
CREATE INDEX "escrow_transactions_recipient_upi_idx" ON "public"."escrow_transactions"("recipient_upi");

-- CreateIndex
CREATE INDEX "escrow_transactions_escrow_collection_id_idx" ON "public"."escrow_transactions"("escrow_collection_id");

-- CreateIndex
CREATE INDEX "escrow_transactions_escrow_payout_id_idx" ON "public"."escrow_transactions"("escrow_payout_id");

-- CreateIndex
CREATE INDEX "escrow_transactions_status_idx" ON "public"."escrow_transactions"("status");
