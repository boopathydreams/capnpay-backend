import { Injectable } from '@nestjs/common';

export interface ContactRelationship {
  contactPhone: string;
  contactVpa: string;
  contactName: string;
  trustScore: number;
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  averageAmount: number;
  relationshipType: 'personal' | 'merchant' | 'professional' | 'unknown';
  firstInteraction: Date;
  lastInteraction: Date;
}

export interface RelationshipInsights {
  trustScore: number;
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  averageAmount: number;
  relationshipType: 'personal' | 'merchant' | 'professional' | 'unknown';
  lastInteraction: string;
  frequencyScore: number;
  consistencyScore: number;
  reciprocityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAmount?: number;
  behavioralInsights: string[];
}

@Injectable()
export class RelationshipAnalyzerService {
  /**
   * Calculate trust score based on multiple factors
   */
  calculateTrustScore(
    totalSent: number,
    totalReceived: number,
    transactionCount: number,
    successRate: number,
    daysSinceFirstInteraction: number,
    daysSinceLastInteraction: number,
  ): number {
    // Frequency Score (0-25 points): More transactions = higher trust
    const frequencyScore = Math.min(transactionCount * 2, 25);

    // Success Rate Score (0-20 points): Higher success rate = higher trust
    const successScore = successRate * 20;

    // Reciprocity Score (0-20 points): Balanced sending/receiving = higher trust
    const totalVolume = totalSent + totalReceived;
    const reciprocityBalance =
      totalVolume > 0
        ? 1 - Math.abs(totalSent - totalReceived) / totalVolume
        : 0;
    const reciprocityScore = reciprocityBalance * 20;

    // Longevity Score (0-15 points): Longer relationship = higher trust
    const longevityScore = Math.min(daysSinceFirstInteraction / 30, 1) * 15;

    // Recency Score (0-20 points): Recent activity = higher trust
    const recencyScore =
      daysSinceLastInteraction <= 7
        ? 20
        : daysSinceLastInteraction <= 30
          ? 15
          : daysSinceLastInteraction <= 90
            ? 10
            : 5;

    const totalScore =
      frequencyScore +
      successScore +
      reciprocityScore +
      longevityScore +
      recencyScore;
    return Math.min(Math.round(totalScore), 100);
  }

  /**
   * Classify relationship type based on transaction patterns
   */
  classifyRelationshipType(
    transactions: Array<{
      amount: number;
      timestamp: Date;
      type: 'sent' | 'received';
      category?: string;
    }>,
    contactVpa?: string,
  ): 'personal' | 'merchant' | 'professional' | 'unknown' {
    if (transactions.length === 0) return 'unknown';

    // Merchant indicators
    const merchantIndicators = {
      roundAmounts: 0,
      businessHours: 0,
      oneWayTransactions: 0,
      merchantVpaPatterns: 0,
    };

    // Personal indicators
    const personalIndicators = {
      irregularAmounts: 0,
      bidirectionalTransactions: 0,
      smallAmounts: 0,
      weekendActivity: 0,
    };

    for (const tx of transactions) {
      // Check for round amounts (merchant indicator)
      if (tx.amount % 100 === 0 || tx.amount % 50 === 0) {
        merchantIndicators.roundAmounts++;
      } else {
        personalIndicators.irregularAmounts++;
      }

      // Check transaction timing
      const hour = tx.timestamp.getHours();
      const dayOfWeek = tx.timestamp.getDay();

      if (hour >= 9 && hour <= 18 && dayOfWeek >= 1 && dayOfWeek <= 5) {
        merchantIndicators.businessHours++;
      }

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        personalIndicators.weekendActivity++;
      }

      // Check amount size
      if (tx.amount < 1000) {
        personalIndicators.smallAmounts++;
      }
    }

    // Check for bidirectional vs one-way transactions
    const sentCount = transactions.filter((tx) => tx.type === 'sent').length;
    const receivedCount = transactions.filter(
      (tx) => tx.type === 'received',
    ).length;

    if (receivedCount === 0) {
      merchantIndicators.oneWayTransactions = transactions.length;
    } else if (Math.abs(sentCount - receivedCount) <= 2) {
      personalIndicators.bidirectionalTransactions = transactions.length;
    }

    // Check VPA patterns for merchant indicators
    if (contactVpa) {
      const merchantKeywords = [
        'pay',
        'payment',
        'merchant',
        'store',
        'shop',
        'business',
      ];
      if (
        merchantKeywords.some((keyword) =>
          contactVpa.toLowerCase().includes(keyword),
        )
      ) {
        merchantIndicators.merchantVpaPatterns = 5;
      }
    }

    // Calculate scores
    const merchantScore = Object.values(merchantIndicators).reduce(
      (a, b) => a + b,
      0,
    );
    const personalScore = Object.values(personalIndicators).reduce(
      (a, b) => a + b,
      0,
    );

    // Determine relationship type
    if (merchantScore > personalScore * 1.5) {
      return 'merchant';
    } else if (personalScore > merchantScore) {
      return 'personal';
    } else if (transactions.length >= 5 && merchantScore > 0) {
      return 'professional';
    }

    return 'unknown';
  }

  /**
   * Generate behavioral insights based on transaction patterns
   */
  generateBehavioralInsights(
    totalSent: number,
    totalReceived: number,
    transactionCount: number,
    averageAmount: number,
    relationshipType: string,
  ): string[] {
    const insights: string[] = [];

    // Spending pattern insights
    if (totalSent > totalReceived * 3) {
      insights.push("You're primarily a sender in this relationship");
    } else if (totalReceived > totalSent * 3) {
      insights.push('You receive more than you send from this contact');
    } else if (Math.abs(totalSent - totalReceived) <= averageAmount) {
      insights.push('Balanced financial relationship with regular exchanges');
    }

    // Frequency insights
    if (transactionCount >= 20) {
      insights.push('High-frequency contact with strong payment history');
    } else if (transactionCount >= 10) {
      insights.push('Regular payment partner with moderate activity');
    } else if (transactionCount >= 5) {
      insights.push('Emerging payment relationship');
    }

    // Amount pattern insights
    if (averageAmount >= 5000) {
      insights.push(
        'High-value transactions - consider this for large payments',
      );
    } else if (averageAmount <= 100) {
      insights.push('Micro-payment pattern - great for small splits');
    }

    // Relationship-specific insights
    switch (relationshipType) {
      case 'merchant':
        insights.push('Business relationship - payments typically final');
        break;
      case 'personal':
        insights.push('Personal contact - flexible payment arrangements');
        break;
      case 'professional':
        insights.push('Professional relationship - structured payments');
        break;
    }

    return insights;
  }

  /**
   * Recommend payment amount based on historical patterns
   */
  recommendPaymentAmount(
    transactions: Array<{ amount: number; timestamp: Date }>,
    relationshipType: string,
  ): number | null {
    if (transactions.length === 0) return null;

    // Get recent transactions (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentTransactions = transactions.filter(
      (tx) => tx.timestamp >= thirtyDaysAgo,
    );

    if (recentTransactions.length === 0) {
      // Fall back to all transactions
      const amounts = transactions.map((tx) => tx.amount);
      return Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    }

    // Calculate mode (most frequent amount) for merchants
    if (relationshipType === 'merchant') {
      const amountFrequency = new Map<number, number>();
      recentTransactions.forEach((tx) => {
        amountFrequency.set(
          tx.amount,
          (amountFrequency.get(tx.amount) || 0) + 1,
        );
      });

      let maxFreq = 0;
      let modeAmount = 0;
      amountFrequency.forEach((freq, amount) => {
        if (freq > maxFreq) {
          maxFreq = freq;
          modeAmount = amount;
        }
      });

      if (maxFreq >= 2) return modeAmount;
    }

    // Calculate median for personal relationships (more stable than mean)
    const amounts = recentTransactions
      .map((tx) => tx.amount)
      .sort((a, b) => a - b);
    const mid = Math.floor(amounts.length / 2);

    if (amounts.length % 2 === 0) {
      return Math.round((amounts[mid - 1] + amounts[mid]) / 2);
    } else {
      return amounts[mid];
    }
  }

  /**
   * Get comprehensive relationship insights for a contact
   */
  async getRelationshipInsights(
    userId: string,
    contactVpa: string,
  ): Promise<RelationshipInsights> {
    // Mock data - replace with actual database queries
    const mockTransactions = [
      {
        amount: 500,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        type: 'sent' as const,
        category: 'Food',
      },
      {
        amount: 300,
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        type: 'received' as const,
        category: 'Entertainment',
      },
      {
        amount: 1200,
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        type: 'sent' as const,
        category: 'Shopping',
      },
      {
        amount: 800,
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        type: 'sent' as const,
        category: 'Transport',
      },
    ];

    const totalSent = mockTransactions
      .filter((tx) => tx.type === 'sent')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalReceived = mockTransactions
      .filter((tx) => tx.type === 'received')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const transactionCount = mockTransactions.length;
    const averageAmount = Math.round(
      (totalSent + totalReceived) / transactionCount,
    );

    const relationshipType = this.classifyRelationshipType(
      mockTransactions,
      contactVpa,
    );
    const successRate = 0.95; // 95% success rate (mock)
    const daysSinceFirstInteraction = 30;
    const daysSinceLastInteraction = 0;

    const trustScore = this.calculateTrustScore(
      totalSent,
      totalReceived,
      transactionCount,
      successRate,
      daysSinceFirstInteraction,
      daysSinceLastInteraction,
    );

    const behavioralInsights = this.generateBehavioralInsights(
      totalSent,
      totalReceived,
      transactionCount,
      averageAmount,
      relationshipType,
    );

    const recommendedAmount = this.recommendPaymentAmount(
      mockTransactions,
      relationshipType,
    );

    return {
      trustScore,
      totalSent,
      totalReceived,
      transactionCount,
      averageAmount,
      relationshipType,
      lastInteraction: '2 hours ago',
      frequencyScore: Math.min(transactionCount * 5, 100),
      consistencyScore: 85, // Mock value
      reciprocityScore: Math.round(
        (1 -
          Math.abs(totalSent - totalReceived) / (totalSent + totalReceived)) *
          100,
      ),
      riskLevel:
        trustScore >= 70 ? 'low' : trustScore >= 40 ? 'medium' : 'high',
      recommendedAmount,
      behavioralInsights,
    };
  }
}
