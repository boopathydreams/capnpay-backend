const { PrismaClient } = require('@prisma/client');

async function checkPaymentTables() {
  const prisma = new PrismaClient();
  const referenceId = 'ESCROW_1757247125786_C2EE487C';

  try {
    console.log(`🔍 Checking table populations for reference: ${referenceId}`);

    // Check EscrowTransaction
    const escrow = await prisma.escrowTransaction.findUnique({
      where: { id: referenceId },
    });
    console.log(
      '📦 EscrowTransaction:',
      escrow
        ? {
            status: escrow.status,
            collectionStatus: escrow.collectionStatus,
            payoutStatus: escrow.payoutStatus,
            amount: escrow.amount.toString(),
          }
        : '❌ Not found',
    );

    // Check PaymentIntent
    const paymentIntent = await prisma.paymentIntent.findFirst({
      where: { trRef: referenceId },
    });
    console.log(
      '💰 PaymentIntent:',
      paymentIntent
        ? {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount.toString(),
          }
        : '❌ Not found',
    );

    // Check BankingPayment
    const bankingPayment = paymentIntent
      ? await prisma.bankingPayment.findUnique({
          where: { id: paymentIntent.bankingPaymentId },
        })
      : null;
    console.log(
      '🏦 BankingPayment:',
      bankingPayment
        ? {
            id: bankingPayment.id,
            overallStatus: bankingPayment.overallStatus,
          }
        : '❌ Not found',
    );

    // Check Collection
    const collection = bankingPayment
      ? await prisma.collection.findUnique({
          where: { id: bankingPayment.collectionId },
        })
      : null;
    console.log(
      '📥 Collection:',
      collection
        ? {
            id: collection.id,
            status: collection.status,
          }
        : '❌ Not found',
    );

    // Check Payout
    const payout = bankingPayment
      ? await prisma.payout.findUnique({
          where: { id: bankingPayment.payoutId },
        })
      : null;
    console.log(
      '📤 Payout:',
      payout
        ? {
            id: payout.id,
            status: payout.status,
          }
        : '❌ Not found',
    );

    // Check PaymentReceipt
    const receipt = paymentIntent
      ? await prisma.paymentReceipt.findFirst({
          where: { paymentIntentId: paymentIntent.id },
        })
      : null;
    console.log(
      '🧾 PaymentReceipt:',
      receipt
        ? {
            id: receipt.id,
            status: receipt.status,
          }
        : '❌ Not found',
    );
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPaymentTables();
