#!/usr/bin/env node

// Test to verify Payout table creation during escrow flow
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const API_BASE = 'http://localhost:3000';
const prisma = new PrismaClient();

async function getAuthToken() {
  try {
    const response = await axios.post(`${API_BASE}/auth/otp/request`, {
      phone: '+919876543210',
    });

    const otpCode = response.data.devCode || '123456';

    const verifyResponse = await axios.post(`${API_BASE}/auth/otp/verify`, {
      phone: '+919876543210',
      code: otpCode,
    });

    return verifyResponse.data.accessToken;
  } catch (error) {
    console.error('❌ Auth failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testPayoutTableCreation() {
  console.log('\n🧪 TESTING PAYOUT TABLE CREATION');
  console.log('=====================================');

  try {
    const token = await getAuthToken();
    console.log('✅ Authentication successful');

    // Create escrow payment
    console.log('\n📝 Creating escrow payment...');
    const paymentResponse = await axios.post(
      `${API_BASE}/pay-intents/escrow`,
      {
        amount: 10,
        recipientVpa: 'merchant@upi',
        recipientName: 'Test Merchant',
        category: 'food',
        note: 'Payout table test ₹10',
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const referenceId = paymentResponse.data.escrow.id;
    console.log(`✅ Payment created: ${referenceId}`);

    // Wait for automatic payout initiation (collection will be detected as successful)
    console.log('\n⏳ Waiting for automatic payout initiation...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check status endpoint
    const statusResponse = await axios.get(
      `${API_BASE}/pay-intents/${referenceId}/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    console.log('\n📊 Status Response:');
    console.log(
      `   - Collection Status: ${statusResponse.data.collection_status}`,
    );
    console.log(`   - Payout Status: ${statusResponse.data.payout_status}`);
    console.log(`   - Payout ID: ${statusResponse.data.payout_id}`);

    // Check if Payout table record was created
    console.log('\n🔍 Checking Payout table...');
    const payouts = await prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log(`   - Total Payout records: ${payouts.length}`);

    if (payouts.length > 0) {
      const latestPayout = payouts[0];
      console.log('✅ Latest Payout record found:');
      console.log(`   - ID: ${latestPayout.id}`);
      console.log(`   - Decentro Txn ID: ${latestPayout.decentroTxnId}`);
      console.log(`   - Amount: ₹${latestPayout.amount}`);
      console.log(`   - Recipient: ${latestPayout.recipientVpa}`);
      console.log(`   - Status: ${latestPayout.status}`);
      console.log(`   - Created: ${latestPayout.createdAt}`);
    } else {
      console.log('❌ No Payout records found');
    }

    // Check BankingPayment linkage
    console.log('\n🔗 Checking BankingPayment linkage...');
    const bankingPayments = await prisma.bankingPayment.findMany({
      where: { payoutId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    console.log(
      `   - BankingPayments with payout links: ${bankingPayments.length}`,
    );

    if (bankingPayments.length > 0) {
      const latest = bankingPayments[0];
      console.log('✅ Latest linked BankingPayment:');
      console.log(`   - ID: ${latest.id}`);
      console.log(`   - Payout ID: ${latest.payoutId}`);
      console.log(`   - Payout Status: ${latest.payoutStatus}`);
      console.log(`   - Overall Status: ${latest.overallStatus}`);
    }

    console.log('\n✅ PAYOUT TABLE CREATION TEST COMPLETED');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.response?.data || error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testPayoutTableCreation();
