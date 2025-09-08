#!/usr/bin/env node

/**
 * Payment Flow Monitoring Script
 * Real-time monitoring of payment status and webhook integration
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function monitorPaymentFlow(referenceId) {
  console.log(`🔍 Monitoring payment flow for: ${referenceId}\n`);

  try {
    // Monitor EscrowTransaction
    const escrow = await prisma.escrowTransaction.findUnique({
      where: { id: referenceId },
    });

    if (!escrow) {
      console.log('❌ EscrowTransaction not found');
      return;
    }

    console.log('📦 ESCROW TRANSACTION:');
    console.log(`   ID: ${escrow.id}`);
    console.log(`   Amount: ₹${escrow.amount}`);
    console.log(`   Status: ${escrow.status}`);
    console.log(`   Collection Status: ${escrow.collectionStatus}`);
    console.log(`   Payout Status: ${escrow.payoutStatus}`);
    console.log(`   Payer UPI: ${escrow.payerUpi}`);
    console.log(`   Recipient UPI: ${escrow.recipientUpi}`);

    // Monitor Collection records
    const collections = await prisma.collection.findMany({
      where: {
        decentroTxnId: {
          contains: referenceId,
        },
      },
    });

    console.log('\n📥 COLLECTION RECORDS:');
    if (collections.length === 0) {
      console.log('   ❌ No Collection records found');
    } else {
      collections.forEach((collection, index) => {
        console.log(`   ${index + 1}. ID: ${collection.id}`);
        console.log(`      TxnId: ${collection.decentroTxnId}`);
        console.log(`      Status: ${collection.status}`);
        console.log(`      Amount: ₹${collection.amount}`);
        console.log(`      Created: ${collection.createdAt}`);
      });
    }

    // Monitor Payout records
    const payouts = await prisma.payout.findMany({
      where: {
        decentroTxnId: {
          contains: referenceId,
        },
      },
    });

    console.log('\n📤 PAYOUT RECORDS:');
    if (payouts.length === 0) {
      console.log('   ❌ No Payout records found');
    } else {
      payouts.forEach((payout, index) => {
        console.log(`   ${index + 1}. ID: ${payout.id}`);
        console.log(`      TxnId: ${payout.decentroTxnId}`);
        console.log(`      Status: ${payout.status}`);
        console.log(`      Amount: ₹${payout.amount}`);
        console.log(`      Recipient: ${payout.recipientVpa}`);
        console.log(`      Created: ${payout.createdAt}`);
      });
    }

    // Monitor PaymentIntent records
    const paymentIntents = await prisma.paymentIntent.findMany({
      where: { trRef: referenceId },
      include: {
        user: { select: { id: true, name: true, primaryVpa: true } },
      },
    });

    console.log('\n💰 PAYMENT INTENT RECORDS:');
    if (paymentIntents.length === 0) {
      console.log('   ❌ No PaymentIntent records found');
    } else {
      paymentIntents.forEach((intent, index) => {
        console.log(`   ${index + 1}. ID: ${intent.id}`);
        console.log(`      Status: ${intent.status}`);
        console.log(`      Amount: ₹${intent.amount}`);
        console.log(
          `      User: ${intent.user?.name} (${intent.user?.primaryVpa})`,
        );
        console.log(`      Recipient: ${intent.vpa}`);
        console.log(
          `      Banking Payment ID: ${intent.bankingPaymentId || 'Not linked'}`,
        );
        console.log(
          `      Completed: ${intent.completedAt || 'Not completed'}`,
        );
      });
    }

    // Monitor BankingPayment records
    const bankingPayments = await prisma.bankingPayment.findMany({
      where: {
        OR: [
          { legacyPaymentIntentId: { in: paymentIntents.map((p) => p.id) } },
          {
            AND: [
              { senderId: escrow.userId || 'unknown' },
              { amount: escrow.amount },
            ],
          },
        ],
      },
      include: {
        sender: { select: { id: true, name: true, primaryVpa: true } },
        receiver: { select: { id: true, name: true, primaryVpa: true } },
        collection: true,
        payout: true,
      },
    });

    console.log('\n🏦 BANKING PAYMENT RECORDS:');
    if (bankingPayments.length === 0) {
      console.log('   ❌ No BankingPayment records found');
    } else {
      bankingPayments.forEach((payment, index) => {
        console.log(`   ${index + 1}. ID: ${payment.id}`);
        console.log(`      Overall Status: ${payment.overallStatus}`);
        console.log(`      Collection Status: ${payment.collectionStatus}`);
        console.log(`      Payout Status: ${payment.payoutStatus}`);
        console.log(`      Amount: ₹${payment.amount}`);
        console.log(
          `      Sender: ${payment.sender?.name} (${payment.sender?.primaryVpa})`,
        );
        console.log(
          `      Receiver: ${payment.receiver?.name} (${payment.receiver?.primaryVpa})`,
        );
        console.log(
          `      Collection ID: ${payment.collectionId || 'Not linked'}`,
        );
        console.log(`      Payout ID: ${payment.payoutId || 'Not linked'}`);
        console.log(`      Created: ${payment.createdAt}`);
        console.log(
          `      Collection Completed: ${payment.collectionCompletedAt || 'Not completed'}`,
        );
        console.log(
          `      Payout Completed: ${payment.payoutCompletedAt || 'Not completed'}`,
        );
      });
    }

    // Monitor PaymentReceipt records
    const receipts = await prisma.paymentReceipt.findMany({
      where: { transactionId: referenceId },
    });

    console.log('\n🧾 PAYMENT RECEIPT RECORDS:');
    if (receipts.length === 0) {
      console.log('   ❌ No PaymentReceipt records found');
    } else {
      receipts.forEach((receipt, index) => {
        console.log(`   ${index + 1}. ID: ${receipt.id}`);
        console.log(`      Status: ${receipt.status}`);
        console.log(`      Amount: ₹${receipt.amount}`);
        console.log(`      Recipient: ${receipt.receiverVpa}`);
        console.log(`      Created: ${receipt.createdAt}`);
      });
    }

    // Integration Health Check
    console.log('\n🏥 INTEGRATION HEALTH CHECK:');
    const hasEscrow = !!escrow;
    const hasCollection = collections.length > 0;
    const hasPayout = payouts.length > 0;
    const hasPaymentIntent = paymentIntents.length > 0;
    const hasBankingPayment = bankingPayments.length > 0;
    const hasReceipt = receipts.length > 0;

    console.log(`   📦 Escrow Transaction: ${hasEscrow ? '✅' : '❌'}`);
    console.log(`   📥 Collection Record: ${hasCollection ? '✅' : '❌'}`);
    console.log(`   📤 Payout Record: ${hasPayout ? '✅' : '❌'}`);
    console.log(`   💰 Payment Intent: ${hasPaymentIntent ? '✅' : '❌'}`);
    console.log(`   🏦 Banking Payment: ${hasBankingPayment ? '✅' : '❌'}`);
    console.log(`   🧾 Payment Receipt: ${hasReceipt ? '✅' : '❌'}`);

    const healthScore = [
      hasEscrow,
      hasCollection,
      hasPayout,
      hasPaymentIntent,
      hasBankingPayment,
      hasReceipt,
    ].filter(Boolean).length;
    console.log(`\n📊 Health Score: ${healthScore}/6`);

    if (healthScore === 6) {
      console.log('🎉 PERFECT INTEGRATION - All systems connected!');
    } else if (healthScore >= 4) {
      console.log('⚠️  GOOD INTEGRATION - Minor issues detected');
    } else {
      console.log('❌ POOR INTEGRATION - Major issues detected');
    }
  } catch (error) {
    console.error('❌ Monitoring failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get reference ID from command line argument
const referenceId = process.argv[2];

if (!referenceId) {
  console.log('❌ Please provide a reference ID');
  console.log('Usage: node monitor-payment-flow.js <REFERENCE_ID>');
  console.log(
    'Example: node monitor-payment-flow.js ESCROW_1757247125786_C2EE487C',
  );
  process.exit(1);
}

// Run monitoring
monitorPaymentFlow(referenceId);
