-- CreateTable
CREATE TABLE "public"."spending_caps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "daily_limit" DECIMAL(10,2) NOT NULL,
    "weekly_limit" DECIMAL(10,2) NOT NULL,
    "monthly_limit" DECIMAL(10,2) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spending_caps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spending_caps_user_id_category_id_key" ON "public"."spending_caps"("user_id", "category_id");

-- AddForeignKey
ALTER TABLE "public"."spending_caps" ADD CONSTRAINT "spending_caps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."spending_caps" ADD CONSTRAINT "spending_caps_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
