#!/usr/bin/env node

// Complete Mobile Payment Flow Test
// Simulates: Payment Creation -> Collection Polling -> Payout Initiation -> Payout Polling -> Final Status
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const API_BASE = 'http://localhost:3000';
const prisma = new PrismaClient();

// Get auth token first
async function getAuthToken() {
  try {
    const response = await axios.post(`${API_BASE}/auth/otp/request`, {
      phone: '+919876543210'
    });

    // In dev mode, get the OTP code
    const otpCode = response.data.devCode || '123456';

    const verifyResponse = await axios.post(`${API_BASE}/auth/otp/verify`, {
      phone: '+919876543210',
      code: otpCode
    });

    return verifyResponse.data.accessToken;
  } catch (error) {
    console.error('❌ Auth failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createPayment(token) {
  console.log('\n🚀 STEP 1: CREATING PAYMENT (₹10)');
  console.log('=====================================');

  try {
    const response = await axios.post(`${API_BASE}/pay-intents/escrow`, {
      amount: 10,
      recipientVpa: 'merchant@upi',
      recipientName: 'Test Merchant',
      category: 'food',
      note: 'Mobile flow test payment ₹10'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Payment created successfully!');
    console.log(`   - Reference ID: ${response.data.referenceId}`);
    console.log(`   - Payment Intent ID: ${response.data.paymentIntentId}`);
    console.log(`   - Banking Payment ID: ${response.data.bankingPaymentId}`);
    console.log(`   - Collection ID: ${response.data.collectionId}`);
    console.log(`   - Status: ${response.data.status}`);

    return response.data;
  } catch (error) {
    console.error('❌ Payment creation failed:', error.response?.data || error.message);
    throw error;
  }
    const otpCode = otpResponse.data.devCode || '123456';
    console.log(`🔑 Verifying OTP with code: ${otpCode}`);

    const verifyResponse = await axios.post(`${API_BASE_URL}/auth/otp/verify`, {
      phone: testPhone,
      code: otpCode,
    });

    authToken = verifyResponse.data.accessToken;
    testUserId = verifyResponse.data.user.id;

    console.log('✅ Authentication successful');
    console.log(`   User ID: ${testUserId}`);
    console.log(`   Token: ${authToken.substring(0, 20)}...`);

    return true;
  } catch (error) {
    console.error(
      '❌ Authentication failed:',
      error.response?.data || error.message,
    );
    return false;
  }
}

async function setupTestData() {
  console.log('\n🔧 Setting up test data...');

  try {
    // Authenticate user (this will create user if not exists)
    const authSuccess = await authenticateTestUser();
    if (!authSuccess) {
      throw new Error('Authentication failed');
    }

    // Create VPA registry entry if not exists
    const existingVpa = await prisma.vpaRegistry.findUnique({
      where: { vpaAddress: PAYER_UPI },
    });

    if (!existingVpa) {
      await prisma.vpaRegistry.create({
        data: {
          vpaAddress: PAYER_UPI,
          userId: testUserId,
          isPrimary: true,
          isVerified: true,
        },
      });
      console.log(`✅ Created VPA registry entry: ${PAYER_UPI}`);
    } else {
      // Update existing VPA to ensure it's primary
      await prisma.vpaRegistry.update({
        where: { vpaAddress: PAYER_UPI },
        data: { isPrimary: true, isVerified: true },
      });
      console.log(`✅ Updated VPA registry entry to primary: ${PAYER_UPI}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to setup test data:', error.message);
    return false;
  }
}

async function step1_CreatePaymentIntent() {
  console.log('\n📱 Step 1: Mobile App Creates Payment Intent');
  console.log('='.repeat(60));

  try {
    // First create a regular payment intent
    const paymentResponse = await axios.post(
      `${API_BASE_URL}/pay-intents`,
      {
        amount: TEST_AMOUNT,
        vpa: RECIPIENT_UPI,
        payeeName: 'Test Recipient',
        entrypoint: 'mobile_app',
        noteLong: TEST_NOTE,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const paymentTrRef = paymentResponse.data.tr;

    console.log('✅ Payment Intent created successfully');
    console.log(`   Transaction Reference: ${paymentTrRef}`);
    console.log(`   Amount: ₹${TEST_AMOUNT}`);
    console.log(`   UPI Deep Link: ${paymentResponse.data.upiDeepLink}`);

    // Then create an escrow transaction for webhook testing
    const escrowResponse = await axios.post(
      `${API_BASE_URL}/pay-intents/escrow`,
      {
        amount: TEST_AMOUNT,
        recipientVpa: RECIPIENT_UPI,
        recipientName: 'Test Recipient',
        category: 'other',
        note: TEST_NOTE,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    testEscrowId = escrowResponse.data.referenceId;

    console.log('✅ Escrow transaction created successfully');
    console.log(`   Reference ID: ${testEscrowId}`);
    console.log(`   Collection Links:`, escrowResponse.data.collectionLinks);

    return {
      paymentTrRef,
      escrowId: testEscrowId,
      collectionData: escrowResponse.data.collectionLinks,
    };
  } catch (error) {
    console.error(
      '❌ Failed to create escrow transaction:',
      error.response?.data || error.message,
    );
    return null;
  }
}

async function step2_MobileStatusCheck(paymentTrRef, escrowId) {
  console.log('\n� Step 2: Mobile App Checks Payment Status');
  console.log('='.repeat(60));

  try {
    // Check regular payment intent status
    const paymentStatus = await axios.get(
      `${API_BASE_URL}/pay-intents/${paymentTrRef}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Payment Intent Status Check:');
    console.log(`   Status: ${paymentStatus.data.status}`);
    console.log(`   Amount: ₹${paymentStatus.data.amount}`);

    // Check escrow payment status
    const escrowStatus = await axios.get(
      `${API_BASE_URL}/pay-intents/${escrowId}/status`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Escrow Status Check:');
    console.log(`   Status: ${escrowStatus.data.status}`);
    console.log(`   Collection Status: ${escrowStatus.data.collectionStatus}`);
    console.log(`   Payout Status: ${escrowStatus.data.payoutStatus}`);

    return {
      paymentStatus: paymentStatus.data,
      escrowStatus: escrowStatus.data,
    };
  } catch (error) {
    console.error(
      '❌ Status check failed:',
      error.response?.data || error.message,
    );
    return null;
  }
}

async function step3_SimulateWebhooks() {
  console.log('\n� Step 3: Simulate Decentro Webhooks (Background Updates)');
  console.log('='.repeat(60));

  console.log('📱 User completes payment in their UPI app...');
  console.log('🔄 Decentro sends collection webhook to update status...');

  // Simulate collection webhook from Decentro
  const collectionWebhook = {
    reference_id: testEscrowId,
    transaction_id: 'COLL_' + Date.now(),
    status: 'SUCCESS',
    utr: 'UTR' + Date.now(),
    amount: TEST_AMOUNT,
    payer_vpa: PAYER_UPI,
    event_time: new Date().toISOString(),
    message: 'Payment successful',
  };

  try {
    const collectionResponse = await axios.post(
      `${API_BASE_URL}/decentro/webhooks/collection`,
      collectionWebhook,
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );

    console.log('✅ Collection webhook processed');
    console.log(`   Response: ${JSON.stringify(collectionResponse.data)}`);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('🔄 Decentro sends payout webhook to update status...');

    // Simulate payout webhook from Decentro
    const payoutWebhook = {
      reference_id: testEscrowId,
      transaction_id: 'PAYOUT_' + Date.now(),
      status: 'SUCCESS',
      utr: 'UTR_PAYOUT_' + Date.now(),
      amount: TEST_AMOUNT * 0.95, // Minus fees
      payee_vpa: RECIPIENT_UPI,
      message: 'Payout successful',
    };

    const payoutResponse = await axios.post(
      `${API_BASE_URL}/decentro/webhooks/payout`,
      payoutWebhook,
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );

    console.log('✅ Payout webhook processed');
    console.log(`   Response: ${JSON.stringify(payoutResponse.data)}`);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      collectionWebhook,
      payoutWebhook,
    };
  } catch (error) {
    console.error(
      '❌ Webhook processing failed:',
      error.response?.data || error.message,
    );
    return null;
  }
}

async function step4_MobileStatusUpdate(paymentTrRef, escrowId) {
  console.log('\n� Step 4: Mobile App Checks Updated Status');
  console.log('='.repeat(60));

  try {
    // Mobile app checks status after webhooks have updated data
    const paymentStatus = await axios.get(
      `${API_BASE_URL}/pay-intents/${paymentTrRef}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Updated Payment Intent Status:');
    console.log(`   Status: ${paymentStatus.data.status}`);

    // Check escrow payment status after webhooks
    const escrowStatus = await axios.get(
      `${API_BASE_URL}/pay-intents/${escrowId}/status`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Updated Escrow Status:');
    console.log(`   Status: ${escrowStatus.data.status}`);
    console.log(`   Collection Status: ${escrowStatus.data.collectionStatus}`);
    console.log(`   Payout Status: ${escrowStatus.data.payoutStatus}`);

    // If completed, mobile app can show receipt
    if (
      escrowStatus.data.status === 'COMPLETED' ||
      escrowStatus.data.status === 'SUCCESS'
    ) {
      console.log('� Mobile app should now show payment receipt');
      return {
        showReceipt: true,
        paymentStatus: paymentStatus.data,
        escrowStatus: escrowStatus.data,
      };
    } else {
      console.log('� Mobile app should show payment in progress');
      return {
        showReceipt: false,
        paymentStatus: paymentStatus.data,
        escrowStatus: escrowStatus.data,
      };
    }
  } catch (error) {
    console.error(
      '❌ Mobile status update check failed:',
      error.response?.data || error.message,
    );
    return null;
  }
}

async function step5_VerifySystemIntegration() {
  console.log('\n� Step 5: Verify Complete System Integration');
  console.log('='.repeat(60));

  try {
    // Check EscrowTransaction
    const escrow = await prisma.escrowTransaction.findUnique({
      where: { id: testEscrowId },
    });

    console.log('📊 EscrowTransaction Status:');
    console.log(`   Status: ${escrow?.status || 'NOT_FOUND'}`);
    console.log(
      `   Collection Status: ${escrow?.collectionStatus || 'NOT_SET'}`,
    );
    console.log(`   Payout Status: ${escrow?.payoutStatus || 'NOT_SET'}`);

    // Check Collection records
    const collections = await prisma.collection.count();
    console.log(`📊 Collection Records: ${collections}`);

    // Check Payout records
    const payouts = await prisma.payout.count();
    console.log(`📊 Payout Records: ${payouts}`);

    // Check PaymentIntent integration
    const paymentIntents = await prisma.paymentIntent.count({
      where: {
        trRef: { contains: testEscrowId },
      },
    });
    console.log(`📊 PaymentIntent Records: ${paymentIntents}`);

    // Check BankingPayment integration (linked via collection/payout IDs)
    const escrowCollections = await prisma.collection.findMany({
      where: {
        webhookData: {
          path: ['reference_id'],
          equals: testEscrowId,
        },
      },
      select: { id: true },
    });

    const escrowPayouts = await prisma.payout.findMany({
      where: {
        webhookData: {
          path: ['reference_id'],
          equals: testEscrowId,
        },
      },
      select: { id: true },
    });

    const collectionIds = escrowCollections.map((c) => c.id);
    const payoutIds = escrowPayouts.map((p) => p.id);

    const bankingPayments = await prisma.bankingPayment.count({
      where: {
        OR: [
          { collectionId: { in: collectionIds } },
          { payoutId: { in: payoutIds } },
        ],
      },
    });

    console.log(`� BankingPayment Records: ${bankingPayments}`);

    // Check PaymentReceipt integration (linked via PaymentIntent)
    const receipts = await prisma.paymentReceipt.count({
      where: {
        paymentIntent: {
          trRef: { contains: testEscrowId },
        },
      },
    });
    console.log(`📊 PaymentReceipt Records: ${receipts}`);

    // Calculate integration score
    const checks = [
      escrow?.status === 'COMPLETED',
      escrow?.collectionStatus === 'success',
      escrow?.payoutStatus === 'success',
      collections > 0,
      payouts > 0,
      paymentIntents > 0,
      bankingPayments > 0,
      receipts > 0,
    ];

    const score = checks.filter(Boolean).length;
    const total = checks.length;

    console.log(`\n🎯 Integration Health Score: ${score}/${total}`);

    if (score === total) {
      console.log('🎉 PERFECT INTEGRATION - All systems working!');
      return { score, total, perfect: true };
    } else if (score >= total * 0.75) {
      console.log('✅ GOOD INTEGRATION - Most systems working');
      return { score, total, perfect: false };
    } else {
      console.log('⚠️ PARTIAL INTEGRATION - Some systems need attention');
      return { score, total, perfect: false };
    }
  } catch (error) {
    console.error('❌ Integration verification failed:', error.message);
    return { score: 0, total: 8, perfect: false };
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');

  try {
    if (testEscrowId) {
      // Delete related records in order
      await prisma.paymentReceipt.deleteMany({
        where: {
          paymentIntent: {
            trRef: { contains: testEscrowId },
          },
        },
      });

      await prisma.bankingPayment.deleteMany({
        where: {
          OR: [
            { collectionTxnNo: { contains: testEscrowId } },
            { payoutTxnNo: { contains: testEscrowId } },
          ],
        },
      });

      await prisma.paymentIntent.deleteMany({
        where: { trRef: { contains: testEscrowId } },
      });

      await prisma.collection.deleteMany({
        where: { decentroTxnId: { contains: testEscrowId } },
      });

      await prisma.payout.deleteMany({
        where: { decentroTxnId: { contains: testEscrowId } },
      });

      await prisma.escrowTransaction.delete({
        where: { id: testEscrowId },
      });

      console.log('✅ Test data cleaned up successfully');
    }
  } catch (error) {
    console.error('⚠️ Cleanup warning:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting Complete Mobile-to-Production Flow Test');
  console.log(
    '📱 Simulating real mobile app payment flow with webhook status updates',
  );
  console.log(
    '🔄 Testing: Mobile Creates Payment → Checks Status → Webhooks Update → Mobile Checks Again → Receipt',
  );
  console.log('='.repeat(80));

  try {
    // Setup
    const setupOk = await setupTestData();
    if (!setupOk) {
      console.log('\n❌ Cannot proceed without test data setup');
      return;
    }

    // Step 1: Create payment intents (mobile app)
    const createResult = await step1_CreatePaymentIntent();
    if (!createResult) {
      console.log('\n❌ Cannot proceed without payment intent creation');
      return;
    }

    // Step 2: Mobile app checks initial status
    const initialStatusResult = await step2_MobileStatusCheck(
      createResult.paymentTrRef,
      createResult.escrowId,
    );
    if (!initialStatusResult) {
      console.log('\n⚠️ Initial status check failed, continuing anyway');
    }

    // Step 3: Simulate webhooks (background status updates)
    const webhookResult = await step3_SimulateWebhooks();
    if (!webhookResult) {
      console.log('\n❌ Cannot proceed without webhook processing');
      return;
    }

    // Step 4: Mobile app checks updated status
    const updateResult = await step4_MobileStatusUpdate(
      createResult.paymentTrRef,
      createResult.escrowId,
    );
    if (!updateResult) {
      console.log('\n❌ Cannot proceed without status update check');
      return;
    }

    // Step 5: Verify complete system integration
    const integrationResult = await step5_VerifySystemIntegration();

    // Final results
    console.log('\n' + '='.repeat(80));
    console.log('🎯 COMPLETE MOBILE FLOW TEST RESULTS:');
    console.log(`✅ Payment Intent Creation: SUCCESS`);
    console.log(
      `✅ Initial Status Check: ${initialStatusResult ? 'SUCCESS' : 'SKIPPED'}`,
    );
    console.log(`✅ Webhook Processing: SUCCESS`);
    console.log(`✅ Status Update Check: SUCCESS`);
    console.log(
      `${updateResult.showReceipt ? '✅' : '⚠️'} Mobile Receipt Ready: ${updateResult.showReceipt ? 'YES' : 'NO'}`,
    );
    console.log(
      `${integrationResult.perfect ? '✅' : '⚠️'} System Integration: ${integrationResult.score}/${integrationResult.total}`,
    );

    if (integrationResult.perfect && updateResult.showReceipt) {
      console.log(
        '\n🎉 COMPLETE SUCCESS! Your mobile app payment flow is production-ready!',
      );
      console.log(
        '📱 Mobile app: Creates payments, checks status, shows receipts',
      );
      console.log('🔗 Webhooks: Update payment status in background');
      console.log('💾 Database: All integration records created correctly');
      console.log('🧾 Receipt: Mobile app knows when to show payment success');
    } else {
      console.log(
        '\n⚠️ PARTIAL SUCCESS - Flow working but some integration needs attention',
      );
      if (!updateResult.showReceipt) {
        console.log(
          '� Mobile app flow: Payment status not showing as completed',
        );
      }
      if (!integrationResult.perfect) {
        console.log('💾 Database integration: Some records missing');
      }
    }

    // Show mobile app perspective
    console.log('\n📱 MOBILE APP PERSPECTIVE:');
    console.log(`   Payment Status: ${updateResult.escrowStatus.status}`);
    console.log(
      `   Should Show Receipt: ${updateResult.showReceipt ? 'YES' : 'NO'}`,
    );
    console.log(
      `   UI State: ${updateResult.showReceipt ? 'Success Screen' : 'In Progress Screen'}`,
    );
  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
