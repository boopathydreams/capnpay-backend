const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanTransactionTables() {
  console.log('🧹 CLEANING TRANSACTION TABLES');
  console.log('================================');

  try {
    // Order matters due to foreign key constraints
    // Delete in reverse dependency order

    console.log('🗑️  Cleaning Payment Status History...');
    const paymentStatusHistory = await prisma.paymentStatusHistory.deleteMany(
      {},
    );
    console.log(
      `   → Deleted ${paymentStatusHistory.count} payment status history records`,
    );

    console.log('🗑️  Cleaning Payment Audit Logs...');
    const paymentAuditLogs = await prisma.paymentAuditLog.deleteMany({});
    console.log(`   → Deleted ${paymentAuditLogs.count} payment audit logs`);

    console.log('🗑️  Cleaning Refunds...');
    const refunds = await prisma.refund.deleteMany({});
    console.log(`   → Deleted ${refunds.count} refunds`);

    console.log('🗑️  Cleaning Memos...');
    const memos = await prisma.memo.deleteMany({});
    console.log(`   → Deleted ${memos.count} memos`);

    console.log('🗑️  Cleaning Attachments...');
    const attachments = await prisma.attachment.deleteMany({});
    console.log(`   → Deleted ${attachments.count} attachments`);

    console.log('🗑️  Cleaning Payment Receipts...');
    const receipts = await prisma.paymentReceipt.deleteMany({});
    console.log(`   → Deleted ${receipts.count} payment receipts`);

    console.log('🗑️  Cleaning Transaction Analytics...');
    const transactionAnalytics = await prisma.transactionAnalytics.deleteMany(
      {},
    );
    console.log(
      `   → Deleted ${transactionAnalytics.count} transaction analytics`,
    );

    console.log('🗑️  Cleaning Payouts...');
    const payouts = await prisma.payout.deleteMany({});
    console.log(`   → Deleted ${payouts.count} payouts`);

    console.log('🗑️  Cleaning Collections...');
    const collections = await prisma.collection.deleteMany({});
    console.log(`   → Deleted ${collections.count} collections`);

    console.log('🗑️  Cleaning Banking Payments...');
    const bankingPayments = await prisma.bankingPayment.deleteMany({});
    console.log(`   → Deleted ${bankingPayments.count} banking payments`);

    console.log('🗑️  Cleaning Escrow Transactions...');
    const escrowTransactions = await prisma.escrowTransaction.deleteMany({});
    console.log(`   → Deleted ${escrowTransactions.count} escrow transactions`);

    console.log('🗑️  Cleaning Escrow Payments...');
    const escrowPayments = await prisma.escrowPayment.deleteMany({});
    console.log(`   → Deleted ${escrowPayments.count} escrow payments`);

    console.log('🗑️  Cleaning Payment Intents...');
    const paymentIntents = await prisma.paymentIntent.deleteMany({});
    console.log(`   → Deleted ${paymentIntents.count} payment intents`);

    console.log('🗑️  Cleaning Tags...');
    const tags = await prisma.tag.deleteMany({});
    console.log(`   → Deleted ${tags.count} tags`);

    console.log('\n✅ All transaction tables cleaned successfully!');
    console.log('🔄 Ready for fresh testing');
  } catch (error) {
    console.error('❌ Error cleaning tables:', error);

    // If we get foreign key constraint errors, try a more aggressive approach
    if (error.code === 'P2003') {
      console.log('\n🔧 Trying foreign key constraint bypass...');

      try {
        // Disable foreign key checks temporarily (if supported)
        await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0;`;

        // Clean all tables
        await prisma.paymentStatusHistory.deleteMany({});
        await prisma.paymentAuditLog.deleteMany({});
        await prisma.refund.deleteMany({});
        await prisma.memo.deleteMany({});
        await prisma.attachment.deleteMany({});
        await prisma.paymentReceipt.deleteMany({});
        await prisma.transactionAnalytics.deleteMany({});
        await prisma.payout.deleteMany({});
        await prisma.collection.deleteMany({});
        await prisma.bankingPayment.deleteMany({});
        await prisma.escrowTransaction.deleteMany({});
        await prisma.escrowPayment.deleteMany({});
        await prisma.paymentIntent.deleteMany({});
        await prisma.tag.deleteMany({});

        // Re-enable foreign key checks
        await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 1;`;

        console.log('✅ Tables cleaned with constraint bypass!');
      } catch (bypassError) {
        console.error('❌ Constraint bypass failed:', bypassError);

        // Last resort: truncate tables (PostgreSQL)
        console.log('\n🔧 Trying PostgreSQL truncate...');
        try {
          await prisma.$executeRaw`TRUNCATE TABLE "PaymentStatusHistory", "PaymentAuditLog", "Refund", "Memo", "Attachment", "PaymentReceipt", "TransactionAnalytics", "Payout", "Collection", "BankingPayment", "EscrowTransaction", "EscrowPayment", "PaymentIntent", "Tag" RESTART IDENTITY CASCADE;`;
          console.log('✅ Tables truncated successfully!');
        } catch (truncateError) {
          console.error('❌ Truncate failed:', truncateError);
          console.log(
            '\n💡 You may need to manually clean the database or restart with a fresh schema',
          );
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Add a convenience function to clean before every test
async function cleanBeforeTest() {
  console.log('\n🧪 PREPARING FOR FRESH TEST');
  console.log('===========================');
  await cleanTransactionTables();
  console.log('\n🚀 Database ready for testing!\n');
}

// If called directly, run the cleanup
if (require.main === module) {
  cleanBeforeTest().catch(console.error);
}

module.exports = { cleanTransactionTables, cleanBeforeTest };
