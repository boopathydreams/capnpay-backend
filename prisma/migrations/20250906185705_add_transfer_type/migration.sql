-- CreateEnum
CREATE TYPE "public"."TransferType" AS ENUM ('UPI', 'RTGS', 'IMPS', 'NEFT', 'NACH');

-- AlterTable
ALTER TABLE "public"."banking_payments" ADD COLUMN     "transfer_type" "public"."TransferType" NOT NULL DEFAULT 'UPI';
