/*
  Warnings:

  - Added the required column `updated_at` to the `attachments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `memos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."attachments" ADD COLUMN     "download_url" TEXT,
ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "is_uploaded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "upload_url" TEXT;

-- AlterTable
ALTER TABLE "public"."memos" ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "is_processed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transcript_confidence" DOUBLE PRECISION,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."payment_intents" ADD COLUMN     "category_override" TEXT,
ADD COLUMN     "is_receipt_generated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receipt_viewed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."payment_receipts" (
    "id" TEXT NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "collection_id" TEXT,
    "collection_amount" DECIMAL(10,2),
    "collection_fee" DECIMAL(10,2),
    "collection_status" TEXT,
    "collection_reference" TEXT,
    "collection_completed_at" TIMESTAMP(3),
    "payout_id" TEXT,
    "payout_amount" DECIMAL(10,2),
    "payout_fee" DECIMAL(10,2),
    "payout_status" TEXT,
    "payout_reference" TEXT,
    "payout_completed_at" TIMESTAMP(3),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "total_fees" DECIMAL(10,2) NOT NULL,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transaction_analytics" (
    "id" TEXT NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "time_of_day" INTEGER NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "is_weekend" BOOLEAN NOT NULL,
    "merchant_type" TEXT,
    "location" TEXT,
    "is_round_amount" BOOLEAN NOT NULL,
    "amount_category" TEXT NOT NULL,
    "frequency_score" DOUBLE PRECISION,
    "is_new_recipient" BOOLEAN NOT NULL,
    "recipient_trust_score" DOUBLE PRECISION,
    "relationship_type" TEXT,
    "is_recurring" BOOLEAN NOT NULL,
    "recurring_pattern" TEXT,
    "similar_transaction_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_payment_intent_id_key" ON "public"."payment_receipts"("payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_receipt_number_key" ON "public"."payment_receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_analytics_payment_intent_id_key" ON "public"."transaction_analytics"("payment_intent_id");

-- AddForeignKey
ALTER TABLE "public"."payment_receipts" ADD CONSTRAINT "payment_receipts_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transaction_analytics" ADD CONSTRAINT "transaction_analytics_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
