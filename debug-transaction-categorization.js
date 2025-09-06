const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugTransactionCategorization() {
  try {
    console.log('🔍 Debugging Transaction Categorization Issues...\n');

    // 1. Check if there are any payment intents
    const paymentIntents = await prisma.paymentIntent.findMany({
      take: 5,
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 Found ${paymentIntents.length} payment intents (showing last 5):`);
    paymentIntents.forEach((payment, index) => {
      console.log(`${index + 1}. Payment ID: ${payment.id}`);
      console.log(`   Amount: ₹${payment.amount}`);
      console.log(`   Payee: ${payment.payeeName || 'Unknown'}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Tags: ${payment.tags.length > 0 ? payment.tags.map(t => t.category?.name).join(', ') : 'None'}`);
      console.log(`   Category Override: ${payment.categoryOverride || 'None'}`);
      console.log('');
    });

    // 2. Check categories
    const categories = await prisma.category.findMany({
      take: 10,
    });

    console.log(`🏷️ Found ${categories.length} categories:`);
    categories.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.name} (${cat.color})`);
    });
    console.log('');

    // 3. Check tags
    const tags = await prisma.tag.findMany({
      take: 10,
      include: {
        category: true,
        paymentIntent: true,
      },
    });

    console.log(`🏷️ Found ${tags.length} tags:`);
    tags.forEach((tag, index) => {
      console.log(`${index + 1}. Tag: "${tag.tagText}"`);
      console.log(`   Category: ${tag.category?.name || 'Unknown'}`);
      console.log(`   Payment: ₹${tag.paymentIntent?.amount || 'Unknown'} to ${tag.paymentIntent?.payeeName || 'Unknown'}`);
      console.log(`   Source: ${tag.source}`);
      console.log('');
    });

    // 4. Check for "Food & Dining" category specifically
    const foodCategory = await prisma.category.findFirst({
      where: {
        name: {
          contains: 'food',
          mode: 'insensitive',
        },
      },
    });

    if (foodCategory) {
      console.log(`🍽️ Found Food & Dining category: ${foodCategory.name} (ID: ${foodCategory.id})`);
      
      // Check for transactions tagged with food category
      const foodTransactions = await prisma.paymentIntent.findMany({
        where: {
          tags: {
            some: {
              categoryId: foodCategory.id,
            },
          },
        },
        include: {
          tags: {
            include: {
              category: true,
            },
          },
        },
      });

      console.log(`🍽️ Found ${foodTransactions.length} transactions tagged with Food & Dining`);
      foodTransactions.forEach((txn, index) => {
        console.log(`${index + 1}. ₹${txn.amount} to ${txn.payeeName || 'Unknown'} - Status: ${txn.status}`);
      });
    } else {
      console.log('❌ No Food & Dining category found');
    }

    // 5. Check spending caps
    const spendingCaps = await prisma.spendingCap.findMany({
      include: {
        category: true,
      },
    });

    console.log(`\n💰 Found ${spendingCaps.length} spending caps:`);
    spendingCaps.forEach((cap, index) => {
      console.log(`${index + 1}. ${cap.categoryName} - Limit: ₹${cap.monthlyLimit}`);
      console.log(`   Category ID: ${cap.categoryId}`);
      console.log(`   Enabled: ${cap.isEnabled}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugTransactionCategorization();
