import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate receipt for a completed payment
   */
  async generateReceipt(paymentIntentId: string) {
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: {
        user: true,
        tags: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!paymentIntent) {
      throw new Error('Payment intent not found');
    }

    // Check if receipt already exists
    let receipt = await this.prisma.paymentReceipt.findUnique({
      where: { paymentIntentId },
    });

    if (!receipt) {
      // Generate receipt number
      const receiptCount = await this.prisma.paymentReceipt.count();
      const receiptNumber = `CAPN-${Date.now()}-${String(receiptCount + 1).padStart(6, '0')}`;

      // Create receipt with mock collection/payout data
      receipt = await this.prisma.paymentReceipt.create({
        data: {
          paymentIntentId,
          receiptNumber,

          // Collection details (money coming from user)
          collectionId: `COLL_${paymentIntent.trRef}`,
          collectionAmount: paymentIntent.amount,
          collectionFee: Number(paymentIntent.amount) * 0.005, // 0.5% fee
          collectionStatus: 'SUCCESS',
          collectionReference: paymentIntent.upiTxnRef || paymentIntent.trRef,
          collectionCompletedAt: paymentIntent.completedAt,

          // Payout details (money going to recipient)
          payoutId: `PAYOUT_${paymentIntent.trRef}`,
          payoutAmount: paymentIntent.amount,
          payoutFee: Number(paymentIntent.amount) * 0.003, // 0.3% fee
          payoutStatus: 'SUCCESS',
          payoutReference: `PAY_${paymentIntent.trRef}`,
          payoutCompletedAt: paymentIntent.completedAt,

          // Totals
          totalAmount: paymentIntent.amount,
          totalFees: Number(paymentIntent.amount) * 0.008, // 0.8% total fees
          netAmount: Number(paymentIntent.amount) * 0.992, // Amount after fees
        },
      });

      // Mark payment intent as receipt generated
      await this.prisma.paymentIntent.update({
        where: { id: paymentIntentId },
        data: { isReceiptGenerated: true },
      });
    }

    return {
      receipt,
      paymentIntent,
      category: paymentIntent.tags[0]?.category?.name || 'Other',
    };
  }

  /**
   * Get receipt by payment intent ID
   */
  async getReceiptByPaymentId(paymentIntentId: string) {
    const receipt = await this.prisma.paymentReceipt.findUnique({
      where: { paymentIntentId },
      include: {
        paymentIntent: {
          include: {
            user: true,
            tags: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    // Mark receipt as viewed
    await this.prisma.paymentIntent.update({
      where: { id: paymentIntentId },
      data: { receiptViewed: true },
    });

    return {
      receipt,
      paymentIntent: receipt.paymentIntent,
      category: receipt.paymentIntent.tags[0]?.category?.name || 'Other',
    };
  }

  /**
   * Get all receipts for a user
   */
  async getUserReceipts(userId: string, limit: number = 50) {
    const receipts = await this.prisma.paymentReceipt.findMany({
      where: {
        paymentIntent: {
          userId,
        },
      },
      include: {
        paymentIntent: {
          include: {
            tags: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return receipts.map((receipt) => ({
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      amount: Number(receipt.totalAmount),
      netAmount: Number(receipt.netAmount),
      fees: Number(receipt.totalFees),
      payeeName: receipt.paymentIntent.payeeName,
      category: receipt.paymentIntent.tags[0]?.category?.name || 'Other',
      date: receipt.issuedAt,
      status:
        receipt.collectionStatus === 'SUCCESS' &&
        receipt.payoutStatus === 'SUCCESS'
          ? 'completed'
          : 'processing',
    }));
  }
}
