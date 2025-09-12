/*
  Warnings:

  - A unique constraint covering the columns `[primary_vpa]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "phone_e164" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_primary_vpa_key" ON "public"."users"("primary_vpa");

-- CreateIndex
CREATE INDEX "users_primary_vpa_idx" ON "public"."users"("primary_vpa");

-- CreateIndex
CREATE INDEX "users_phone_e164_idx" ON "public"."users"("phone_e164");
