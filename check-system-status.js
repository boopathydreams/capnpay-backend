const { PrismaClient } = require('@prisma/client');

async function checkSystemStatus() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking System Status...\n');

    // Check escrow transactions
    const escrowCount = await prisma.escrowTransaction.count();
    console.log(`📊 Escrow Transactions: ${escrowCount}`);

    if (escrowCount > 0) {
      const recentEscrow = await prisma.escrowTransaction.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
      });

      console.log('Recent escrow transactions:');
      recentEscrow.forEach((e) => {
        console.log(
          `  ${e.id} - ${e.recipientUpi} - ₹${e.amount} - ${e.status}`,
        );
      });
    }

    // Check payment intents
    const paymentIntentsCount = await prisma.paymentIntent.count();
    console.log(`\n💰 Payment Intents: ${paymentIntentsCount}`);

    // Check banking payments
    const bankingCount = await prisma.bankingPayment.count();
    console.log(`💳 Banking Payments: ${bankingCount}`);

    // Check payment receipts
    try {
      const receiptsCount = await prisma.paymentReceipt.count();
      console.log(`🧾 Payment Receipts: ${receiptsCount}`);
    } catch (e) {
      console.log(`🧾 Payment Receipts: Table not found or error`);
    }

    console.log('\n🎯 ISSUE ANALYSIS:');
    console.log('- Escrow payments are working but isolated');
    console.log('- No integration with PaymentIntent system');
    console.log('- No BankingPayment records created');
    console.log('- No PaymentReceipt generation');
    console.log('- Mobile app expects PaymentIntent flow for receipts');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSystemStatus();
