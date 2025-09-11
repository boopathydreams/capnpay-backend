-- AlterTable
ALTER TABLE "public"."categories" ADD COLUMN     "canonical_category_id" TEXT;

-- AlterTable
ALTER TABLE "public"."vpa_registry" ADD COLUMN     "category_catalog_id" TEXT,
ADD COLUMN     "category_confidence" DOUBLE PRECISION,
ADD COLUMN     "last_labeled_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."category_catalogs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" JSONB,
    "parent_name" TEXT,
    "color" TEXT NOT NULL DEFAULT '#C7ECEE',
    "default_cap_amount" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."merchant_catalogs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "subcategory" TEXT,
    "aliases" JSONB,
    "category_catalog_id" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."community_labels" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category_catalog_id" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "votes" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_catalogs_name_key" ON "public"."category_catalogs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "category_catalogs_slug_key" ON "public"."category_catalogs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_catalogs_normalized_name_key" ON "public"."merchant_catalogs"("normalized_name");

-- CreateIndex
CREATE INDEX "merchant_catalogs_category_catalog_id_idx" ON "public"."merchant_catalogs"("category_catalog_id");

-- CreateIndex
CREATE INDEX "merchant_catalogs_normalized_name_idx" ON "public"."merchant_catalogs"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "community_labels_key_key" ON "public"."community_labels"("key");

-- CreateIndex
CREATE INDEX "community_labels_category_catalog_id_idx" ON "public"."community_labels"("category_catalog_id");

-- CreateIndex
CREATE INDEX "community_labels_key_idx" ON "public"."community_labels"("key");

-- CreateIndex
CREATE INDEX "community_labels_last_seen_at_idx" ON "public"."community_labels"("last_seen_at");

-- CreateIndex
CREATE INDEX "categories_canonical_category_id_idx" ON "public"."categories"("canonical_category_id");

-- CreateIndex
CREATE INDEX "vpa_registry_category_catalog_id_idx" ON "public"."vpa_registry"("category_catalog_id");

-- AddForeignKey
ALTER TABLE "public"."categories" ADD CONSTRAINT "categories_canonical_category_id_fkey" FOREIGN KEY ("canonical_category_id") REFERENCES "public"."category_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."merchant_catalogs" ADD CONSTRAINT "merchant_catalogs_category_catalog_id_fkey" FOREIGN KEY ("category_catalog_id") REFERENCES "public"."category_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."community_labels" ADD CONSTRAINT "community_labels_category_catalog_id_fkey" FOREIGN KEY ("category_catalog_id") REFERENCES "public"."category_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vpa_registry" ADD CONSTRAINT "vpa_registry_category_catalog_id_fkey" FOREIGN KEY ("category_catalog_id") REFERENCES "public"."category_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
