const { PrismaClient } = require('@prisma/client');

async function seedUserData() {
  const prisma = new PrismaClient();

  try {
    console.log('🌱 Seeding data for +919876543210...');

    // Find the user
    const user = await prisma.user.findUnique({
      where: { phoneE164: '+919876543210' },
      include: { categories: true },
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('👤 Found user:', user.id);

    // Create default categories if they don't exist
    const defaultCategories = [
      { name: 'Food & Dining', color: '#FF6B6B' },
      { name: 'Transport', color: '#4ECDC4' },
      { name: 'Shopping', color: '#45B7D1' },
      { name: 'Bills & Utilities', color: '#96CEB4' },
      { name: 'Entertainment', color: '#FFEAA7' },
      { name: 'Other', color: '#DDA0DD' },
    ];

    console.log('📂 Creating categories...');
    for (const cat of defaultCategories) {
      const existing = await prisma.category.findFirst({
        where: {
          userId: user.id,
          name: cat.name,
        },
      });

      if (!existing) {
        const category = await prisma.category.create({
          data: {
            userId: user.id,
            name: cat.name,
            color: cat.color,
          },
        });
        console.log('  ✅ Created:', cat.name);
      } else {
        console.log('  ⏭️  Exists:', cat.name);
      }
    }

    // Create spending caps for each category
    console.log('💰 Creating spending caps...');
    const categories = await prisma.category.findMany({
      where: { userId: user.id },
    });

    const capAmounts = {
      'Food & Dining': 15000,
      Transport: 6000,
      Shopping: 10000,
      'Bills & Utilities': 8000,
      Entertainment: 5000,
      Other: 7000,
    };

    for (const category of categories) {
      const existing = await prisma.spendingCap.findFirst({
        where: {
          userId: user.id,
          categoryId: category.id,
        },
      });

      if (!existing) {
        const monthlyAmount = capAmounts[category.name] || 5000;
        await prisma.spendingCap.create({
          data: {
            userId: user.id,
            categoryId: category.id,
            categoryName: category.name,
            color: category.color,
            description: `Monthly spending limit for ${category.name}`,
            dailyLimit: Math.round(monthlyAmount / 30),
            weeklyLimit: Math.round(monthlyAmount / 4),
            monthlyLimit: monthlyAmount,
            isEnabled: true,
          },
        });
        console.log('  ✅ Cap for:', category.name, '₹' + monthlyAmount);
      }
    }

    // Add some sample payment intents
    console.log('💳 Creating sample payment intents...');
    const samplePayments = [
      { amount: 450, payeeName: 'Swiggy', categoryName: 'Food & Dining' },
      { amount: 120, payeeName: 'Uber', categoryName: 'Transport' },
      { amount: 2500, payeeName: 'Amazon', categoryName: 'Shopping' },
      {
        amount: 800,
        payeeName: 'Electricity Bill',
        categoryName: 'Bills & Utilities',
      },
      { amount: 300, payeeName: 'BookMyShow', categoryName: 'Entertainment' },
      { amount: 1200, payeeName: 'Flipkart', categoryName: 'Shopping' },
      { amount: 85, payeeName: 'Ola', categoryName: 'Transport' },
      { amount: 650, payeeName: 'Zomato', categoryName: 'Food & Dining' },
      { amount: 199, payeeName: 'Spotify', categoryName: 'Entertainment' },
    ];

    for (const payment of samplePayments) {
      const category = await prisma.category.findFirst({
        where: {
          userId: user.id,
          name: payment.categoryName,
        },
      });

      if (category) {
        const paymentIntent = await prisma.paymentIntent.create({
          data: {
            userId: user.id,
            trRef: `TR${Date.now()}${Math.random().toString(36).substring(2, 7)}`,
            vpa: `merchant@${payment.payeeName.toLowerCase().replace(/\s+/g, '')}`,
            payeeName: payment.payeeName,
            amount: payment.amount,
            status: 'SUCCESS',
            entrypoint: 'manual_seed',
            completedAt: new Date(),
          },
        });

        // Create a tag linking the payment to the category
        await prisma.tag.create({
          data: {
            paymentIntentId: paymentIntent.id,
            categoryId: category.id,
            tagText: category.name,
            source: 'AUTO',
          },
        });

        console.log('  ✅ Payment:', payment.payeeName, '₹' + payment.amount);
      }
    }

    // Mark user as onboarding complete
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isOnboardingComplete: true,
        name: 'Test User',
      },
    });

    console.log('✅ User onboarding marked complete');
    console.log(
      '🎉 Seeding complete! User now has categories, caps, and transactions.',
    );
  } catch (error) {
    console.error('❌ Error seeding data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedUserData();
