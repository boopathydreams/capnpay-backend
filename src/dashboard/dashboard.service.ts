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
  async getDashboardOverview(
    userId: string,
    month?: number,
    year?: number,
  ): Promise<DashboardOverview> {
    const [userData, capsDataRaw, upcomingBills, recentActivity] =
      await Promise.all([
        this.getUserSpendingSummary(userId, month, year),
        this.getCategorySpendingCaps(userId, month, year),
        this.getUpcomingBills(userId),
        this.getRecentActivity(userId, 5, month, year),
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
  async getUserSpendingSummary(
    userId: string,
    month?: number,
    year?: number,
  ): Promise<UserSpendingSummary> {
    const base = new Date();
    const y = year ?? base.getFullYear();
    const m = month !== undefined ? month : base.getMonth();
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0);
    const today = new Date();
    const daysInMonth = endOfMonth.getDate();
    const daysPassed =
      today.getFullYear() === y && today.getMonth() === m
        ? today.getDate()
        : daysInMonth;
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

    // Get this month's spending from BankingPayment (sent payments only)
    const monthlyPayments = await this.prisma.bankingPayment.findMany({
      where: {
        senderId: userId,
        overallStatus: 'SUCCESS',
        createdAt: {
          gte: startOfMonth,
          lte: new Date(),
        },
      },
      select: { amount: true, createdAt: true },
    });

    const totalSpent = monthlyPayments.reduce(
      (sum, p) => sum + Number(p.amount),
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
    month?: number,
    year?: number,
  ): Promise<CategorySpendingCap[]> {
    const base = new Date();
    const y = year ?? base.getFullYear();
    const m = month !== undefined ? month : base.getMonth();
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0);

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
      // Prefer banking payments by category if present; otherwise fall back to legacy tags
      const bankingSpentAgg = await this.prisma.bankingPayment.aggregate({
        _sum: { amount: true },
        where: {
          senderId: userId,
          overallStatus: 'SUCCESS',
          categoryId: cap.categoryId,
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      let spent = Number(bankingSpentAgg._sum.amount || 0);

      if (spent === 0) {
        const categoryTransactions = await this.prisma.paymentIntent.findMany({
          where: {
            userId,
            status: 'SUCCESS',
            completedAt: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
            tags: {
              some: {
                categoryId: cap.categoryId,
              },
            },
          },
          select: { amount: true },
        });
        spent = categoryTransactions.reduce(
          (sum, txn) => sum + Number(txn.amount),
          0,
        );
      }

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

      capsData.push({
        name: cap.categoryName,
        spent,
        limit,
        progress: Math.round(progress),
        status,
        color: cap.color,
        progressColor, // New field for dynamic progress bar color
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
   * Get recent transaction activity (limit to 5 for home screen)
   */
  async getRecentActivity(
    userId: string,
    limit: number = 5,
    month?: number,
    year?: number,
  ): Promise<TransactionSummary[]> {
    // Optional month filter
    let createdAtFilter: any | undefined = undefined;
    if (month !== undefined || year !== undefined) {
      const base = new Date();
      const y = year ?? base.getFullYear();
      const m = month !== undefined ? month : base.getMonth();
      createdAtFilter = { gte: new Date(y, m, 1), lte: new Date(y, m + 1, 0) };
    }

    const recentPayments = await this.prisma.bankingPayment.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (recentPayments.length > 0) {
      return recentPayments.map((p) => {
        const isSender = p.senderId === userId;
        const counterparty = isSender ? p.receiver : p.sender;
        const status = String(p.overallStatus || 'PENDING').toLowerCase();
        return {
          id: p.id,
          amount: Number(p.amount),
          payeeName:
            counterparty?.name || counterparty?.primaryVpa || 'Unknown',
          category: 'Other',
          date: p.createdAt.toISOString(),
          status:
            status === 'success' || status === 'failed'
              ? (status as any)
              : 'pending',
        } as TransactionSummary;
      });
    }

    // Fallback to legacy PaymentIntent SUCCESS transactions if no banking payments found
    const legacyWhere: any = { userId, status: 'SUCCESS' };
    if (createdAtFilter) {
      legacyWhere.completedAt = createdAtFilter;
    }
    const recentIntents = await this.prisma.paymentIntent.findMany({
      where: legacyWhere,
      orderBy: { completedAt: 'desc' },
      take: limit,
      include: { tags: { include: { category: true } } },
    });

    return recentIntents.map((txn) => ({
      id: txn.id,
      amount: Number(txn.amount),
      payeeName: txn.payeeName || 'Unknown',
      category: txn.tags[0]?.category?.name || 'Other',
      date: txn.completedAt?.toISOString() || txn.createdAt.toISOString(),
      status: 'success',
    }));
  }

  /**
   * Legacy method - get dashboard insights (for existing endpoints)
   */
  async getDashboardInsights(
    userId: string,
    month?: number,
    year?: number,
  ): Promise<DashboardInsights> {
    const currentMonth = new Date().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const [userSummary, categoriesRaw, recentTransactions] = await Promise.all([
      this.getUserSpendingSummary(userId, month, year),
      this.getCategorySpendingCaps(userId, month, year),
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
  async getSpendingTrend(userId: string, month?: number, year?: number) {
    const months = [] as { month: string; spent: number; budget: number }[];
    const base = new Date();
    const baseYear = year ?? base.getFullYear();
    const baseMonth = month !== undefined ? month : base.getMonth();
    const currentDate = new Date(baseYear, baseMonth, 1);

    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);

      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      // Use BankingPayment: outgoing (senderId = user) and SUCCESS
      const monthlyPayments = await this.prisma.bankingPayment.findMany({
        where: {
          senderId: userId,
          overallStatus: 'SUCCESS',
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        select: { amount: true },
      });

      const spent = monthlyPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      months.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        spent,
        budget: 40000, // TODO: Get actual budget from user settings
      });
    }

    const averageMonthly = months.length
      ? months.reduce((sum, m) => sum + m.spent, 0) / months.length
      : 0;
    const totals = months.map((m) => m.spent);
    const highestMonth = totals.length ? Math.max(...totals) : 0;
    const lowestMonth = totals.length ? Math.min(...totals) : 0;

    // Provide trendData to match mobile API expectations; keep legacy keys as well
    return {
      trendData: months,
      trend: months,
      averageMonthly,
      highestMonth,
      lowestMonth,
    };
  }

  /**
   * Get transactions for a specific category
   */
  async getCategoryTransactions(
    userId: string,
    categoryName: string,
    limit?: number,
  ) {
    // Find the category
    const category = await this.prisma.category.findFirst({
      where: {
        userId,
        name: {
          equals: categoryName,
          mode: 'insensitive',
        },
      },
    });

    if (!category) {
      throw new Error(`Category '${categoryName}' not found`);
    }

    // Get transactions for this category
    const transactions = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        status: 'SUCCESS',
        tags: {
          some: {
            categoryId: category.id,
          },
        },
      },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: limit,
    });

    return {
      category: {
        id: category.id,
        name: category.name,
        color: category.color,
      },
      transactions: transactions.map((txn) => ({
        id: txn.id,
        amount: Number(txn.amount),
        payeeName: txn.payeeName || 'Unknown',
        vpa: txn.vpa,
        date: txn.completedAt?.toISOString() || txn.createdAt.toISOString(),
        status: txn.status.toLowerCase(),
        note: txn.noteLong,
        trRef: txn.trRef,
      })),
      summary: {
        totalTransactions: transactions.length,
        totalAmount: transactions.reduce(
          (sum, txn) => sum + Number(txn.amount),
          0,
        ),
      },
    };
  }

  /**
   * Get all transactions for the user with pagination
   */
  async getAllTransactions(userId: string, limit?: number, offset?: number) {
    const transactions = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        status: 'SUCCESS',
      },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    const totalCount = await this.prisma.paymentIntent.count({
      where: {
        userId,
        status: 'SUCCESS',
      },
    });

    return {
      transactions: transactions.map((txn) => ({
        id: txn.id,
        amount: Number(txn.amount),
        payeeName: txn.payeeName || 'Unknown',
        vpa: txn.vpa,
        date: txn.completedAt?.toISOString() || txn.createdAt.toISOString(),
        status: txn.status.toLowerCase(),
        category: txn.tags[0]?.category?.name || 'Other',
        note: txn.noteLong,
        trRef: txn.trRef,
      })),
      pagination: {
        total: totalCount,
        limit: limit || totalCount,
        offset: offset || 0,
        hasMore: (offset || 0) + (limit || totalCount) < totalCount,
      },
    };
  }

  /**
   * Get comprehensive caps overview with detailed spending information
   */
  async getCapsOverview(userId: string) {
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

    let totalBudget = 0;
    let totalSpent = 0;
    const caps = [];

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
      const progressPercent = limit > 0 ? (spent / limit) * 100 : 0;
      const remaining = Math.max(0, limit - spent);

      let progressColor: string;
      if (progressPercent >= 90) {
        progressColor = 'red';
      } else if (progressPercent >= 70) {
        progressColor = 'orange';
      } else {
        progressColor = 'green';
      }

      totalBudget += limit;
      totalSpent += spent;

      caps.push({
        category: cap.categoryName,
        limit,
        spent,
        remaining,
        progressPercent: Math.round(progressPercent * 10) / 10, // Round to 1 decimal
        progressColor,
        transactionCount: categoryTransactions.length,
      });
    }

    const totalRemaining = Math.max(0, totalBudget - totalSpent);
    const overallProgress =
      totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    return {
      totalBudget,
      totalSpent,
      totalRemaining,
      overallProgress: Math.round(overallProgress * 10) / 10, // Round to 1 decimal
      caps,
    };
  }
}
