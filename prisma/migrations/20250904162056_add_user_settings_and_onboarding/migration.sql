-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "is_onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "monthly_salary" DECIMAL(12,2),
ADD COLUMN     "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN     "time_zone" TEXT;

-- CreateTable
CREATE TABLE "public"."user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "themePreference" TEXT NOT NULL DEFAULT 'system',
    "biometric_enabled" BOOLEAN NOT NULL DEFAULT false,
    "transaction_alerts" BOOLEAN NOT NULL DEFAULT true,
    "budget_alerts" BOOLEAN NOT NULL DEFAULT true,
    "monthly_reports" BOOLEAN NOT NULL DEFAULT true,
    "marketing_emails" BOOLEAN NOT NULL DEFAULT false,
    "auto_tagging" BOOLEAN NOT NULL DEFAULT true,
    "spending_insights" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "public"."user_settings"("user_id");

-- AddForeignKey
ALTER TABLE "public"."user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
