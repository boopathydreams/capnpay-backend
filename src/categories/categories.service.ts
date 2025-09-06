import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create test user for development
   */
  async findOrCreateTestUser(userId: string) {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: userId,
          phoneE164: '+919999999999',
          name: 'Test User',
        },
      });
    }

    return user;
  }

  /**
   * Get all categories for user
   */
  async getUserCategories(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Seed default categories for a new user
   */
  async seedDefaultCategories(userId: string) {
    const defaultCategories = [
      { name: 'Food', color: '#10B981', capAmount: 5000 },
      { name: 'Shopping', color: '#F59E0B', capAmount: 3000 },
      { name: 'Transport', color: '#3B82F6', capAmount: 2000 },
      { name: 'Entertainment', color: '#8B5CF6', capAmount: 1500 },
      { name: 'Bills', color: '#EF4444', capAmount: 8000 },
      { name: 'Health', color: '#06B6D4', capAmount: 2000 },
    ];

    const categories = await Promise.all(
      defaultCategories.map((cat) =>
        this.prisma.category.create({
          data: {
            userId,
            name: cat.name,
            color: cat.color,
            capAmount: cat.capAmount,
            softBlock: false,
            nearThresholdPct: 80,
          },
        }),
      ),
    );

    return categories;
  }

  /**
   * Get category by ID
   */
  async getCategory(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
    });
  }

  /**
   * Get detailed spending caps with current usage
   */
  async getUserSpendingCapsDetailed(userId: string) {
    const currentMonth = new Date();
    const startOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1,
    );

    // Get user's spending caps
    const spendingCaps = await this.prisma.spendingCap.findMany({
      where: { userId, isEnabled: true },
      include: {
        category: true,
      },
    });

    const capsWithUsage = await Promise.all(
      spendingCaps.map(async (cap) => {
        // Get transactions for this category this month
        const categoryTransactions = await this.prisma.paymentIntent.findMany({
          where: {
            userId,
            status: 'SUCCESS',
            completedAt: {
              gte: startOfMonth,
              lte: new Date(),
            },
            tags: {
              some: {
                categoryId: cap.categoryId,
              },
            },
          },
          select: { amount: true },
        });

        const spent = categoryTransactions.reduce(
          (sum, txn) => sum + Number(txn.amount),
          0,
        );

        const limit = Number(cap.monthlyLimit);
        const progress = limit > 0 ? (spent / limit) * 100 : 0;

        let status: 'OK' | 'NEAR' | 'OVER';
        let progressColor: string;

        if (progress >= 100) {
          status = 'OVER';
          progressColor = '#EF4444'; // Red
        } else if (progress >= 80) {
          status = 'NEAR';
          progressColor = '#F59E0B'; // Orange/Amber
        } else {
          status = 'OK';
          progressColor = '#10B981'; // Green
        }

        return {
          id: cap.id,
          name: cap.categoryName,
          spent,
          limit,
          progress: Math.round(progress),
          status,
          color: cap.color,
          progressColor,
          description: cap.description,
          dailyLimit: Number(cap.dailyLimit),
          weeklyLimit: Number(cap.weeklyLimit),
        };
      }),
    );

    return {
      caps: capsWithUsage,
      totalCaps: capsWithUsage.length,
      totalSpent: capsWithUsage.reduce((sum, cap) => sum + cap.spent, 0),
      totalLimit: capsWithUsage.reduce((sum, cap) => sum + cap.limit, 0),
    };
  }
}
