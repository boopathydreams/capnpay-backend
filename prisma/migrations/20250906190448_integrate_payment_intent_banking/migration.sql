/*
  Warnings:

  - A unique constraint covering the columns `[banking_payment_id]` on the table `payment_intents` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."payment_intents" ADD COLUMN     "banking_payment_id" TEXT,
ADD COLUMN     "transfer_type" "public"."TransferType" NOT NULL DEFAULT 'UPI';

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_banking_payment_id_key" ON "public"."payment_intents"("banking_payment_id");

-- AddForeignKey
ALTER TABLE "public"."payment_intents" ADD CONSTRAINT "payment_intents_banking_payment_id_fkey" FOREIGN KEY ("banking_payment_id") REFERENCES "public"."banking_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
