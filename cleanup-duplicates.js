#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupDuplicates() {
  console.log('🧹 Cleaning up duplicate categories and spending caps...\n');

  try {
    // 1. Find and remove duplicate categories (keep the first one)
    console.log('📊 Finding duplicate categories...');
    const categories = await prisma.category.findMany({
      orderBy: [{ userId: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });

    const seen = new Set();
    const duplicateIds = [];

    for (const category of categories) {
      const key = `${category.userId}:${category.name}`;
      if (seen.has(key)) {
        duplicateIds.push(category.id);
        console.log(
          `  - Found duplicate: ${category.name} for user ${category.userId}`,
        );
      } else {
        seen.add(key);
      }
    }

    if (duplicateIds.length > 0) {
      console.log(
        `🗑️  Removing ${duplicateIds.length} duplicate categories...`,
      );

      // First, delete related spending caps
      await prisma.spendingCap.deleteMany({
        where: {
          categoryId: {
            in: duplicateIds,
          },
        },
      });

      // Then delete the duplicate categories
      await prisma.category.deleteMany({
        where: {
          id: {
            in: duplicateIds,
          },
        },
      });

      console.log('✅ Duplicate categories cleaned up');
    } else {
      console.log('✅ No duplicate categories found');
    }

    // 2. Find and remove duplicate spending caps
    console.log('\n📊 Finding duplicate spending caps...');
    const spendingCaps = await prisma.spendingCap.findMany({
      orderBy: [{ userId: 'asc' }, { categoryId: 'asc' }, { createdAt: 'asc' }],
    });

    const capsSeen = new Set();
    const duplicateCapIds = [];

    for (const cap of spendingCaps) {
      const key = `${cap.userId}:${cap.categoryId}`;
      if (capsSeen.has(key)) {
        duplicateCapIds.push(cap.id);
        console.log(
          `  - Found duplicate spending cap: ${cap.categoryName} for user ${cap.userId}`,
        );
      } else {
        capsSeen.add(key);
      }
    }

    if (duplicateCapIds.length > 0) {
      console.log(
        `🗑️  Removing ${duplicateCapIds.length} duplicate spending caps...`,
      );
      await prisma.spendingCap.deleteMany({
        where: {
          id: {
            in: duplicateCapIds,
          },
        },
      });
      console.log('✅ Duplicate spending caps cleaned up');
    } else {
      console.log('✅ No duplicate spending caps found');
    }

    console.log('\n🎉 Cleanup completed successfully!');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupDuplicates();
