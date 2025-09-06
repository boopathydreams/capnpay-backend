const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPayments() {
  try {
    console.log('🔍 Checking Payment Intents...\n');

    // Get total count
    const totalCount = await prisma.paymentIntent.count();
    console.log(`📊 Total Payment Intents: ${totalCount}`);

    // Get count by status
    const statusCounts = await prisma.paymentIntent.groupBy({
      by: ['status'],
      _count: true,
    });

    console.log('\n📈 Payment Status Breakdown:');
    statusCounts.forEach((s) => {
      console.log(`  ${s.status}: ${s._count}`);
    });

    // Get recent payments
    const recentPayments = await prisma.paymentIntent.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
    });

    console.log('\n🕒 Recent Payments:');
    recentPayments.forEach((p) => {
      console.log(
        `  ${p.trRef} - ${p.payeeName} - ₹${p.amount} - ${p.status} - ${p.createdAt.toISOString()}`,
      );
      if (p.tags.length > 0) {
        console.log(
          `    Tags: ${p.tags.map((t) => t.category?.name || 'Unknown').join(', ')}`,
        );
      }
    });

    // Check successful payments
    const successfulPayments = await prisma.paymentIntent.findMany({
      where: { status: 'SUCCESS' },
      take: 3,
      orderBy: { completedAt: 'desc' },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
    });

    console.log('\n✅ Recent Successful Payments:');
    successfulPayments.forEach((p) => {
      console.log(
        `  ${p.trRef} - ${p.payeeName} - ₹${p.amount} - Completed: ${p.completedAt?.toISOString()}`,
      );
    });
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPayments();
