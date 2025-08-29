import { Injectable } from '@nestjs/common';
import {
  DashboardInsights,
  CategoryInsight,
  TransactionSummary,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  async getDashboardInsights(_userId: string): Promise<DashboardInsights> {
    // TODO: Replace with actual database queries
    // For now, returning mock data for development

    const currentMonth = new Date().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const mockCategories: CategoryInsight[] = [
      {
        id: 'cat-food',
        name: 'Food & Dining',
        color: '#FF6B6B',
        spentThisMonth: 8500,
        budgetAmount: 12000,
        percentage: 70.8,
        state: 'healthy',
        transactions: 24,
      },
      {
        id: 'cat-transport',
        name: 'Transport',
        color: '#4ECDC4',
        spentThisMonth: 3200,
        budgetAmount: 4000,
        percentage: 80,
        state: 'warning',
        transactions: 12,
      },
      {
        id: 'cat-shopping',
        name: 'Shopping',
        color: '#45B7D1',
        spentThisMonth: 15000,
        budgetAmount: 10000,
        percentage: 150,
        state: 'exceeded',
        transactions: 8,
      },
      {
        id: 'cat-utilities',
        name: 'Bills & Utilities',
        color: '#FFA07A',
        spentThisMonth: 4500,
        budgetAmount: 5000,
        percentage: 90,
        state: 'warning',
        transactions: 6,
      },
      {
        id: 'cat-entertainment',
        name: 'Entertainment',
        color: '#98D8C8',
        spentThisMonth: 2800,
        budgetAmount: 4000,
        percentage: 70,
        state: 'healthy',
        transactions: 7,
      },
    ];

    const mockRecentTransactions: TransactionSummary[] = [
      {
        id: 'txn-1',
        amount: 1200,
        payeeName: 'Swiggy',
        category: 'Food & Dining',
        date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        status: 'success',
      },
      {
        id: 'txn-2',
        amount: 250,
        payeeName: 'Metro Card',
        category: 'Transport',
        date: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        status: 'success',
      },
      {
        id: 'txn-3',
        amount: 3500,
        payeeName: 'Amazon',
        category: 'Shopping',
        date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        status: 'success',
      },
      {
        id: 'txn-4',
        amount: 890,
        payeeName: 'BookMyShow',
        category: 'Entertainment',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      },
    ];

    const totalSpent = mockCategories.reduce(
      (sum, cat) => sum + cat.spentThisMonth,
      0,
    );

    return {
      month: currentMonth,
      totalSpent,
      prevMonthDelta: -12.5, // 12.5% decrease from last month
      categories: mockCategories,
      recentTransactions: mockRecentTransactions,
    };
  }

  async getSpendingTrend(_userId: string) {
    // TODO: Replace with actual database queries
    // Mock spending trend data for the last 6 months
    const months = [];
    const currentDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);

      months.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        spent: Math.floor(Math.random() * 20000) + 25000, // Random between 25k-45k
        budget: 40000,
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
