-- CreateEnum
CREATE TYPE "public"."UserType" AS ENUM ('APP_USER', 'VPA_ONLY');

-- CreateEnum
CREATE TYPE "public"."KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('P2P', 'P2M', 'ESCROW');

-- CreateEnum
CREATE TYPE "public"."CollectionStatus" AS ENUM ('INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."RefundStatus" AS ENUM ('INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "blocked_at" TIMESTAMP(3),
ADD COLUMN     "blocked_by" TEXT,
ADD COLUMN     "blocked_reason" TEXT,
ADD COLUMN     "device_fingerprint" TEXT,
ADD COLUMN     "extracted_phone" TEXT,
ADD COLUMN     "kyc_status" "public"."KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "last_activity_at" TIMESTAMP(3),
ADD COLUMN     "primary_vpa" TEXT,
ADD COLUMN     "risk_score" DECIMAL(3,2) DEFAULT 0.0,
ADD COLUMN     "user_status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "user_type" "public"."UserType" NOT NULL DEFAULT 'APP_USER';

-- CreateTable
CREATE TABLE "public"."vpa_registry" (
    "id" TEXT NOT NULL,
    "vpa_address" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "extracted_phone" TEXT,
    "bank_name" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "risk_level" "public"."RiskLevel" NOT NULL DEFAULT 'LOW',
    "verification_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vpa_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."banking_payments" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_type" "public"."PaymentType" NOT NULL DEFAULT 'P2P',
    "collection_id" TEXT,
    "collection_status" "public"."CollectionStatus" NOT NULL DEFAULT 'INITIATED',
    "collection_txn_no" TEXT,
    "collection_ref_no" TEXT,
    "collection_completed_at" TIMESTAMP(3),
    "payout_id" TEXT,
    "payout_status" "public"."PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "payout_txn_no" TEXT,
    "payout_ref_no" TEXT,
    "payout_completed_at" TIMESTAMP(3),
    "overall_status" "public"."PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "purpose" TEXT,
    "category_id" TEXT,
    "fee_amount" DECIMAL(12,2) DEFAULT 0.0,
    "tax_amount" DECIMAL(12,2) DEFAULT 0.0,
    "refund_id" TEXT,
    "refund_status" "public"."RefundStatus",
    "refund_reason" TEXT,
    "risk_score" DECIMAL(3,2) DEFAULT 0.0,
    "compliance_check_passed" BOOLEAN NOT NULL DEFAULT true,
    "fraud_flags" JSONB,
    "legacy_payment_intent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banking_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."collections" (
    "id" TEXT NOT NULL,
    "decentro_txn_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "public"."CollectionStatus" NOT NULL DEFAULT 'INITIATED',
    "webhook_data" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payouts" (
    "id" TEXT NOT NULL,
    "decentro_txn_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "recipient_vpa" TEXT NOT NULL,
    "recipient_name" TEXT,
    "status" "public"."PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "webhook_data" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refunds" (
    "id" TEXT NOT NULL,
    "original_payment_id" TEXT NOT NULL,
    "refund_txn_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "public"."RefundStatus" NOT NULL DEFAULT 'INITIATED',
    "reason" TEXT NOT NULL,
    "admin_notes" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_audit_logs" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "action" "public"."AuditAction" NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "metadata" JSONB,
    "performed_by" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_fingerprint" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_status_history" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sub_status" TEXT,
    "details" JSONB,
    "system_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vpa_registry_vpa_address_key" ON "public"."vpa_registry"("vpa_address");

-- CreateIndex
CREATE INDEX "vpa_registry_user_id_idx" ON "public"."vpa_registry"("user_id");

-- CreateIndex
CREATE INDEX "vpa_registry_risk_level_idx" ON "public"."vpa_registry"("risk_level");

-- CreateIndex
CREATE UNIQUE INDEX "banking_payments_collection_id_key" ON "public"."banking_payments"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "banking_payments_payout_id_key" ON "public"."banking_payments"("payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "banking_payments_refund_id_key" ON "public"."banking_payments"("refund_id");

-- CreateIndex
CREATE INDEX "banking_payments_sender_id_idx" ON "public"."banking_payments"("sender_id");

-- CreateIndex
CREATE INDEX "banking_payments_receiver_id_idx" ON "public"."banking_payments"("receiver_id");

-- CreateIndex
CREATE INDEX "banking_payments_overall_status_idx" ON "public"."banking_payments"("overall_status");

-- CreateIndex
CREATE INDEX "banking_payments_created_at_idx" ON "public"."banking_payments"("created_at");

-- CreateIndex
CREATE INDEX "banking_payments_collection_id_idx" ON "public"."banking_payments"("collection_id");

-- CreateIndex
CREATE INDEX "banking_payments_payout_id_idx" ON "public"."banking_payments"("payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_decentro_txn_id_key" ON "public"."collections"("decentro_txn_id");

-- CreateIndex
CREATE INDEX "collections_status_idx" ON "public"."collections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_decentro_txn_id_key" ON "public"."payouts"("decentro_txn_id");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "public"."payouts"("status");

-- CreateIndex
CREATE INDEX "payouts_recipient_vpa_idx" ON "public"."payouts"("recipient_vpa");

-- CreateIndex
CREATE INDEX "payment_audit_logs_payment_id_idx" ON "public"."payment_audit_logs"("payment_id");

-- CreateIndex
CREATE INDEX "payment_audit_logs_timestamp_idx" ON "public"."payment_audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "payment_audit_logs_action_idx" ON "public"."payment_audit_logs"("action");

-- CreateIndex
CREATE INDEX "payment_status_history_payment_id_idx" ON "public"."payment_status_history"("payment_id");

-- CreateIndex
CREATE INDEX "payment_status_history_created_at_idx" ON "public"."payment_status_history"("created_at");

-- AddForeignKey
ALTER TABLE "public"."vpa_registry" ADD CONSTRAINT "vpa_registry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."banking_payments" ADD CONSTRAINT "banking_payments_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."banking_payments" ADD CONSTRAINT "banking_payments_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."banking_payments" ADD CONSTRAINT "banking_payments_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."banking_payments" ADD CONSTRAINT "banking_payments_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."banking_payments" ADD CONSTRAINT "banking_payments_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."banking_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_status_history" ADD CONSTRAINT "payment_status_history_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."banking_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
