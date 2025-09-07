import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(userId: string, limit = 20, offset = 0) {
    // Fetch alerts and ledger items for payments involving the user
    const items = await this.prisma.paymentStatusHistory.findMany({
      where: {
        AND: [
          {
            OR: [
              { payment: { senderId: userId } },
              { payment: { receiverId: userId } },
            ],
          },
          {
            OR: [
              { status: { startsWith: 'ALERT_' } },
              { status: { startsWith: 'LEDGER_' } },
            ],
          },
        ],
      },
      include: {
        payment: {
          select: {
            id: true,
            amount: true,
            overallStatus: true,
            createdAt: true,
            senderId: true,
            receiverId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return items.map((i) => ({
      id: i.id,
      paymentId: i.paymentId,
      type: i.status,
      details: i.details,
      createdAt: i.createdAt,
      payment: i.payment,
    }));
  }
}
