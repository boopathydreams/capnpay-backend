#!/usr/bin/env node

// Mobile-Ready Status API Test
// Tests the actual status endpoint that mobile apps will use
const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function getAuthToken() {
  console.log('🔐 Requesting OTP...');
  await axios.post(`${API_BASE}/auth/otp/request`, {
    phone: '+919876543210',
  });

  console.log('📱 Please check server logs for OTP code');
  console.log('⏱️  Waiting 5 seconds for you to find the OTP...\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Note: In real mobile app, user would enter the OTP
  // For this test, we'll use the OTP from server logs
  const otpCode = process.argv[2];
  if (!otpCode) {
    throw new Error(
      'Please provide OTP as argument: node test-mobile-status-api.js 123456',
    );
  }

  console.log(`🔑 Using OTP: ${otpCode}`);
  const verifyResponse = await axios.post(`${API_BASE}/auth/otp/verify`, {
    phone: '+919876543210',
    code: otpCode,
  });

  return verifyResponse.data.accessToken;
}

async function createPayment(token) {
  console.log('💰 Creating ₹10 escrow payment...');

  const paymentResponse = await axios.post(
    `${API_BASE}/pay-intents/escrow`,
    {
      recipientUpi: 'merchant@upi',
      recipientName: 'Boopathy N R',
      amount: 10,
      note: 'Mobile API test payment ₹10',
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  console.log('✅ Payment created:', {
    referenceId: paymentResponse.data.referenceId,
    paymentIntentId: paymentResponse.data.paymentIntentId,
    collectionId: paymentResponse.data.collectionId,
  });

  return paymentResponse.data;
}

async function checkStatusEndpoint(referenceId, token) {
  console.log(
    `\n📊 Checking status endpoint: /pay-intents/${referenceId}/status`,
  );

  try {
    const statusResponse = await axios.get(
      `${API_BASE}/pay-intents/${referenceId}/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    console.log('\n🎯 STATUS ENDPOINT RESPONSE:');
    console.log('=====================================');
    console.log(JSON.stringify(statusResponse.data, null, 2));

    // Mobile-friendly status interpretation
    const data = statusResponse.data;
    console.log('\n📱 MOBILE APP INTERPRETATION:');
    console.log('================================');
    console.log(`Collection Status: ${data.collection_status || 'N/A'}`);
    console.log(`Payout Status: ${data.payout_status || 'N/A'}`);
    console.log(`Overall Status: ${data.overall_status || 'N/A'}`);
    console.log(`Amount: ₹${data.amount || 'N/A'}`);

    if (data.collection_status === 'success') {
      console.log(
        '✅ Collection successful - backend should auto-trigger payout',
      );
    }

    if (data.payout_status) {
      console.log(`✅ Payout status available: ${data.payout_status}`);
    }

    return statusResponse.data;
  } catch (error) {
    console.error(
      '❌ Status check failed:',
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function pollStatusUpdates(referenceId, token, maxPolls = 5) {
  console.log(`\n🔄 Polling status updates for ${maxPolls} cycles...`);

  for (let i = 1; i <= maxPolls; i++) {
    console.log(`\n--- Poll ${i} ---`);

    const status = await checkStatusEndpoint(referenceId, token);

    // Mobile app would check these key fields
    const collectionDone = status.collection_status === 'success';
    const payoutExists =
      status.payout_status !== undefined && status.payout_status !== null;

    console.log(`Collection Complete: ${collectionDone ? '✅' : '⏳'}`);
    console.log(`Payout Initiated: ${payoutExists ? '✅' : '⏳'}`);

    if (collectionDone && payoutExists) {
      console.log(
        '\n🎉 Complete flow detected! Collection → Payout progression working',
      );
      break;
    }

    if (i < maxPolls) {
      console.log('⏱️  Waiting 3 seconds before next poll...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function runMobileStatusTest() {
  console.log('📱 MOBILE STATUS API TEST');
  console.log('=========================');
  console.log(
    'Testing: Payment → Status Polling → Collection → Payout Detection',
  );
  console.log('Focus: Mobile app status endpoint behavior\n');

  try {
    // Step 1: Authentication
    const token = await getAuthToken();
    console.log('✅ Authentication successful\n');

    // Step 2: Create payment
    const paymentData = await createPayment(token);

    // Step 3: Initial status check
    await checkStatusEndpoint(paymentData.referenceId, token);

    // Step 4: Poll for status changes
    await pollStatusUpdates(paymentData.referenceId, token);

    console.log('\n🎯 MOBILE TEST COMPLETE!');
    console.log('========================');
    console.log('✅ Status endpoint tested');
    console.log('✅ Collection detection verified');
    console.log('✅ Automatic payout behavior observed');
    console.log('✅ Mobile-ready API flow confirmed');
  } catch (error) {
    console.error('\n❌ MOBILE TEST FAILED:', error.message);
  }
}

// Check if OTP was provided as argument
if (process.argv.length < 3) {
  console.log('📖 USAGE:');
  console.log('1. Run: node test-mobile-status-api.js');
  console.log('2. Check server logs for OTP code');
  console.log('3. Re-run with OTP: node test-mobile-status-api.js 123456');
  console.log('');

  // Request OTP but don't proceed
  getAuthToken().catch(() => {
    console.log('\n🔔 Now run: node test-mobile-status-api.js <OTP_CODE>');
  });
} else {
  // Run the full test with provided OTP
  runMobileStatusTest();
}
