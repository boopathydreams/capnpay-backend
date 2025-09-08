#!/usr/bin/env node

// Database verification script to check what records were created
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabaseRecords() {
  console.log('🔍 CHECKING DATABASE RECORDS AFTER ESCROW CREATION');
  console.log('==================================================');

  try {
    // Check all transaction-related tables
    const paymentIntents = await prisma.paymentIntent.count();
    const escrowTransactions = await prisma.escrowTransaction.count();
    const bankingPayments = await prisma.bankingPayment.count();
    const collections = await prisma.collection.count();
    const payouts = await prisma.payout.count();
    const paymentReceipts = await prisma.paymentReceipt.count();
    const auditLogs = await prisma.paymentAuditLog.count();
    const statusHistory = await prisma.paymentStatusHistory.count();

    console.log('\n📊 RECORD COUNTS BY TABLE:');
    console.log(`├─ PaymentIntent: ${paymentIntents} records`);
    console.log(`├─ EscrowTransaction: ${escrowTransactions} records`);
    console.log(`├─ BankingPayment: ${bankingPayments} records`);
    console.log(`├─ Collection: ${collections} records`);
    console.log(`├─ Payout: ${payouts} records`);
    console.log(`├─ PaymentReceipt: ${paymentReceipts} records`);
    console.log(`├─ PaymentAuditLog: ${auditLogs} records`);
    console.log(`└─ PaymentStatusHistory: ${statusHistory} records`);

    // Get detailed records to verify relationships
    if (paymentIntents > 0) {
      console.log('\n💡 LATEST PAYMENT INTENT:');
      const latestIntent = await prisma.paymentIntent.findFirst({
        orderBy: { initiatedAt: 'desc' },
      });
      console.log(`   - ID: ${latestIntent.id}`);
      console.log(`   - Reference: ${latestIntent.trRef}`);
      console.log(`   - Amount: ₹${latestIntent.amount}`);
      console.log(`   - Status: ${latestIntent.status}`);
      console.log(`   - VPA: ${latestIntent.vpa}`);
    }

    if (bankingPayments > 0) {
      console.log('\n💰 LATEST BANKING PAYMENT:');
      const latestBanking = await prisma.bankingPayment.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          collection: true,
          auditLogs: true,
          statusHistory: true,
        },
      });
      console.log(`   - ID: ${latestBanking.id}`);
      console.log(`   - Payment Type: ${latestBanking.paymentType}`);
      console.log(`   - Overall Status: ${latestBanking.overallStatus}`);
      console.log(`   - Collection Status: ${latestBanking.collectionStatus}`);
      console.log(`   - Payout Status: ${latestBanking.payoutStatus}`);
      console.log(`   - Collection Linked: ${latestBanking.collection ? '✅ YES' : '❌ NO'}`);
      console.log(`   - Audit Logs: ${latestBanking.auditLogs.length} records`);
      console.log(`   - Status History: ${latestBanking.statusHistory.length} records`);
    }

    if (collections > 0) {
      console.log('\n📥 LATEST COLLECTION:');
      const latestCollection = await prisma.collection.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      console.log(`   - ID: ${latestCollection.id}`);
      console.log(`   - Decentro TXN ID: ${latestCollection.decentroTxnId}`);
      console.log(`   - Amount: ₹${latestCollection.amount}`);
      console.log(`   - Status: ${latestCollection.status}`);
    }

    if (escrowTransactions > 0) {
      console.log('\n🔒 LATEST ESCROW TRANSACTION:');
      const latestEscrow = await prisma.escrowTransaction.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      console.log(`   - ID: ${latestEscrow.id}`);
      console.log(`   - Payer UPI: ${latestEscrow.payerUpi}`);
      console.log(`   - Recipient UPI: ${latestEscrow.recipientUpi}`);
      console.log(`   - Amount: ₹${latestEscrow.amount}`);
      console.log(`   - Status: ${latestEscrow.status}`);
      console.log(`   - Collection Status: ${latestEscrow.collectionStatus}`);
      console.log(`   - Payout Status: ${latestEscrow.payoutStatus}`);
    }

    // Check success criteria
    const requiredTables = {
      'PaymentIntent': paymentIntents,
      'BankingPayment': bankingPayments,
      'Collection': collections,
      'EscrowTransaction': escrowTransactions,
      'PaymentAuditLog': auditLogs,
      'PaymentStatusHistory': statusHistory,
    };

    const missingTables = Object.entries(requiredTables)
      .filter(([table, count]) => count === 0)
      .map(([table]) => table);

    console.log('\n🎯 IMPLEMENTATION STATUS:');
    if (missingTables.length === 0) {
      console.log('✅ SUCCESS! All critical tables have records');
      console.log('✅ Complete payment flow implementation working');
    } else {
      console.log(`❌ MISSING RECORDS in: ${missingTables.join(', ')}`);
      console.log('❌ Implementation incomplete');
    }

    console.log('\n📋 SUMMARY:');
    console.log(`   Total transaction records created: ${Object.values(requiredTables).reduce((a, b) => a + b, 0)}`);
    console.log(`   Tables with data: ${6 - missingTables.length}/6`);
    console.log(`   Implementation completeness: ${Math.round(((6 - missingTables.length) / 6) * 100)}%`);

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseRecords();
