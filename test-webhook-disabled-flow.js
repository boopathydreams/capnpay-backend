const axios = require('axios');
const { cleanBeforeTest } = require('./clean-transaction-tables.js');

const BASE_URL = 'http://localhost:3000';
const AUTH_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWY4azU0NGkwMDAwaXQwdm96YjZ4czNoIiwicGhvbmUiOiIrOTE5ODc2NTQzMjEwIiwiaWF0IjoxNzU3MjU3ODk2LCJleHAiOjE3NTczNDQyOTZ9.jxkpXSpMUI4yQ7x52QQ60hwBU9sQPA1zQZ2vwipBicA';

// Test configuration
const TEST_CONFIG = {
  userId: 'cm3u6y2dv0000pqfvfajmfbdb', // Replace with valid user ID
  recipientVpa: '9876543210@ybl',
  amount: 10,
  description: 'Test webhook-disabled flow',
  maxWaitTime: 5 * 60 * 1000, // 5 minutes
  pollInterval: 3000, // 3 seconds
};

class WebhookDisabledFlowTest {
  constructor() {
    this.referenceId = null;
    this.startTime = null;
    this.pollingInterval = null;
  }

  async runCompleteFlow() {
    console.log('🚀 Starting webhook-disabled payment flow test...\n');

    try {
      // Step 1: Create escrow payment
      await this.createEscrowPayment();

      // Step 2: Start status monitoring
      await this.startStatusMonitoring();
    } catch (error) {
      console.error('❌ Flow failed:', error.message);
      this.cleanup();
    }
  }

  async createEscrowPayment() {
    console.log('📝 Step 1: Creating escrow payment...');

    try {
      const response = await axios.post(
        `${BASE_URL}/pay-intents/escrow`,
        {
          recipientVpa: TEST_CONFIG.recipientVpa,
          amount: TEST_CONFIG.amount,
          description: TEST_CONFIG.description,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${AUTH_TOKEN}`,
          },
        },
      );

      this.referenceId = response.data.referenceId;
      console.log(`✅ Escrow created with reference ID: ${this.referenceId}`);
      console.log('📋 Escrow details:', {
        referenceId: this.referenceId,
        amount: response.data.amount,
        recipientVpa: response.data.recipientUpi,
        status: response.data.status,
      });
      console.log('');
    } catch (error) {
      console.error(
        '❌ Failed to create escrow:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async startStatusMonitoring() {
    console.log('📊 Step 2: Starting database-first status monitoring...');
    console.log(
      `⏱️  Will check status every ${TEST_CONFIG.pollInterval / 1000} seconds for up to ${TEST_CONFIG.maxWaitTime / 60000} minutes\n`,
    );

    this.startTime = Date.now();

    // Check status immediately
    await this.checkStatus();

    // Then start polling
    this.pollingInterval = setInterval(async () => {
      try {
        if (Date.now() - this.startTime > TEST_CONFIG.maxWaitTime) {
          console.log('⏰ Timeout reached');
          this.cleanup();
          return;
        }

        await this.checkStatus();
      } catch (error) {
        console.error('❌ Status check error:', error.message);
      }
    }, TEST_CONFIG.pollInterval);
  }

  async checkStatus() {
    if (!this.referenceId) return;

    const elapsed = Math.round((Date.now() - this.startTime) / 1000);

    try {
      // Use the escrow status endpoint (database-first)
      const response = await axios.get(
        `${BASE_URL}/pay-intents/${this.referenceId}/status`,
        {
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
          },
        },
      );
      const status = response.data;

      console.log(`📊 [${elapsed}s] Status check:`, {
        stage: status.stage || 'unknown',
        collectionStatus: status.collection_status || 'pending',
        payoutStatus: status.payout_status || 'pending',
        message: this.getStatusMessage(
          status.stage,
          status.collection_status,
          status.payout_status,
        ),
      });

      // Check for completion or failure
      if (
        status.stage === 'completed' ||
        (status.collection_status === 'success' &&
          status.payout_status === 'success')
      ) {
        console.log('\n✅ Payment completed successfully!');
        console.log('🧾 Final receipt:', {
          referenceId: this.referenceId,
          amount: status.escrow?.amount,
          recipientVpa: status.escrow?.payment_intent?.target_upi,
          completedAt: new Date().toISOString(),
          totalTime: `${elapsed}s`,
        });
        this.cleanup();
      } else if (
        status.stage === 'collection_failed' ||
        status.collection_status === 'failed'
      ) {
        console.log('\n❌ Payment failed - collection failed');
        this.cleanup();
      } else if (
        status.stage === 'payout_failed' ||
        status.payout_status === 'failed'
      ) {
        console.log('\n❌ Payment failed - payout failed');
        this.cleanup();
      }
    } catch (error) {
      console.error(
        `❌ [${elapsed}s] Status check failed:`,
        error.response?.data || error.message,
      );
    }
  }

  async demonstrateBankingEndpoints() {
    if (!this.referenceId) {
      console.log('❌ No reference ID available for banking endpoint demo');
      return;
    }

    console.log('\n🏦 Demonstrating new banking status endpoints...');

    try {
      // Test collection status endpoint
      const collectionResponse = await axios.get(
        `${BASE_URL}/banking/payments/${this.referenceId}/collection-status`,
      );
      console.log('📥 Collection status:', collectionResponse.data);

      // Test payout status endpoint
      const payoutResponse = await axios.get(
        `${BASE_URL}/banking/payments/${this.referenceId}/payout-status`,
      );
      console.log('📤 Payout status:', payoutResponse.data);

      // Test complete status endpoint
      const completeResponse = await axios.get(
        `${API_BASE_URL}/banking/payments/${this.referenceId}/complete-status`,
      );
      console.log('🔄 Complete status:', completeResponse.data);
    } catch (error) {
      console.log(
        'ℹ️  Banking endpoints not available (expected for escrow-based payments)',
      );
      console.log(
        '   These endpoints work with banking payments created via /banking/payments',
      );
    }
  }

  async simulateWebhookUpdates() {
    if (!this.referenceId) return;

    console.log('\n🔄 Simulating webhook updates to test the flow...');

    try {
      // Simulate collection success (in real scenario, this comes from Decentro webhook)
      console.log('📥 Simulating collection success...');

      // This would normally be called by webhook, but we can test it manually
      // await this.updateCollectionStatus('success');

      // Wait a bit, then simulate payout processing
      setTimeout(async () => {
        console.log('📤 Simulating payout processing...');
        // await this.updatePayoutStatus('processing');

        // Then simulate payout success
        setTimeout(async () => {
          console.log('📤 Simulating payout success...');
          // await this.updatePayoutStatus('success');
        }, 2000);
      }, 2000);
    } catch (error) {
      console.error('❌ Simulation error:', error.message);
    }
  }

  getStatusMessage(stage, collectionStatus, payoutStatus) {
    switch (stage) {
      case 'collection_pending':
        return 'Waiting for payment collection...';
      case 'collection_processing':
        return 'Processing your payment...';
      case 'collection_success':
        return 'Payment received! Processing payout to recipient...';
      case 'payout_initiated':
        return 'Payout initiated to recipient...';
      case 'payout_processing':
        return 'Transferring funds to recipient...';
      case 'completed':
        return 'Payment completed successfully!';
      case 'collection_failed':
        return 'Payment collection failed';
      case 'payout_failed':
        return 'Payout to recipient failed';
      default:
        if (collectionStatus === 'success' && payoutStatus === 'pending') {
          return 'Payment received! Initiating payout...';
        }
        return 'Processing payment...';
    }
  }

  cleanup() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('\n🔄 Stopped status monitoring');
    }
  }
}

// Run the test
async function main() {
  // Clean all transaction tables before running the test
  await cleanBeforeTest();

  const test = new WebhookDisabledFlowTest();

  console.log('🧪 WEBHOOK-DISABLED PAYMENT FLOW TEST');
  console.log('====================================');
  console.log(
    'This test demonstrates the complete payment flow without webhooks:',
  );
  console.log(
    '1. Create escrow payment (payment intent + escrow + collection)',
  );
  console.log('2. Poll status using database-first approach');
  console.log('3. Automatic payout when collection succeeds');
  console.log('4. Complete when payout succeeds');
  console.log('');

  await test.runCompleteFlow();

  // Also demonstrate the new banking endpoints
  setTimeout(() => {
    test.demonstrateBankingEndpoints();
  }, 5000);

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Test interrupted by user');
    test.cleanup();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('🚨 Test failed:', error.message);
    process.exit(1);
  });
}

module.exports = WebhookDisabledFlowTest;
