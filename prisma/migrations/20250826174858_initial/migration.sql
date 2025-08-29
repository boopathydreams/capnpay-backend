-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('CREATED', 'SUCCESS', 'FAILED', 'PENDING', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."Platform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "public"."TagSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."MemoType" AS ENUM ('TEXT', 'VOICE');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "cap_amount" DECIMAL(10,2),
    "soft_block" BOOLEAN NOT NULL DEFAULT false,
    "near_threshold_pct" INTEGER NOT NULL DEFAULT 80,
    "period_start" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_intents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tr_ref" TEXT NOT NULL,
    "vpa" TEXT NOT NULL,
    "payee_name" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "platform" "public"."Platform",
    "entrypoint" TEXT,
    "note_long" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "upi_txn_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" TEXT NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "tag_text" TEXT NOT NULL,
    "source" "public"."TagSource" NOT NULL DEFAULT 'AUTO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."memos" (
    "id" TEXT NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "type" "public"."MemoType" NOT NULL,
    "text_encrypted" TEXT,
    "transcript" TEXT,
    "lang" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."attachments" (
    "id" TEXT NOT NULL,
    "memo_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_monthly_spends" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_monthly_spends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "public"."users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_tr_ref_key" ON "public"."payment_intents"("tr_ref");

-- CreateIndex
CREATE UNIQUE INDEX "user_monthly_spends_user_id_category_id_year_month_key" ON "public"."user_monthly_spends"("user_id", "category_id", "year", "month");

-- AddForeignKey
ALTER TABLE "public"."categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_intents" ADD CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tags" ADD CONSTRAINT "tags_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tags" ADD CONSTRAINT "tags_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."memos" ADD CONSTRAINT "memos_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attachments" ADD CONSTRAINT "attachments_memo_id_fkey" FOREIGN KEY ("memo_id") REFERENCES "public"."memos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
