#!/usr/bin/env tsx

/**
 * Merchant Catalog Import Script
 *
 * Imports merchant data from ML services CSV into PostgreSQL database
 * Creates canonical categories and links merchants to them
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

interface MerchantRow {
  'Merchant Name': string;
  Category: string;
  Subcategory?: string;
}

// Canonical category configuration with colors and default caps
const CANONICAL_CATEGORIES = [
  {
    name: 'Food & Dining',
    slug: 'food-dining',
    aliases: ['food', 'dining', 'restaurant', 'QSR', 'cafe'],
    color: '#FF6B6B',
    defaultCapAmount: 15000,
  },
  {
    name: 'Transport',
    slug: 'transport',
    aliases: ['transportation', 'travel', 'fuel', 'cab', 'metro'],
    color: '#4ECDC4',
    defaultCapAmount: 8000,
  },
  {
    name: 'Shopping',
    slug: 'shopping',
    aliases: ['retail', 'ecommerce', 'store', 'mall', 'online'],
    color: '#45B7D1',
    defaultCapAmount: 20000,
  },
  {
    name: 'Healthcare',
    slug: 'healthcare',
    aliases: ['medical', 'health', 'pharmacy', 'hospital', 'clinic'],
    color: '#FF9FF3',
    defaultCapAmount: 12000,
  },
  {
    name: 'Personal',
    slug: 'personal',
    aliases: ['personal-care', 'grooming', 'beauty', 'wellness'],
    color: '#96CEB4',
    defaultCapAmount: 6000,
  },
  {
    name: 'Bills & Utilities',
    slug: 'bills-utilities',
    aliases: ['bills', 'utilities', 'recharge', 'electricity', 'internet'],
    color: '#FECA57',
    defaultCapAmount: 10000,
  },
  {
    name: 'Entertainment',
    slug: 'entertainment',
    aliases: ['movies', 'games', 'streaming', 'music', 'books'],
    color: '#48CAE4',
    defaultCapAmount: 5000,
  },
  {
    name: 'Investment',
    slug: 'investment',
    aliases: ['mutual-funds', 'stocks', 'insurance', 'sip', 'fd'],
    color: '#54A0FF',
    defaultCapAmount: 25000,
  },
  {
    name: 'Education',
    slug: 'education',
    aliases: ['learning', 'courses', 'books', 'school', 'fees'],
    color: '#5F27CD',
    defaultCapAmount: 8000,
  },
  {
    name: 'Other',
    slug: 'other',
    aliases: ['miscellaneous', 'unknown', 'general'],
    color: '#C7ECEE',
    defaultCapAmount: 10000,
  },
];

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCanonicalCategory(categoryName: string) {
  const normalized = normalizeString(categoryName);

  // Direct name match
  let found = CANONICAL_CATEGORIES.find(
    (cat) => normalizeString(cat.name) === normalized,
  );

  // Alias match
  if (!found) {
    found = CANONICAL_CATEGORIES.find((cat) =>
      cat.aliases.some((alias) => normalizeString(alias) === normalized),
    );
  }

  // Partial match for complex categories
  if (!found) {
    found = CANONICAL_CATEGORIES.find(
      (cat) =>
        normalized.includes(normalizeString(cat.name)) ||
        cat.aliases.some((alias) =>
          normalized.includes(normalizeString(alias)),
        ),
    );
  }

  return found || CANONICAL_CATEGORIES.find((cat) => cat.name === 'Other');
}

async function importMerchantCatalog() {
  console.log('🚀 Starting merchant catalog import...');
  console.log(
    `📊 Database: ${process.env.DATABASE_URL?.split('@')[1] || 'Unknown'}`,
  );

  try {
    // 1. Create canonical categories
    console.log('\n📝 Creating canonical categories...');

    let categoriesCreated = 0;
    for (const category of CANONICAL_CATEGORIES) {
      const result = await prisma.categoryCatalog.upsert({
        where: { name: category.name },
        update: {
          aliases: category.aliases,
          color: category.color,
          defaultCapAmount: category.defaultCapAmount,
        },
        create: {
          name: category.name,
          slug: category.slug,
          aliases: category.aliases,
          color: category.color,
          defaultCapAmount: category.defaultCapAmount,
        },
      });

      console.log(`  ✅ ${category.name} (${category.color})`);
      categoriesCreated++;
    }

    console.log(`📋 Created/updated ${categoriesCreated} canonical categories`);

    // 2. Read merchant CSV
    console.log('\n📄 Reading merchant CSV data...');

    const csvPath = path.join(
      process.cwd(),
      'ml-services/data/merchant_category.csv',
    );

    if (!fs.existsSync(csvPath)) {
      throw new Error(`❌ CSV file not found at: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records: MerchantRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`📊 Found ${records.length} merchant records`);

    // 3. Import merchants in batches
    console.log('\n🏪 Importing merchant catalog...');

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const batchSize = 100;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      console.log(
        `  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)}...`,
      );

      for (const record of batch) {
        try {
          const merchantName = record['Merchant Name']?.trim();
          const category = record['Category']?.trim();
          const subcategory = record['Subcategory']?.trim();

          if (!merchantName || !category) {
            skipped++;
            continue;
          }

          const canonicalCategory = findCanonicalCategory(category);

          if (!canonicalCategory) {
            console.warn(`⚠️ Cannot map category: ${category}`);
            skipped++;
            continue;
          }

          const categoryCatalog = await prisma.categoryCatalog.findUnique({
            where: { name: canonicalCategory.name },
          });

          if (!categoryCatalog) {
            console.error(
              `❌ Canonical category not found in DB: ${canonicalCategory.name}`,
            );
            errors++;
            continue;
          }

          const normalizedName = normalizeString(merchantName);

          await prisma.merchantCatalog.upsert({
            where: { normalizedName },
            update: {
              name: merchantName,
              subcategory,
              categoryCatalogId: categoryCatalog.id,
              confidence: 0.9, // High confidence for curated data
            },
            create: {
              name: merchantName,
              normalizedName,
              subcategory,
              categoryCatalogId: categoryCatalog.id,
              aliases: [],
              confidence: 0.9,
            },
          });

          imported++;
        } catch (error) {
          console.error(
            `❌ Error importing ${record['Merchant Name']}:`,
            error.message,
          );
          errors++;
        }
      }
    }

    console.log(`\n✅ Merchant import complete:`);
    console.log(`  📥 Imported: ${imported}`);
    console.log(`  ⏭️ Skipped: ${skipped}`);
    console.log(`  ❌ Errors: ${errors}`);

    // 4. Backfill existing user categories
    console.log('\n🔄 Backfilling existing user categories...');

    const existingCategories = await prisma.category.findMany({
      where: { canonicalCategoryId: null },
      select: { id: true, name: true, userId: true },
    });

    console.log(
      `📊 Found ${existingCategories.length} unmapped user categories`,
    );

    let backfilled = 0;

    for (const category of existingCategories) {
      try {
        const canonicalCategory = findCanonicalCategory(category.name);

        if (canonicalCategory) {
          const catalogEntry = await prisma.categoryCatalog.findUnique({
            where: { name: canonicalCategory.name },
          });

          if (catalogEntry) {
            await prisma.category.update({
              where: { id: category.id },
              data: { canonicalCategoryId: catalogEntry.id },
            });
            backfilled++;
          }
        }
      } catch (error) {
        console.error(
          `❌ Error backfilling category ${category.name}:`,
          error.message,
        );
      }
    }

    console.log(`✅ Backfilled ${backfilled} existing categories`);

    // 5. Generate summary stats
    console.log('\n📊 Summary Statistics:');

    const categoryStats = await prisma.categoryCatalog.findMany({
      include: {
        merchantCatalog: true,
        categories: true,
        _count: {
          select: {
            merchantCatalog: true,
            categories: true,
          },
        },
      },
    });

    console.log('\n📈 Category Breakdown:');
    categoryStats.forEach((cat) => {
      console.log(
        `  ${cat.name}: ${cat._count.merchantCatalog} merchants, ${cat._count.categories} user categories`,
      );
    });

    const totalMerchants = await prisma.merchantCatalog.count();
    const totalUserCategories = await prisma.category.count();
    const mappedUserCategories = await prisma.category.count({
      where: { canonicalCategoryId: { not: null } },
    });

    console.log('\n🎯 Final Stats:');
    console.log(`  📋 Total canonical categories: ${categoryStats.length}`);
    console.log(`  🏪 Total merchants in catalog: ${totalMerchants}`);
    console.log(`  👥 Total user categories: ${totalUserCategories}`);
    console.log(
      `  🔗 Mapped user categories: ${mappedUserCategories}/${totalUserCategories} (${Math.round((mappedUserCategories / totalUserCategories) * 100)}%)`,
    );

    console.log('\n🎉 Merchant catalog import completed successfully!');
  } catch (error) {
    console.error('\n💥 Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
if (require.main === module) {
  importMerchantCatalog()
    .then(() => {
      console.log('\n✨ Import script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Import script failed:', error);
      process.exit(1);
    });
}

export { importMerchantCatalog };
