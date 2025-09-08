const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { cleanBeforeTest } = require('./clean-transactables.js');
// Payment      // EscrowTransaction table
const escrowTransactions = await prisma.escrowTransaction.findMany({
  orderBy: { created_at: 'desc' },
  take: 3,
});
const paymentIntents = await prisma.paymentIntent.findMany({
  orderBy: { createdAt: 'desc' },
  take: 3,
});

const BASE_URL = 'http://localhost:3000';
const AUTH_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWY4azU0NGkwMDAwaXQwdm96YjZ4czNoIiwicGhvbmUiOiIrOTE5ODc2NTQzMjEwIiwiaWF0IjoxNzU3MjU3ODk2LCJleHAiOjE3NTczNDQyOTZ9.jxkpXSpMUI4yQ7x52QQ60hwBU9sQPA1zQZ2vwipBicA';

const prisma = new PrismaClient();

// Test configuration
const TEST_CONFIG = {
  recipientVpa: '9876543210@ybl',
  amount: 75,
  description: 'Database verification test payment',
  maxSteps: 20,
  stepDelay: 1000, // 1 second between checks
};

class DatabaseVerificationFlowTest {
  constructor() {
    this.referenceId = null;
    this.stepNumber = 0;
    this.startTime = null;
  }

  async runDatabaseVerificationFlow() {
    console.log('🔬 DATABASE VERIFICATION FLOW TEST');
    console.log('===================================');
    console.log(
      'This test shows EXACTLY what happens in each database table at each step:',
    );
    console.log('1. 📊 Real-time database inspection');
    console.log('2. 🔍 Step-by-step record creation');
    console.log('3. 📋 Complete audit trail');
    console.log('4. 🎯 Mobile implementation roadmap\\n');

    this.startTime = Date.now();

    try {
      // Step 1: Show initial database state
      await this.showDatabaseState('INITIAL - Before Payment Creation');

      // Step 2: Create payment and show what was created
      await this.createPaymentAndInspect();

      // Step 3: Monitor the complete flow with database inspection
      await this.monitorFlowWithDatabaseInspection();

      // Step 4: Final verification
      await this.showFinalDatabaseState();

      // Step 5: Mobile implementation guide
      await this.showMobileImplementationGuide();
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      await this.showDatabaseState('FAILURE STATE');
    } finally {
      await prisma.$disconnect();
    }
  }

  async createPaymentAndInspect() {
    console.log('\\n🚀 STEP 1: PAYMENT CREATION & INSPECTION');
    console.log('==========================================');

    // Create the payment
    console.log('📝 Creating escrow payment...');
    const response = await this.makeRequest('POST', '/pay-intents/escrow', {
      recipientVpa: TEST_CONFIG.recipientVpa,
      amount: TEST_CONFIG.amount,
      description: TEST_CONFIG.description,
    });

    this.referenceId = response.referenceId;
    console.log(`✅ Payment created with reference: ${this.referenceId}`);

    // Immediate database inspection
    await this.showDatabaseState('IMMEDIATELY AFTER CREATION');
  }

  async monitorFlowWithDatabaseInspection() {
    console.log('\\n🔄 STEP 2: FLOW MONITORING WITH DATABASE INSPECTION');
    console.log('=====================================================');

    let flowComplete = false;
    this.stepNumber = 0;

    while (!flowComplete && this.stepNumber < TEST_CONFIG.maxSteps) {
      this.stepNumber++;
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);

      console.log(
        `\\n📊 MONITORING STEP ${this.stepNumber} (${elapsed}s elapsed)`,
      );
      console.log('─'.repeat(50));

      // Get current status from API
      const status = await this.getEscrowStatus();
      console.log('📋 API Status:', {
        status: status.status,
        stage: status.stage,
        collectionStatus: status.collection_status,
        payoutStatus: status.payout_status,
        collectionId: status.collection_id,
        payoutId: status.payout_id,
      });

      // Show current database state
      await this.showDatabaseState(`STEP ${this.stepNumber}`);

      // Check if flow is complete
      if (
        status.status === 'COMPLETED' &&
        status.collection_status === 'success' &&
        status.payout_status === 'success'
      ) {
        console.log('\\n🎉 FLOW COMPLETED!');
        flowComplete = true;
      } else {
        console.log(
          `⏳ Flow not complete yet. Waiting ${TEST_CONFIG.stepDelay}ms...`,
        );
        await this.sleep(TEST_CONFIG.stepDelay);
      }
    }

    if (!flowComplete) {
      console.log('\\n⚠️ Flow did not complete within maximum steps');
    }
  }

  async showDatabaseState(label) {
    console.log(`\\n📋 DATABASE STATE: ${label}`);
    console.log('='.repeat(60));

    try {
      // PaymentIntent table
      const paymentIntents = await prisma.paymentIntent.findMany({
        orderBy: { created_at: 'desc' },
        take: 3,
      });
      console.log(`\\n📱 PaymentIntent (${paymentIntents.length} records):`);
      paymentIntents.forEach((pi, i) => {
        console.log(
          `  ${i + 1}. ID: ${pi.id} | Amount: ₹${pi.amount} | VPA: ${pi.vpa} | Status: ${pi.status || 'N/A'}`,
        );
      });

      // EscrowTransaction table
      const escrowTransactions = await prisma.escrowTransaction.findMany({
        orderBy: { created_at: 'desc' },
        take: 3,
      });
      console.log(
        `\\n🏦 EscrowTransaction (${escrowTransactions.length} records):`,
      );
      escrowTransactions.forEach((et, i) => {
        console.log(
          `  ${i + 1}. RefID: ${et.reference_id} | Amount: ₹${et.amount} | Status: ${et.status} | CollectionStatus: ${et.collectionStatus || 'N/A'} | PayoutStatus: ${et.payoutStatus || 'N/A'}`,
        );
      });

      // Collection table
      const collections = await prisma.collection.findMany({
        orderBy: { created_at: 'desc' },
        take: 3,
      });
      console.log(`\\n💰 Collection (${collections.length} records):`);
      collections.forEach((c, i) => {
        console.log(
          `  ${i + 1}. ID: ${c.collection_id || c.id} | Status: ${c.status} | Amount: ₹${c.amount || 'N/A'} | Created: ${c.created_at?.toISOString().substr(11, 8)}`,
        );
      });

      // Payout table
      const payouts = await prisma.payout.findMany({
        orderBy: { created_at: 'desc' },
        take: 3,
      });
      console.log(`\\n💸 Payout (${payouts.length} records):`);
      payouts.forEach((p, i) => {
        console.log(
          `  ${i + 1}. ID: ${p.payout_id || p.id} | Status: ${p.status} | Amount: ₹${p.amount || 'N/A'} | Created: ${p.created_at?.toISOString().substr(11, 8)}`,
        );
      });

      // BankingPayment table
      const bankingPayments = await prisma.bankingPayment.findMany({
        orderBy: { created_at: 'desc' },
        take: 3,
      });
      console.log(`\\n🏛️  BankingPayment (${bankingPayments.length} records):`);
      bankingPayments.forEach((bp, i) => {
        console.log(
          `  ${i + 1}. ID: ${bp.id} | Overall: ${bp.overallStatus} | Collection: ${bp.collectionStatus} | Payout: ${bp.payoutStatus} | Amount: ₹${bp.amount}`,
        );
      });

      // PaymentReceipt table
      const receipts = await prisma.paymentReceipt.findMany({
        orderBy: { created_at: 'desc' },
        take: 3,
      });
      console.log(`\\n🧾 PaymentReceipt (${receipts.length} records):`);
      if (receipts.length === 0) {
        console.log('  (No receipts found)');
      } else {
        receipts.forEach((r, i) => {
          console.log(
            `  ${i + 1}. ID: ${r.id} | PaymentID: ${r.payment_intent_id} | Amount: ₹${r.final_amount} | Status: ${r.status}`,
          );
        });
      }

      // PaymentAuditLog table
      const auditLogs = await prisma.paymentAuditLog.findMany({
        where: this.referenceId
          ? {
              details: {
                path: ['referenceId'],
                equals: this.referenceId,
              },
            }
          : {},
        orderBy: { timestamp: 'desc' },
        take: 5,
      });
      console.log(`\\n📝 PaymentAuditLog (${auditLogs.length} records):`);
      if (auditLogs.length === 0) {
        console.log('  (No audit logs found)');
      } else {
        auditLogs.forEach((al, i) => {
          console.log(
            `  ${i + 1}. Action: ${al.action} | Details: ${JSON.stringify(al.details).substr(0, 60)}... | Time: ${al.timestamp.toISOString().substr(11, 8)}`,
          );
        });
      }

      // PaymentStatusHistory table
      const statusHistory = await prisma.paymentStatusHistory.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      console.log(
        `\\n📊 PaymentStatusHistory (${statusHistory.length} records):`,
      );
      if (statusHistory.length === 0) {
        console.log('  (No status history found)');
      } else {
        statusHistory.forEach((sh, i) => {
          console.log(
            `  ${i + 1}. PaymentID: ${sh.paymentId} | Status: ${sh.status} | SubStatus: ${sh.subStatus || 'N/A'} | Time: ${sh.createdAt.toISOString().substr(11, 8)}`,
          );
        });
      }
    } catch (error) {
      console.error(`❌ Database inspection failed: ${error.message}`);
    }
  }

  async showFinalDatabaseState() {
    console.log('\\n🏁 FINAL DATABASE STATE VERIFICATION');
    console.log('======================================');

    await this.showDatabaseState('FINAL STATE');

    // Count total records created
    const counts = await this.getDatabaseCounts();

    console.log('\\n📈 TOTAL RECORDS CREATED:');
    console.log('──────────────────────────');
    Object.entries(counts).forEach(([table, count]) => {
      console.log(`  ${table}: ${count} records`);
    });

    console.log('\\n✅ Database verification complete!');
  }

  async getDatabaseCounts() {
    return {
      PaymentIntent: await prisma.paymentIntent.count(),
      EscrowTransaction: await prisma.escrowTransaction.count(),
      Collection: await prisma.collection.count(),
      Payout: await prisma.payout.count(),
      BankingPayment: await prisma.bankingPayment.count(),
      PaymentReceipt: await prisma.paymentReceipt.count(),
      PaymentAuditLog: await prisma.paymentAuditLog.count(),
      PaymentStatusHistory: await prisma.paymentStatusHistory.count(),
    };
  }

  async showMobileImplementationGuide() {
    console.log('\\n📱 MOBILE IMPLEMENTATION GUIDE');
    console.log('================================');

    console.log(
      'Based on this flow, here is what your mobile app should do:\n',
    );

    console.log('🔄 STEP-BY-STEP MOBILE FLOW:');
    console.log('1. 📱 POST /pay-intents/escrow → Get referenceId');
    console.log(
      '2. 🔄 Poll GET /pay-intents/{referenceId}/status every 2-3 seconds',
    );
    console.log('3. 👀 Watch for these status progressions:');
    console.log('   ├─ collection_status: pending → processing → success');
    console.log('   ├─ payout_status: pending → processing → success');
    console.log('   └─ overall status: INITIATED → PROCESSING → COMPLETED');
    console.log('4. 🎉 Show success when status === "COMPLETED"');
    console.log('5. 🧾 Display receipt with final details\\n');

    console.log('⚡ KEY MOBILE CONSIDERATIONS:');
    console.log('├─ Timeout: Stop polling after 5 minutes');
    console.log('├─ Error handling: Watch for "failed" status');
    console.log('├─ UI feedback: Show progress based on stage');
    console.log('├─ Offline support: Cache last known status');
    console.log('└─ Deep linking: Handle payment completion redirects\\n');

    console.log('🎯 MOBILE STATES TO HANDLE:');
    console.log('├─ "collection_pending" → "Waiting for payment..."');
    console.log('├─ "collection_processing" → "Processing payment..."');
    console.log('├─ "collection_success" → "Payment received!"');
    console.log('├─ "payout_processing" → "Transferring to recipient..."');
    console.log('├─ "completed" → "Payment completed successfully!"');
    console.log('└─ "failed" → "Payment failed. Please try again."');

    console.log('\\n🚀 Ready for PaymentFlowManagerV2 implementation!');
  }

  // Helper methods
  async getEscrowStatus() {
    return await this.makeRequest(
      'GET',
      `/pay-intents/${this.referenceId}/status`,
    );
  }

  async makeRequest(method, endpoint, data = null) {
    const config = {
      method: method.toLowerCase(),
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  // Clean all transaction tables before running the test
  await cleanBeforeTest();

  const test = new DatabaseVerificationFlowTest();
  await test.runDatabaseVerificationFlow();
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\\n🛑 Test interrupted by user');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DatabaseVerificationFlowTest };
