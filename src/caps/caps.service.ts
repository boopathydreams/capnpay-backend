import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CapsState } from '../payment-intents/dto/payment-intent-response.dto';

export interface CapsAnalysis {
  capsState: CapsState;
  requiresOverride: boolean;
  affectedCategory?: {
    id: string;
    name: string;
    currentSpent: number;
    capAmount: number;
    utilizationPct: number;
    projectedSpent: number;
  };
}

export interface CapsInfo {
  status: CapsState;
  totalSpent: number;
  totalLimit: number;
  categories: Array<{
    id: string;
    name: string;
    spent: number;
    limit: number;
    utilizationPct: number;
  }>;
}

@Injectable()
export class CapsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyze caps state for a payment intent
   */
  async analyzeCaps(
    userId: string,
    categoryId: string,
    amount: number,
  ): Promise<CapsAnalysis> {
    // Get category
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category || !category.capAmount) {
      // No cap set, always OK
      return {
        capsState: CapsState.OK,
        requiresOverride: false,
      };
    }

    // Get current month spending for this category
    const monthStart = this.getMonthStart();
    const monthEnd = this.getMonthEnd();

    const tags = await this.prisma.tag.findMany({
      where: {
        categoryId,
        paymentIntent: {
          userId,
          status: 'SUCCESS',
          completedAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      },
      include: {
        paymentIntent: true,
      },
    });

    // Calculate current month spending for this category
    const currentSpent = tags.reduce(
      (sum, tag) => sum + Number(tag.paymentIntent.amount),
      0,
    );

    const capAmount = Number(category.capAmount);
    const projectedSpent = currentSpent + amount;
    const currentUtilizationPct = (currentSpent / capAmount) * 100;
    const projectedUtilizationPct = (projectedSpent / capAmount) * 100;

    const affectedCategory = {
      id: category.id,
      name: category.name,
      currentSpent,
      capAmount,
      utilizationPct: currentUtilizationPct,
      projectedSpent,
    };

    // Determine caps state based on projected spending
    if (projectedUtilizationPct >= 100) {
      return {
        capsState: CapsState.OVER,
        requiresOverride: category.softBlock,
        affectedCategory,
      };
    }

    if (projectedUtilizationPct >= category.nearThresholdPct) {
      return {
        capsState: CapsState.NEAR,
        requiresOverride: false,
        affectedCategory,
      };
    }

    return {
      capsState: CapsState.OK,
      requiresOverride: false,
      affectedCategory,
    };
  }

  /**
   * Get all caps status for user
   */
  async getUserCapsStatus(userId: string) {
    const categories = await this.prisma.category.findMany({
      where: { userId },
    });

    const monthStart = this.getMonthStart();
    const monthEnd = this.getMonthEnd();

    const results = [];

    for (const category of categories) {
      // Get spending for this category in current month
      const tags = await this.prisma.tag.findMany({
        where: {
          categoryId: category.id,
          paymentIntent: {
            userId,
            status: 'SUCCESS',
            completedAt: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
        },
        include: {
          paymentIntent: true,
        },
      });

      const currentSpent = tags.reduce(
        (sum, tag) => sum + Number(tag.paymentIntent.amount),
        0,
      );

      const capAmount = category.capAmount ? Number(category.capAmount) : 0;
      const utilizationPct =
        capAmount > 0 ? (currentSpent / capAmount) * 100 : 0;

      let state: CapsState = CapsState.OK;
      if (utilizationPct >= 100) {
        state = CapsState.OVER;
      } else if (utilizationPct >= category.nearThresholdPct) {
        state = CapsState.NEAR;
      }

      results.push({
        id: category.id,
        name: category.name,
        color: category.color,
        currentSpent,
        capAmount,
        utilizationPct,
        state,
        softBlock: category.softBlock,
        nearThresholdPct: category.nearThresholdPct,
      });
    }

    return results;
  }

  /**
   * Check overall caps status for real-time analysis
   */
  async checkCaps(userId: string, paymentAmount: number): Promise<CapsInfo> {
    const categories = await this.prisma.category.findMany({
      where: { userId },
    });

    const monthStart = this.getMonthStart();
    const monthEnd = this.getMonthEnd();

    let totalSpent = 0;
    let totalLimit = 0;
    const categoryDetails = [];

    for (const category of categories) {
      const capAmount = category.capAmount ? Number(category.capAmount) : 0;

      // Skip categories without caps
      if (capAmount === 0) continue;

      // Get spending for this category
      const tags = await this.prisma.tag.findMany({
        where: {
          categoryId: category.id,
          paymentIntent: {
            userId,
            status: 'SUCCESS',
            completedAt: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
        },
        include: {
          paymentIntent: true,
        },
      });

      const spent = tags.reduce(
        (sum, tag) => sum + Number(tag.paymentIntent.amount),
        0,
      );

      totalSpent += spent;
      totalLimit += capAmount;

      categoryDetails.push({
        id: category.id,
        name: category.name,
        spent,
        limit: capAmount,
        utilizationPct: (spent / capAmount) * 100,
      });
    }

    // Determine overall status
    const overallUtilization =
      totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
    let status: CapsState = CapsState.OK;

    if (overallUtilization >= 90) {
      status = CapsState.OVER;
    } else if (overallUtilization >= 70) {
      status = CapsState.NEAR;
    }

    return {
      status,
      totalSpent,
      totalLimit,
      categories: categoryDetails,
    };
  }

  private getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private getMonthEnd(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
}
