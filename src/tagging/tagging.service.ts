import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface TagSuggestion {
  categoryId: string;
  tagText: string;
  confidence: number;
  category: {
    id: string;
    name: string;
    color: string;
  };
}

export interface PaymentNudge {
  id: string;
  type: 'warning' | 'info' | 'success';
  severity: 'low' | 'medium' | 'high';
  icon: string;
  message: string;
  action?: string;
  color: string;
}

export interface PaymentAnalysis {
  suggestedTag: TagSuggestion;
  aiNudges: PaymentNudge[];
  spendingInsights: {
    currentMonthSpent: number;
    averageTransactionAmount: number;
    lastTransactionDays: number;
    frequencyScore: number;
  };
}

export interface TaggingContext {
  userId: string;
  vpa: string;
  payeeName?: string;
  amount: number;
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0-6 (Sunday = 0)
}

@Injectable()
export class TaggingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate AI-suggested tag based on payment context
   */
  async suggestTag(context: TaggingContext): Promise<TagSuggestion> {
    // Try to get suggestion from user's payment history
    const historicalSuggestion = await this.getHistoricalSuggestion(context);
    if (historicalSuggestion) {
      return historicalSuggestion;
    }

    // Fallback to payee name pattern matching
    const payeeBasedSuggestion = await this.getPayeeBasedSuggestion(context);
    if (payeeBasedSuggestion) {
      return payeeBasedSuggestion;
    }

    // Final fallback to amount-based heuristics
    return this.getAmountBasedSuggestion(context);
  }

  /**
   * Get suggestion based on user's historical payments to same payee/VPA
   */
  private async getHistoricalSuggestion(
    context: TaggingContext,
  ): Promise<TagSuggestion | null> {
    // Look for most recent payment to same VPA or payee name
    const recentPayment = await this.prisma.paymentIntent.findFirst({
      where: {
        userId: context.userId,
        OR: [
          { vpa: context.vpa },
          ...(context.payeeName
            ? [{ payeeName: { contains: context.payeeName } }]
            : []),
        ],
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
    });

    if (recentPayment?.tags?.[0]) {
      const tag = recentPayment.tags[0];
      return {
        categoryId: tag.categoryId,
        tagText: tag.tagText,
        confidence: 0.9, // High confidence for historical match
        category: tag.category,
      };
    }

    return null;
  }

  /**
   * Get suggestion based on payee name patterns
   */
  private async getPayeeBasedSuggestion(
    context: TaggingContext,
  ): Promise<TagSuggestion | null> {
    if (!context.payeeName) return null;

    const payeeName = context.payeeName.toLowerCase();

    // Get user's categories
    const categories = await this.prisma.category.findMany({
      where: { userId: context.userId },
    });

    // Food & dining patterns
    const foodPatterns = [
      'zomato',
      'swiggy',
      'uber eats',
      'dominos',
      'pizza',
      'restaurant',
      'cafe',
      'food',
      'kitchen',
      'canteen',
    ];
    if (foodPatterns.some((pattern) => payeeName.includes(pattern))) {
      const foodCategory = categories.find((cat) =>
        ['food', 'dining'].some((keyword) =>
          cat.name.toLowerCase().includes(keyword),
        ),
      );
      if (foodCategory) {
        return {
          categoryId: foodCategory.id,
          tagText: 'Food delivery',
          confidence: 0.8,
          category: {
            id: foodCategory.id,
            name: foodCategory.name,
            color: foodCategory.color,
          },
        };
      }
    }

    // Shopping patterns
    const shoppingPatterns = [
      'amazon',
      'flipkart',
      'myntra',
      'shopping',
      'store',
      'mall',
      'mart',
      'bazaar',
    ];
    if (shoppingPatterns.some((pattern) => payeeName.includes(pattern))) {
      const shoppingCategory = categories.find((cat) =>
        cat.name.toLowerCase().includes('shopping'),
      );
      if (shoppingCategory) {
        return {
          categoryId: shoppingCategory.id,
          tagText: 'Online shopping',
          confidence: 0.8,
          category: {
            id: shoppingCategory.id,
            name: shoppingCategory.name,
            color: shoppingCategory.color,
          },
        };
      }
    }

    // Transport patterns
    const transportPatterns = [
      'uber',
      'ola',
      'rapido',
      'metro',
      'bus',
      'taxi',
      'auto',
      'cab',
    ];
    if (transportPatterns.some((pattern) => payeeName.includes(pattern))) {
      const transportCategory = categories.find((cat) =>
        cat.name.toLowerCase().includes('transport'),
      );
      if (transportCategory) {
        return {
          categoryId: transportCategory.id,
          tagText: 'Ride booking',
          confidence: 0.8,
          category: {
            id: transportCategory.id,
            name: transportCategory.name,
            color: transportCategory.color,
          },
        };
      }
    }

    return null;
  }

  /**
   * Get suggestion based on amount and time patterns
   */
  private async getAmountBasedSuggestion(
    context: TaggingContext,
  ): Promise<TagSuggestion> {
    const categories = await this.prisma.category.findMany({
      where: { userId: context.userId },
    });

    // Default to first category or create "Other" suggestion
    const defaultCategory = categories[0];
    if (!defaultCategory) {
      // This should not happen if user has been through onboarding
      throw new Error('User has no categories configured');
    }

    // Amount-based heuristics
    if (context.amount <= 100) {
      return {
        categoryId: defaultCategory.id,
        tagText: 'Small purchase',
        confidence: 0.3,
        category: {
          id: defaultCategory.id,
          name: defaultCategory.name,
          color: defaultCategory.color,
        },
      };
    }

    if (context.amount <= 1000) {
      // Check if it's meal time
      if (
        (context.timeOfDay >= 7 && context.timeOfDay <= 10) ||
        (context.timeOfDay >= 12 && context.timeOfDay <= 14) ||
        (context.timeOfDay >= 19 && context.timeOfDay <= 22)
      ) {
        const foodCategory = categories.find((cat) =>
          ['food', 'dining'].some((keyword) =>
            cat.name.toLowerCase().includes(keyword),
          ),
        );
        if (foodCategory) {
          return {
            categoryId: foodCategory.id,
            tagText: 'Meal',
            confidence: 0.5,
            category: {
              id: foodCategory.id,
              name: foodCategory.name,
              color: foodCategory.color,
            },
          };
        }
      }
    }

    // Default fallback
    return {
      categoryId: defaultCategory.id,
      tagText: 'General',
      confidence: 0.3,
      category: {
        id: defaultCategory.id,
        name: defaultCategory.name,
        color: defaultCategory.color,
      },
    };
  }

  /**
   * Perform real-time payment analysis with nudges
   */
  async analyzePayment(
    userId: string,
    amount: number,
    vpa?: string,
    payeeName?: string,
  ): Promise<PaymentAnalysis> {
    const now = new Date();
    const context: TaggingContext = {
      userId,
      amount,
      vpa,
      payeeName,
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    };

    // Get suggested tag
    const suggestedTag = await this.suggestTag(context);

    // Get spending insights
    const spendingInsights = await this.getSpendingInsights(
      userId,
      vpa,
      payeeName,
    );

    // Generate AI nudges
    const aiNudges = await this.generatePaymentNudges(
      userId,
      amount,
      suggestedTag,
      spendingInsights,
    );

    return {
      suggestedTag,
      aiNudges,
      spendingInsights,
    };
  }

  /**
   * Get spending insights for analysis
   */
  private async getSpendingInsights(
    userId: string,
    vpa?: string,
    payeeName?: string,
  ) {
    const currentMonth = new Date();
    const startOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1,
    );

    // Get current month spending
    const monthlySpending = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        status: 'SUCCESS',
        completedAt: {
          gte: startOfMonth,
        },
      },
    });

    const currentMonthSpent = monthlySpending.reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );

    // Get payee-specific history if available
    let payeeHistory = [];
    if (vpa || payeeName) {
      payeeHistory = await this.prisma.paymentIntent.findMany({
        where: {
          userId,
          status: 'SUCCESS',
          OR: [
            ...(vpa ? [{ vpa }] : []),
            ...(payeeName ? [{ payeeName: { contains: payeeName } }] : []),
          ],
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
      });
    }

    const averageTransactionAmount =
      payeeHistory.length > 0
        ? payeeHistory.reduce((sum, p) => sum + Number(p.amount), 0) /
          payeeHistory.length
        : 0;

    const lastTransaction = payeeHistory[0];
    const lastTransactionDays = lastTransaction
      ? Math.floor(
          (Date.now() - lastTransaction.completedAt.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 999;

    // Calculate frequency score (transactions per month)
    const monthsBack = 3;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - monthsBack);

    const recentHistory = payeeHistory.filter(
      (p) => p.completedAt >= threeMonthsAgo,
    );
    const frequencyScore = recentHistory.length / monthsBack;

    return {
      currentMonthSpent,
      averageTransactionAmount,
      lastTransactionDays,
      frequencyScore,
    };
  }

  /**
   * Generate contextual payment nudges
   */
  private async generatePaymentNudges(
    userId: string,
    amount: number,
    suggestedTag: TagSuggestion,
    insights: any,
  ): Promise<PaymentNudge[]> {
    const nudges: PaymentNudge[] = [];

    // Amount comparison nudge
    if (insights.averageTransactionAmount > 0) {
      const percentDiff =
        ((amount - insights.averageTransactionAmount) /
          insights.averageTransactionAmount) *
        100;

      if (percentDiff > 50) {
        nudges.push({
          id: 'amount_high',
          type: 'warning',
          severity: 'medium',
          icon: '⚠️',
          message: `This is ${Math.round(percentDiff)}% higher than your usual ${insights.averageTransactionAmount.toFixed(0)} to this payee`,
          color: '#FF6B35',
        });
      } else if (percentDiff < -30) {
        nudges.push({
          id: 'amount_low',
          type: 'info',
          severity: 'low',
          icon: '💡',
          message: `Great deal! This is ${Math.round(Math.abs(percentDiff))}% lower than usual`,
          color: '#4ECDC4',
        });
      }
    }

    // Frequency nudge
    if (insights.lastTransactionDays <= 1) {
      nudges.push({
        id: 'frequent_payee',
        type: 'info',
        severity: 'low',
        icon: '🔄',
        message: 'You paid this contact recently',
        color: '#45B7D1',
      });
    }

    // High confidence tag nudge
    if (suggestedTag.confidence > 0.8) {
      nudges.push({
        id: 'confident_tag',
        type: 'success',
        severity: 'low',
        icon: '🎯',
        message: `Auto-tagged as ${suggestedTag.tagText}`,
        color: '#96CEB4',
      });
    }

    // Large amount nudge
    if (amount > 5000) {
      nudges.push({
        id: 'large_amount',
        type: 'warning',
        severity: 'high',
        icon: '💰',
        message: 'Large payment - double check the amount',
        action: 'Verify details',
        color: '#FF6B35',
      });
    }

    return nudges;
  }
}
