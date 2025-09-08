#!/usr/bin/env node

/**
 * Verify escrow consistency for a given referenceId (escrow id / trRef)
 *
 * Usage:
 *   node backend/scripts/verify-escrow-consistency.js --ref ESCROW_...
 *   node backend/scripts/verify-escrow-consistency.js --ref ESCROW_... --json
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val =
        args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const { ref, json } = parseArgs();
  if (!ref) {
    console.error(
      'Usage: node backend/scripts/verify-escrow-consistency.js --ref ESCROW_...',
    );
    process.exit(1);
  }

  const report = { ref, ok: true, issues: [], data: {} };

  try {
    const escrow = await prisma.escrowTransaction.findUnique({
      where: { id: ref },
    });
    report.data.escrow = escrow;
    if (!escrow) {
      report.ok = false;
      report.issues.push('EscrowTransaction not found');
      output(report, json);
      return;
    }

    // Collection record
    const collection = escrow.escrowCollectionId
      ? await prisma.collection.findFirst({
          where: { decentroTxnId: escrow.escrowCollectionId },
        })
      : null;
    report.data.collection = collection;

    // Payout record
    const payout = escrow.escrowPayoutId
      ? await prisma.payout.findFirst({
          where: { decentroTxnId: escrow.escrowPayoutId },
        })
      : null;
    report.data.payout = payout;

    // BankingPayment via collection link
    let bankingPayment = null;
    if (collection) {
      bankingPayment = await prisma.bankingPayment.findFirst({
        where: { collectionId: collection.id },
      });
    }
    report.data.bankingPayment = bankingPayment;

    // PaymentIntent by bankingPaymentId or by trRef
    let paymentIntent = null;
    if (bankingPayment?.id) {
      paymentIntent = await prisma.paymentIntent.findFirst({
        where: { bankingPaymentId: bankingPayment.id },
      });
    }
    if (!paymentIntent) {
      paymentIntent = await prisma.paymentIntent.findFirst({
        where: { trRef: ref },
      });
    }
    report.data.paymentIntent = paymentIntent;

    // PaymentReceipt
    let receipt = null;
    if (paymentIntent?.id) {
      receipt = await prisma.paymentReceipt.findUnique({
        where: { paymentIntentId: paymentIntent.id },
      });
    }
    report.data.receipt = receipt;

    // Expectations for completed flow
    if (escrow.status !== 'COMPLETED') {
      report.ok = false;
      report.issues.push(
        `Escrow.status = ${escrow.status} (expected COMPLETED)`,
      );
    }
    if (escrow.collectionStatus !== 'success') {
      report.ok = false;
      report.issues.push(
        `Escrow.collectionStatus = ${escrow.collectionStatus} (expected success)`,
      );
    }
    if (escrow.payoutStatus !== 'success') {
      report.ok = false;
      report.issues.push(
        `Escrow.payoutStatus = ${escrow.payoutStatus} (expected success)`,
      );
    }

    if (!collection) {
      report.ok = false;
      report.issues.push('Collection record not found for escrowCollectionId');
    } else if (collection.status !== 'COMPLETED') {
      report.ok = false;
      report.issues.push(
        `Collection.status = ${collection.status} (expected COMPLETED)`,
      );
    }

    if (!payout) {
      report.ok = false;
      report.issues.push('Payout record not found for escrowPayoutId');
    } else if (payout.status !== 'COMPLETED') {
      report.ok = false;
      report.issues.push(
        `Payout.status = ${payout.status} (expected COMPLETED)`,
      );
    }

    if (!bankingPayment) {
      report.ok = false;
      report.issues.push('BankingPayment not linked via collectionId');
    } else {
      const bp = bankingPayment;
      if (bp.collectionStatus !== 'COMPLETED') {
        report.ok = false;
        report.issues.push(
          `BankingPayment.collectionStatus = ${bp.collectionStatus} (expected COMPLETED)`,
        );
      }
      if (!bp.collectionCompletedAt) {
        report.ok = false;
        report.issues.push('BankingPayment.collectionCompletedAt is null');
      }
      if (bp.payoutStatus !== 'COMPLETED') {
        report.ok = false;
        report.issues.push(
          `BankingPayment.payoutStatus = ${bp.payoutStatus} (expected COMPLETED)`,
        );
      }
      if (!bp.payoutCompletedAt) {
        report.ok = false;
        report.issues.push('BankingPayment.payoutCompletedAt is null');
      }
      if (bp.overallStatus !== 'SUCCESS') {
        report.ok = false;
        report.issues.push(
          `BankingPayment.overallStatus = ${bp.overallStatus} (expected SUCCESS)`,
        );
      }
    }

    if (!paymentIntent) {
      report.ok = false;
      report.issues.push('PaymentIntent not found by bankingPaymentId/trRef');
    } else {
      if (paymentIntent.status !== 'SUCCESS') {
        report.ok = false;
        report.issues.push(
          `PaymentIntent.status = ${paymentIntent.status} (expected SUCCESS)`,
        );
      }
      if (!paymentIntent.completedAt) {
        report.ok = false;
        report.issues.push('PaymentIntent.completedAt is null');
      }
    }

    if (!receipt) {
      report.ok = false;
      report.issues.push('PaymentReceipt not created for PaymentIntent');
    }

    output(report, json);
  } catch (e) {
    console.error('Verification failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function output(report, json) {
  if (json === 'true') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('\n🔎 Escrow Consistency Report');
  console.log('ReferenceId:', report.ref);
  console.log('----------------------------------------');
  if (report.ok) {
    console.log('✅ OK: All records consistent for completed flow');
  } else {
    console.log('❌ Issues found:');
    report.issues.forEach((i) => console.log(' -', i));
  }
  console.log('\nSnapshot:');
  const { escrow, collection, payout, bankingPayment, paymentIntent, receipt } =
    report.data;
  console.log(
    '  Escrow:',
    escrow && {
      status: escrow.status,
      collectionStatus: escrow.collectionStatus,
      payoutStatus: escrow.payoutStatus,
    },
  );
  console.log(
    '  Collection:',
    collection && {
      id: collection.id,
      status: collection.status,
      decentroTxnId: collection.decentroTxnId,
    },
  );
  console.log(
    '  Payout:',
    payout && {
      id: payout.id,
      status: payout.status,
      decentroTxnId: payout.decentroTxnId,
    },
  );
  console.log(
    '  BankingPayment:',
    bankingPayment && {
      id: bankingPayment.id,
      collectionStatus: bankingPayment.collectionStatus,
      payoutStatus: bankingPayment.payoutStatus,
      overallStatus: bankingPayment.overallStatus,
    },
  );
  console.log(
    '  PaymentIntent:',
    paymentIntent && {
      id: paymentIntent.id,
      status: paymentIntent.status,
      completedAt: paymentIntent.completedAt,
    },
  );
  console.log(
    '  Receipt:',
    receipt && { id: receipt.id, receiptNumber: receipt.receiptNumber },
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
