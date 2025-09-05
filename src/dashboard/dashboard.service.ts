import { Injectable } from '@nestjs/common';
import {
  DashboardInsights,
  CategoryInsight,
  TransactionSummary,
  DashboardOverview,
  UserSpendingSummary,
  CategorySpendingCap,
  UpcomingBill,
} from './dto/dashboard.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get comprehensive dashboard overview for mobile app
   */
  async getDashboardOverview(userId: string): Promise<DashboardOverview> {
    const [userData, capsDataRaw, upcomingBills, recentActivity] =
      await Promise.all([
        this.getUserSpendingSummary(userId),
        this.getCategorySpendingCaps(userId),
        this.getUpcomingBills(userId),
        this.getRecentActivity(userId),
      ]);

    // Deduplicate caps data to ensure unique categories
    const capsData = this.deduplicateCaps(capsDataRaw);

    return {
      userData,
      capsData,
      upcomingBills,
      recentActivity,
    };
  }

  /**
   * Get user spending summary (main dashboard metrics)
   */
  async getUserSpendingSummary(userId: string): Promise<UserSpendingSummary> {
    const currentMonth = new Date();
    const startOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1,
    );
    const endOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      0,
    );
    const today = new Date();
    const daysInMonth = endOfMonth.getDate();
    const daysPassed = today.getDate();
    const daysRemaining = daysInMonth - daysPassed;

    // Get user's monthly salary/limit
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { monthlySalary: true },
    });

    // Calculate monthly spending limit (80% of salary as default)
    const monthlyLimit = user?.monthlySalary
      ? Number(user.monthlySalary) * 0.8
      : 25000;

    // Get this month's spending
    const monthlyTransactions = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        status: 'SUCCESS',
        completedAt: {
          gte: startOfMonth,
          lte: new Date(),
        },
      },
      select: { amount: true, completedAt: true },
    });

    const totalSpent = monthlyTransactions.reduce(
      (sum, txn) => sum + Number(txn.amount),
      0,
    );

    // Calculate safe to spend today
    const remainingBudget = monthlyLimit - totalSpent;
    const safeToSpendToday = Math.max(
      0,
      Math.floor(remainingBudget / Math.max(daysRemaining, 1)),
    );

    // Calculate projected month-end spending based on current rate
    const averageDailySpend = totalSpent / daysPassed;
    const projectedMonthEnd = averageDailySpend * daysInMonth;

    return {
      totalSpent,
      monthlyLimit,
      safeToSpendToday,
      projectedMonthEnd,
    };
  }

  /**
   * Get category spending caps with current usage
   */
  async getCategorySpendingCaps(
    userId: string,
  ): Promise<CategorySpendingCap[]> {
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

    // Calculate spending for each category this month
    const capsData: CategorySpendingCap[] = [];

    for (const cap of spendingCaps) {
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
      if (progress >= 100) {
        status = 'OVER';
      } else if (progress >= 80) {
        status = 'NEAR';
      } else {
        status = 'OK';
      }

      capsData.push({
        name: cap.categoryName,
        spent,
        limit,
        progress: Math.round(progress),
        status,
        color: cap.color,
      });
    }

    return capsData;
  }

  /**
   * Deduplicate caps data by category name, keeping the first occurrence
   */
  private deduplicateCaps(
    capsData: CategorySpendingCap[],
  ): CategorySpendingCap[] {
    const seen = new Set<string>();
    return capsData.filter((cap) => {
      if (seen.has(cap.name)) {
        return false;
      }
      seen.add(cap.name);
      return true;
    });
  }

  /**
   * Get upcoming bills (placeholder - will need Bills model)
   */
  async getUpcomingBills(_userId: string): Promise<UpcomingBill[]> {
    // TODO: Implement when Bills model is created
    console.log(_userId);
    // For now, return empty array or mock data for development
    return [
      {
        id: 'bill-1',
        name: 'Electricity Bill',
        amount: 2400,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        category: 'Utilities',
      },
      {
        id: 'bill-2',
        name: 'Internet Bill',
        amount: 1200,
        dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        category: 'Utilities',
      },
    ];
  }

  /**
   * Get recent transaction activity
   */
  async getRecentActivity(userId: string): Promise<TransactionSummary[]> {
    const recentTransactions = await this.prisma.paymentIntent.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 10,
      include: {
        tags: {
          include: {
            category: true,
          },
          take: 1, // Get the primary category
        },
      },
    });

    return recentTransactions.map((txn) => ({
      id: txn.id,
      amount: Number(txn.amount),
      payeeName: txn.payeeName || 'Unknown',
      category: txn.tags[0]?.category.name || 'Other',
      date: txn.completedAt?.toISOString() || txn.createdAt.toISOString(),
      status:
        txn.status === 'SUCCESS'
          ? 'success'
          : txn.status === 'PENDING'
            ? 'pending'
            : 'failed',
    }));
  }

  /**
   * Legacy method - get dashboard insights (for existing endpoints)
   */
  async getDashboardInsights(userId: string): Promise<DashboardInsights> {
    const currentMonth = new Date().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const [userSummary, categoriesRaw, recentTransactions] = await Promise.all([
      this.getUserSpendingSummary(userId),
      this.getCategorySpendingCaps(userId),
      this.getRecentActivity(userId),
    ]);

    // Deduplicate categories to ensure unique entries
    const categories = this.deduplicateCaps(categoriesRaw);

    // Convert CategorySpendingCap to CategoryInsight format
    const categoryInsights: CategoryInsight[] = categories.map((cap) => ({
      id: `cat-${cap.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: cap.name,
      color: cap.color,
      spentThisMonth: cap.spent,
      budgetAmount: cap.limit,
      percentage: cap.progress,
      state:
        cap.status === 'OK'
          ? 'healthy'
          : cap.status === 'NEAR'
            ? 'warning'
            : 'exceeded',
      transactions: 0, // TODO: Calculate transaction count
    }));

    const totalSpent = userSummary.totalSpent;

    // Calculate previous month delta (placeholder)
    const prevMonthDelta = -12.5; // TODO: Calculate actual delta

    return {
      month: currentMonth,
      totalSpent,
      prevMonthDelta,
      categories: categoryInsights,
      recentTransactions,
    };
  }

  /**
   * Get spending trend over time
   */
  async getSpendingTrend(userId: string) {
    const months = [];
    const currentDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);

      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      // Get spending for this month
      const monthlyTransactions = await this.prisma.paymentIntent.findMany({
        where: {
          userId,
          status: 'SUCCESS',
          completedAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        select: { amount: true },
      });

      const spent = monthlyTransactions.reduce(
        (sum, txn) => sum + Number(txn.amount),
        0,
      );

      months.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        spent,
        budget: 40000, // TODO: Get actual budget from user settings
      });
    }

    return {
      trend: months,
      averageMonthly:
        months.reduce((sum, m) => sum + m.spent, 0) / months.length,
      highestMonth: Math.max(...months.map((m) => m.spent)),
      lowestMonth: Math.min(...months.map((m) => m.spent)),
    };
  }
}
