import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DecentroService } from '../decentro/decentro.service';
import { CollectionStatus, PayoutStatus } from '@prisma/client';
import { BankingService } from '../banking/banking.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decentro: DecentroService,
    private readonly banking: BankingService,
  ) {}

  // Hourly reconciliation across recent payments
  @Cron(CronExpression.EVERY_HOUR)
  async reconcileRecentPayments() {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
      const candidates = await this.prisma.bankingPayment.findMany({
        where: {
          createdAt: { gte: since },
          NOT: { overallStatus: 'SUCCESS' },
        },
        include: {
          collection: true,
          payout: true,
        },
        take: 200,
      });

      for (const p of candidates) {
        // Check collection status via Decentro if we have txn id
        if (
          p.collectionStatus !== 'COMPLETED' &&
          p.collection &&
          p.collection.decentroTxnId
        ) {
          try {
            const resp = await this.decentro.getTransactionStatus(
              p.collection.decentroTxnId,
              'collection',
            );
            const s = String(
              resp?.data?.transaction_description?.transaction_status ||
                resp?.data?.transaction_status ||
                resp?.data?.status ||
                '',
            ).toUpperCase();
            if (s === 'SUCCESS') {
              await this.banking.updateCollectionStatus(
                p.id,
                CollectionStatus.COMPLETED,
                { txnNo: p.collection.decentroTxnId },
              );
              await this.prisma.paymentStatusHistory.create({
                data: {
                  paymentId: p.id,
                  status: 'LEDGER_RECEIVABLE_SETTLED',
                  details: { txnId: p.collection.decentroTxnId },
                  systemNotes: 'Collection reconciled as SUCCESS',
                },
              });
            } else if (s === 'FAILED' || s === 'FAILURE') {
              await this.banking.updateCollectionStatus(
                p.id,
                CollectionStatus.FAILED,
                { txnNo: p.collection.decentroTxnId },
              );
              await this.prisma.paymentStatusHistory.create({
                data: {
                  paymentId: p.id,
                  status: 'LEDGER_RECEIVABLE_FAILED',
                  details: { txnId: p.collection.decentroTxnId },
                  systemNotes: 'Collection reconciled as FAILED',
                },
              });
            }
          } catch (e) {
            this.logger.warn('Collection reconciliation failed', e as any);
          }
        }

        // Check payout status via Decentro if we have txn id
        if (
          p.payoutStatus !== 'COMPLETED' &&
          p.payout &&
          p.payout.decentroTxnId
        ) {
          try {
            const resp = await this.decentro.getTransactionStatus(
              p.payout.decentroTxnId,
              'payout',
            );
            const s = String(
              resp?.data?.transaction_description?.transaction_status ||
                resp?.data?.transaction_status ||
                resp?.data?.status ||
                '',
            ).toUpperCase();
            if (s === 'SUCCESS') {
              await this.banking.updatePayoutStatus(
                p.id,
                PayoutStatus.COMPLETED,
                { txnNo: p.payout.decentroTxnId },
              );
              await this.prisma.paymentStatusHistory.create({
                data: {
                  paymentId: p.id,
                  status: 'LEDGER_ADVANCE_SETTLED',
                  details: { txnId: p.payout.decentroTxnId },
                  systemNotes: 'Payout reconciled as SUCCESS',
                },
              });
            } else if (s === 'FAILED' || s === 'FAILURE') {
              await this.banking.updatePayoutStatus(p.id, PayoutStatus.FAILED, {
                txnNo: p.payout.decentroTxnId,
              });
              await this.prisma.paymentStatusHistory.create({
                data: {
                  paymentId: p.id,
                  status: 'LEDGER_ADVANCE_FAILED',
                  details: { txnId: p.payout.decentroTxnId },
                  systemNotes: 'Payout reconciled as FAILED',
                },
              });
            }
          } catch (e) {
            this.logger.warn('Payout reconciliation failed', e as any);
          }
        }
      }

      // Alerts for aged pending items
      const alertThresholdHoursCollection = 2; // configurable
      const alertThresholdHoursPayout = 4; // configurable
      const now = Date.now();
      for (const p of candidates) {
        const ageHrs = (now - new Date(p.createdAt).getTime()) / (1000 * 60 * 60);
        const needsCollectionAlert =
          (p.collectionStatus === 'PROCESSING' || p.collectionStatus === 'INITIATED') &&
          ageHrs >= alertThresholdHoursCollection;
        const needsPayoutAlert =
          (p.payoutStatus === 'PROCESSING' || p.payoutStatus === 'PENDING') &&
          ageHrs >= alertThresholdHoursPayout;

        if (needsCollectionAlert || needsPayoutAlert) {
          const existing = await this.prisma.paymentStatusHistory.findFirst({
            where: {
              paymentId: p.id,
              status: 'ALERT_PENDING_AGED',
            },
          });
          if (!existing) {
            await this.prisma.paymentStatusHistory.create({
              data: {
                paymentId: p.id,
                status: 'ALERT_PENDING_AGED',
                details: {
                  collectionStatus: p.collectionStatus,
                  payoutStatus: p.payoutStatus,
                  ageHours: Math.round(ageHrs),
                } as any,
                systemNotes: 'Aged pending payment requires attention',
              },
            });
            // Emit alert via SSE to both parties
            try {
              // naive dual emit leveraging banking service internal stream
              await (async () => {
                (this.banking as any).updates$.next?.({
                  type: 'alert',
                  paymentId: p.id,
                  userId: p.senderId,
                  payload: {
                    kind: 'ALERT_PENDING_AGED',
                    collectionStatus: p.collectionStatus,
                    payoutStatus: p.payoutStatus,
                    ageHours: Math.round(ageHrs),
                  },
                });
                (this.banking as any).updates$.next?.({
                  type: 'alert',
                  paymentId: p.id,
                  userId: p.receiverId,
                  payload: {
                    kind: 'ALERT_PENDING_AGED',
                    collectionStatus: p.collectionStatus,
                    payoutStatus: p.payoutStatus,
                    ageHours: Math.round(ageHrs),
                  },
                });
              })();
            } catch {}
          }
        }
      }

      this.logger.log(`Reconciled payments scanned: ${candidates.length}`);
    } catch (error) {
      this.logger.error('Reconciliation job failed', error as any);
    }
  }
}
