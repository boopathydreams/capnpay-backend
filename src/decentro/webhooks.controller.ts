import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { BankingService } from '../banking/banking.service';
import { CollectionStatus, PayoutStatus, PaymentStatus } from '@prisma/client';
import {
  DecentroCollectionWebhookDto,
  DecentroPayoutWebhookDto,
} from './dto/webhooks.dto';
import { RelationshipAnalyzerService } from '../intelligence/relationship-analyzer.service';
import { WebhookAuthGuard } from './webhook-auth.guard';

@ApiTags('decentro-webhooks')
@Controller('decentro/webhooks')
export class DecentroWebhooksController {
  private readonly logger = new Logger(DecentroWebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bankingService: BankingService,
    private readonly relationshipAnalyzer: RelationshipAnalyzerService,
  ) {}

  private normalizeCollectionStatus(status: string): CollectionStatus {
    const s = (status || '').toUpperCase();
    if (['SUCCESS', 'COMPLETED', 'PAID', 'COLLECTED'].includes(s))
      return CollectionStatus.COMPLETED;
    if (['FAILED', 'REJECTED'].includes(s)) return CollectionStatus.FAILED;
    if (['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(s))
      return CollectionStatus.PROCESSING;
    return CollectionStatus.INITIATED;
  }

  private normalizePayoutStatus(status: string): PayoutStatus {
    const s = (status || '').toUpperCase();
    if (['SUCCESS', 'COMPLETED', 'PAID'].includes(s))
      return PayoutStatus.COMPLETED;
    if (['FAILED', 'REJECTED'].includes(s)) return PayoutStatus.FAILED;
    if (['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(s))
      return PayoutStatus.PROCESSING;
    return PayoutStatus.PENDING;
  }

  private async resolvePaymentIdByReference(
    referenceId?: string,
  ): Promise<string | undefined> {
    if (!referenceId) return undefined;
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { trRef: referenceId },
      select: { bankingPaymentId: true },
    });
    return intent?.bankingPaymentId || undefined;
  }

  private async handleEscrowWebhook(
    referenceId: string,
    status: CollectionStatus | PayoutStatus,
    isCollection: boolean,
  ): Promise<{ handled: boolean; paymentId?: string }> {
    if (!referenceId.startsWith('ESCROW_')) {
      return { handled: false };
    }

    // Check if this is an escrow transaction
    const escrowTransaction = await this.prisma.escrowTransaction.findUnique({
      where: { id: referenceId },
    });

    if (!escrowTransaction) {
      return { handled: false };
    }

    this.logger.log(`Handling escrow webhook for ${referenceId}`, {
      status,
      isCollection,
      escrowStatus: escrowTransaction.status,
    });

    // Create Collection/Payout audit records
    const txnNo = `${referenceId}_${isCollection ? 'COLLECTION' : 'PAYOUT'}`;

    // Update escrow transaction status
    if (isCollection) {
      // Create Collection record for audit trail
      try {
        const existing = await this.prisma.collection.findFirst({
          where: { decentroTxnId: txnNo },
        });

        if (!existing) {
          await this.prisma.collection.create({
            data: {
              decentroTxnId: txnNo,
              amount: escrowTransaction.amount,
              status: status as CollectionStatus,
              webhookData: {
                source: 'escrow_webhook',
                referenceId,
                timestamp: new Date().toISOString(),
                originalStatus: status,
              },
            },
          });
          this.logger.log(`✅ Created Collection record: ${txnNo}`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to create Collection record: ${error.message}`,
        );
      }

      await this.prisma.escrowTransaction.update({
        where: { id: referenceId },
        data: {
          collectionStatus:
            status === CollectionStatus.COMPLETED ? 'success' : 'failed',
          status:
            status === CollectionStatus.COMPLETED ? 'PROCESSING' : 'FAILED',
        },
      });
    } else {
      // Create Payout record for audit trail
      try {
        const existing = await this.prisma.payout.findFirst({
          where: { decentroTxnId: txnNo },
        });

        if (!existing) {
          await this.prisma.payout.create({
            data: {
              decentroTxnId: txnNo,
              amount: escrowTransaction.amount,
              recipientVpa: escrowTransaction.recipientUpi,
              recipientName: escrowTransaction.recipientUpi.split('@')[0],
              status: status as PayoutStatus,
              webhookData: {
                source: 'escrow_webhook',
                referenceId,
                timestamp: new Date().toISOString(),
                originalStatus: status,
              },
            },
          });
          this.logger.log(`✅ Created Payout record: ${txnNo}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to create Payout record: ${error.message}`);
      }

      // Payout webhook - trigger integration if successful
      if (status === PayoutStatus.COMPLETED) {
        // This is where we should trigger the integration logic
        // Similar to what we have in payment-intents.service.ts
        await this.integrateEscrowWithPaymentSystem(
          referenceId,
          escrowTransaction,
        );
      }

      await this.prisma.escrowTransaction.update({
        where: { id: referenceId },
        data: {
          payoutStatus:
            status === PayoutStatus.COMPLETED ? 'success' : 'failed',
          status: status === PayoutStatus.COMPLETED ? 'COMPLETED' : 'FAILED',
        },
      });
    }

    return { handled: true };
  }

  private async integrateEscrowWithPaymentSystem(
    referenceId: string,
    escrowTransaction: any,
  ): Promise<void> {
    try {
      // Find the sender user from the escrow transaction's payerUpi
      const senderVpa = await this.prisma.vpaRegistry.findUnique({
        where: { vpaAddress: escrowTransaction.payerUpi },
        include: { user: true },
      });

      if (!senderVpa?.user) {
        this.logger.warn(
          `Could not find sender user for escrow payer UPI: ${escrowTransaction.payerUpi}`,
        );
        return;
      }

      // Find the recipient user from the escrow transaction's recipientUpi
      const recipientVpa = await this.prisma.vpaRegistry.findUnique({
        where: { vpaAddress: escrowTransaction.recipientUpi },
        include: { user: true },
      });

      if (!recipientVpa?.user) {
        this.logger.warn(
          `Could not find recipient user for escrow recipient UPI: ${escrowTransaction.recipientUpi}`,
        );
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        // Create BankingPayment record first
        const bankingPayment = await this.bankingService.createPayment({
          senderId: senderVpa.user.id,
          receiverVpa: escrowTransaction.recipientUpi,
          amount: Number(escrowTransaction.amount),
          purpose: escrowTransaction.note || 'Escrow payment',
          paymentType: 'ESCROW',
          categoryId: null,
        });

        // Link existing Collection and Payout records to BankingPayment
        // Use the actual Decentro transaction IDs from the escrow transaction
        const collectionTxnId = escrowTransaction.escrowCollectionId;
        const payoutTxnId = escrowTransaction.escrowPayoutId;

        // Find and link Collection record using actual Decentro transaction ID
        const collection = await tx.collection.findFirst({
          where: {
            OR: [
              ...(collectionTxnId ? [{ decentroTxnId: collectionTxnId }] : []),
              // Fallback: collection might be created with webhook UTR
              { webhookData: { path: ['reference_id'], equals: referenceId } },
            ],
          },
        });

        // Find and link Payout record using actual Decentro transaction ID
        const payout = await tx.payout.findFirst({
          where: {
            OR: [
              ...(payoutTxnId ? [{ decentroTxnId: payoutTxnId }] : []),
              // Fallback: payout might be created with webhook UTR
              { webhookData: { path: ['reference_id'], equals: referenceId } },
            ],
          },
        });

        // Update BankingPayment with Collection/Payout IDs and mark as completed
        await tx.bankingPayment.update({
          where: { id: bankingPayment.id },
          data: {
            collectionId: collection?.id,
            payoutId: payout?.id,
            collectionStatus: 'COMPLETED',
            payoutStatus: 'COMPLETED',
            overallStatus: 'SUCCESS',
            collectionCompletedAt: new Date(),
            payoutCompletedAt: new Date(),
          },
        });

        // Create PaymentIntent record for app compatibility
        const paymentIntent = await tx.paymentIntent.create({
          data: {
            trRef: referenceId,
            userId: senderVpa.user.id,
            amount: escrowTransaction.amount,
            vpa: escrowTransaction.recipientUpi,
            payeeName: escrowTransaction.recipientUpi.split('@')[0],
            entrypoint: 'escrow_payment',
            noteLong: escrowTransaction.note || 'Escrow payment',
            status: PaymentStatus.SUCCESS,
            completedAt: new Date(),
            bankingPaymentId: bankingPayment.id,
          },
        });

        this.logger.log(
          '✅ Complete escrow integration completed via webhook',
          {
            escrowId: referenceId,
            paymentIntentId: paymentIntent.id,
            bankingPaymentId: bankingPayment.id,
            collectionId: collection?.id,
            payoutId: payout?.id,
          },
        );
      });
    } catch (error) {
      this.logger.error('❌ Failed to integrate escrow via webhook', {
        error: error.message,
        stack: error.stack,
        referenceId,
        escrowTransaction: escrowTransaction?.id,
        errorName: error.name,
        errorCode: error.code,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      throw error; // Re-throw to see the full error
    }
  }

  @Post('collection')
  @UseGuards(WebhookAuthGuard)
  @HttpCode(202)
  @ApiOperation({ summary: 'Decentro collection webhook' })
  @ApiResponse({ status: 202, description: 'Webhook accepted' })
  async handleCollection(@Body() payload: DecentroCollectionWebhookDto) {
    this.logger.log('Collection webhook received', payload as any);

    // Replay protection using callback_transaction_id
    if (payload.callback_transaction_id) {
      const exists = await this.prisma.paymentStatusHistory.findFirst({
        where: {
          status: 'WEBHOOK_RECEIVED',
          subStatus: payload.callback_transaction_id,
        },
      });
      if (exists) {
        return { ok: true, matched: false, duplicate: true };
      }
      await this.prisma.paymentStatusHistory
        .create({
          data: {
            paymentId: 'unknown',
            status: 'WEBHOOK_RECEIVED',
            subStatus: payload.callback_transaction_id,
            details: payload as any,
            systemNotes: 'Decentro collection webhook received',
          },
        })
        .catch(() => undefined);
    }

    // Check if this is an escrow transaction first
    const escrowResult = await this.handleEscrowWebhook(
      payload.reference_id,
      this.normalizeCollectionStatus(payload.status),
      true, // isCollection
    );
    if (escrowResult.handled) {
      return { ok: true, matched: true, escrow: true };
    }

    const paymentId = await this.resolvePaymentIdByReference(
      payload.reference_id,
    );
    if (!paymentId) {
      // Try to match via banking payments txn no if reference link is not set yet
      // Non-blocking ack
      return { ok: true, matched: false };
    }

    const status = this.normalizeCollectionStatus(payload.status);
    const txnNo = payload.utr || payload.rrn || payload.transaction_id;

    await this.bankingService.updateCollectionStatus(paymentId, status, {
      txnNo: txnNo,
      refNo: payload.reference_id,
    });

    // Persist audit record in Collection table when a transaction id/utr exists
    if (txnNo) {
      try {
        const amount = payload.amount ?? undefined;
        const existing = await this.prisma.collection.findUnique({
          where: { decentroTxnId: txnNo },
        });

        if (!existing) {
          const created = await this.prisma.collection.create({
            data: {
              decentroTxnId: txnNo,
              amount: amount ?? 0,
              status,
              webhookData: payload as any,
            },
          });
          // Link to banking payment if not linked
          await this.prisma.bankingPayment.update({
            where: { id: paymentId },
            data: { collectionId: created.id },
          });
        } else {
          await this.prisma.collection.update({
            where: { decentroTxnId: txnNo },
            data: { status, webhookData: payload as any },
          });
        }
      } catch (e) {
        this.logger.warn('Failed to persist collection audit', e as any);
      }
    }

    // Backfill webhook event placeholder with payment id
    if (payload.callback_transaction_id) {
      await this.prisma.paymentStatusHistory
        .updateMany({
          where: {
            status: 'WEBHOOK_RECEIVED',
            subStatus: payload.callback_transaction_id,
            paymentId: 'unknown',
          },
          data: { paymentId },
        })
        .catch(() => undefined);
    }

    return { ok: true, matched: true };
  }

  @Post('payout')
  @UseGuards(WebhookAuthGuard)
  @HttpCode(202)
  @ApiOperation({ summary: 'Decentro payout webhook' })
  @ApiResponse({ status: 202, description: 'Webhook accepted' })
  async handlePayout(@Body() payload: DecentroPayoutWebhookDto) {
    this.logger.log('Payout webhook received', payload as any);

    // Replay protection using callback_transaction_id
    if (payload.callback_transaction_id) {
      const exists = await this.prisma.paymentStatusHistory.findFirst({
        where: {
          status: 'WEBHOOK_RECEIVED',
          subStatus: payload.callback_transaction_id,
        },
      });
      if (exists) {
        return { ok: true, matched: false, duplicate: true };
      }
      await this.prisma.paymentStatusHistory
        .create({
          data: {
            paymentId: 'unknown',
            status: 'WEBHOOK_RECEIVED',
            subStatus: payload.callback_transaction_id,
            details: payload as any,
            systemNotes: 'Decentro payout webhook received',
          },
        })
        .catch(() => undefined);
    }

    // Check if this is an escrow transaction first
    const escrowResult = await this.handleEscrowWebhook(
      payload.reference_id,
      this.normalizePayoutStatus(payload.status),
      false, // isCollection
    );
    if (escrowResult.handled) {
      return { ok: true, matched: true, escrow: true };
    }

    const paymentId = await this.resolvePaymentIdByReference(
      payload.reference_id,
    );
    if (!paymentId) {
      return { ok: true, matched: false };
    }

    const status = this.normalizePayoutStatus(payload.status);
    const txnNo = payload.utr || payload.rrn || payload.transaction_id;

    await this.bankingService.updatePayoutStatus(paymentId, status, {
      txnNo: txnNo,
      refNo: payload.reference_id,
    });

    // Persist audit record in Payout table when a transaction id/utr exists
    if (txnNo) {
      try {
        const amount = payload.amount ?? undefined;
        const existing = await this.prisma.payout.findUnique({
          where: { decentroTxnId: txnNo },
        });

        if (!existing) {
          const created = await this.prisma.payout.create({
            data: {
              decentroTxnId: txnNo,
              amount: amount ?? 0,
              recipientVpa: payload.payee_vpa || 'unknown',
              status,
              webhookData: payload as any,
            },
          });
          await this.prisma.bankingPayment.update({
            where: { id: paymentId },
            data: { payoutId: created.id },
          });
        } else {
          await this.prisma.payout.update({
            where: { decentroTxnId: txnNo },
            data: { status, webhookData: payload as any },
          });
        }
      } catch (e) {
        this.logger.warn('Failed to persist payout audit', e as any);
      }
    }

    // On successful payout, compute and persist relationship insights for sender -> receiver
    if (status === PayoutStatus.COMPLETED) {
      try {
        const payment = await this.prisma.bankingPayment.findUnique({
          where: { id: paymentId },
          select: { senderId: true, receiverId: true },
        });
        if (payment) {
          const { senderId, receiverId } = payment;
          const pairTransactions = await this.prisma.bankingPayment.findMany({
            where: {
              OR: [
                { senderId: senderId, receiverId: receiverId },
                { senderId: receiverId, receiverId: senderId },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          });

          const now = Date.now();
          let totalSent = 0;
          let totalReceived = 0;
          const transactionCount = pairTransactions.length;
          let successCount = 0;
          let first = Number.POSITIVE_INFINITY;
          let last = 0;
          const txList = pairTransactions.map((tx) => {
            const t = new Date(tx.createdAt).getTime();
            first = Math.min(first, t);
            last = Math.max(last, t);
            if (tx.overallStatus === 'SUCCESS') successCount++;
            if (tx.senderId === senderId) totalSent += Number(tx.amount);
            else totalReceived += Number(tx.amount);
            return {
              amount: Number(tx.amount),
              timestamp: new Date(tx.createdAt),
              type:
                tx.senderId === senderId
                  ? ('sent' as const)
                  : ('received' as const),
            };
          });

          const successRate =
            transactionCount > 0 ? successCount / transactionCount : 0;
          const daysSinceFirst = isFinite(first)
            ? (now - first) / (1000 * 60 * 60 * 24)
            : 0;
          const daysSinceLast = last ? (now - last) / (1000 * 60 * 60 * 24) : 0;
          const averageAmount =
            transactionCount > 0
              ? (totalSent + totalReceived) / transactionCount
              : 0;

          const trustScore = this.relationshipAnalyzer.calculateTrustScore(
            totalSent,
            totalReceived,
            transactionCount,
            successRate,
            daysSinceFirst,
            daysSinceLast,
          );
          const relationshipType =
            this.relationshipAnalyzer.classifyRelationshipType(
              txList,
              payload.payee_vpa,
            );
          const behavioralInsights =
            this.relationshipAnalyzer.generateBehavioralInsights(
              totalSent,
              totalReceived,
              transactionCount,
              averageAmount,
              relationshipType,
            );

          await this.prisma.paymentStatusHistory.create({
            data: {
              paymentId,
              status: 'RELATIONSHIP_ANALYSIS',
              subStatus: relationshipType,
              details: {
                trustScore,
                totalSent,
                totalReceived,
                transactionCount,
                successRate,
                averageAmount,
                insights: behavioralInsights,
              } as any,
              systemNotes: 'Contact relationship insights recorded',
            },
          });
        }
      } catch (e) {
        this.logger.warn('Failed to compute relationship insights', e as any);
      }
    }

    if (payload.callback_transaction_id) {
      await this.prisma.paymentStatusHistory
        .updateMany({
          where: {
            status: 'WEBHOOK_RECEIVED',
            subStatus: payload.callback_transaction_id,
            paymentId: 'unknown',
          },
          data: { paymentId },
        })
        .catch(() => undefined);
    }

    return { ok: true, matched: true };
  }
}
