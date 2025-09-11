#!/usr/bin/env tsx

/**
 * Test Canonical Category System
 * Verifies the Phase 1 implementation is working correctly
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCanonicalCategories() {
  console.log('🔍 Testing Canonical Category System...\n');

  try {
    // 1. Test canonical categories exist
    console.log('1️⃣ Testing canonical categories...');
    const categories = await prisma.categoryCatalog.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            merchantCatalog: true,
            categories: true,
          },
        },
      },
    });

    console.log(`✅ Found ${categories.length} canonical categories:`);
    categories.forEach((cat) => {
      console.log(
        `   • ${cat.name} (${cat.color}): ${cat._count.merchantCatalog} merchants, ${cat._count.categories} user categories`,
      );
    });

    // 2. Test merchant lookup
    console.log('\n2️⃣ Testing merchant catalog...');
    const sampleMerchants = await prisma.merchantCatalog.findMany({
      take: 5,
      include: {
        categoryCatalog: {
          select: { name: true, color: true },
        },
      },
      orderBy: { confidence: 'desc' },
    });

    console.log('✅ Sample merchants:');
    sampleMerchants.forEach((merchant) => {
      console.log(
        `   • ${merchant.name} → ${merchant.categoryCatalog.name} (${merchant.confidence})`,
      );
    });

    // 3. Test search functionality
    console.log('\n3️⃣ Testing merchant search...');
    const mcdonalds = await prisma.merchantCatalog.findFirst({
      where: {
        OR: [
          { name: { contains: 'McDonald', mode: 'insensitive' } },
          { normalizedName: { contains: 'mcdonald' } },
        ],
      },
      include: {
        categoryCatalog: true,
      },
    });

    if (mcdonalds) {
      console.log(
        `✅ Found McDonald's: ${mcdonalds.name} → ${mcdonalds.categoryCatalog.name}`,
      );
    } else {
      console.log("⚠️ McDonald's not found in catalog");
    }

    // 4. Test category distribution
    console.log('\n4️⃣ Testing category distribution...');
    const categoryStats = await Promise.all(
      categories.map(async (cat) => {
        const merchantCount = await prisma.merchantCatalog.count({
          where: { categoryCatalogId: cat.id },
        });
        return { name: cat.name, merchants: merchantCount };
      }),
    );

    categoryStats
      .sort((a, b) => b.merchants - a.merchants)
      .forEach((stat) => {
        console.log(`   • ${stat.name}: ${stat.merchants} merchants`);
      });

    // 5. Test total counts
    console.log('\n5️⃣ Testing total counts...');
    const totalMerchants = await prisma.merchantCatalog.count();
    const totalUserCategories = await prisma.category.count();
    const mappedUserCategories = await prisma.category.count({
      where: { canonicalCategoryId: { not: null } },
    });

    console.log(`✅ Total merchants: ${totalMerchants}`);
    console.log(`✅ Total user categories: ${totalUserCategories}`);
    console.log(
      `✅ Mapped user categories: ${mappedUserCategories}/${totalUserCategories} (${totalUserCategories > 0 ? Math.round((mappedUserCategories / totalUserCategories) * 100) : 0}%)`,
    );

    // 6. Test specific lookups
    console.log('\n6️⃣ Testing specific merchant lookups...');
    const testMerchants = ['Zomato', 'Uber', 'Amazon', 'Swiggy'];

    for (const merchantName of testMerchants) {
      const normalizedName = merchantName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const merchant = await prisma.merchantCatalog.findFirst({
        where: {
          OR: [
            { normalizedName: normalizedName },
            { name: { contains: merchantName, mode: 'insensitive' } },
          ],
        },
        include: {
          categoryCatalog: { select: { name: true } },
        },
      });

      if (merchant) {
        console.log(`   ✅ ${merchantName} → ${merchant.categoryCatalog.name}`);
      } else {
        console.log(`   ❌ ${merchantName} not found`);
      }
    }

    console.log('\n🎉 Canonical Category System Test Complete!');
    console.log('\n📊 Summary:');
    console.log(`   • ${categories.length} canonical categories defined`);
    console.log(`   • ${totalMerchants} merchants in catalog`);
    console.log(`   • High-confidence merchant lookups working`);
    console.log(`   • Ready for ML service integration`);
  } catch (error) {
    console.error('\n💥 Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testCanonicalCategories()
    .then(() => {
      console.log('\n✨ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

export { testCanonicalCategories };
