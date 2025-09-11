-- AlterTable
ALTER TABLE "public"."community_labels" ADD COLUMN     "last_updated" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "vpa_address" TEXT;

-- AlterTable
ALTER TABLE "public"."vpa_registry" ADD COLUMN     "last_updated" TIMESTAMP(3),
ADD COLUMN     "votes" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "community_labels_vpa_address_idx" ON "public"."community_labels"("vpa_address");
