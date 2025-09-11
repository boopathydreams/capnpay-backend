import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface TrustScoreFactors {
  transactionHistory: number; // 0-25 points
  reciprocity: number; // 0-20 points
  consistency: number; // 0-20 points
  networkTrust: number; // 0-15 points
  timebasedTrust: number; // 0-10 points
  riskFactors: number; // -20 to 0 points
  verification: number; // 0-10 points
}

export interface ContactTrustProfile {
  contactId: string;
  vpa: string;
  name: string;
  phone?: string;
  trustScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  relationshipType: 'family' | 'friend' | 'colleague' | 'merchant' | 'unknown';
  trustFactors: TrustScoreFactors;
  behavioralInsights: BehavioralInsight[];
  riskIndicators: RiskIndicator[];
  recommendedActions: RecommendedAction[];
  lastUpdated: Date;
}

export interface BehavioralInsight {
  type:
    | 'spending_pattern'
    | 'frequency_change'
    | 'amount_anomaly'
    | 'timing_pattern';
  description: string;
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  timeframe: string;
}

export interface RiskIndicator {
  type:
    | 'unusual_amounts'
    | 'frequency_spike'
    | 'new_contact'
    | 'failed_transactions'
    | 'suspicious_pattern';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: Date;
  falsePositiveRate: number;
}

export interface RecommendedAction {
  type:
    | 'set_limit'
    | 'require_confirmation'
    | 'add_to_trusted'
    | 'verify_contact'
    | 'monitor_closely';
  priority: 'low' | 'medium' | 'high';
  description: string;
  expectedImpact: string;
}

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate comprehensive trust score for a contact
   */
  async calculateTrustScore(
    userId: string,
    contactVpa: string,
  ): Promise<ContactTrustProfile> {
    const transactions = await this.getContactTransactions(userId, contactVpa);
    const networkData = await this.getNetworkTrustData(contactVpa);
    const riskAnalysis = await this.analyzeRiskFactors(
      userId,
      contactVpa,
      transactions,
    );

    const trustFactors = this.calculateTrustFactors(
      transactions,
      networkData,
      riskAnalysis,
    );
    const totalTrustScore = this.aggregateTrustScore(trustFactors);

    const profile: ContactTrustProfile = {
      contactId: `${userId}_${contactVpa}`,
      vpa: contactVpa,
      name: transactions[0]?.payeeName || 'Unknown',
      trustScore: totalTrustScore,
      riskLevel: this.determineRiskLevel(totalTrustScore, riskAnalysis),
      relationshipType: this.classifyRelationship(transactions),
      trustFactors,
      behavioralInsights: await this.generateBehavioralInsights(
        userId,
        contactVpa,
        transactions,
      ),
      riskIndicators: riskAnalysis,
      recommendedActions: this.generateRecommendations(
        totalTrustScore,
        riskAnalysis,
      ),
      lastUpdated: new Date(),
    };

    // Store trust score for ML training
    await this.storeTrustScore(profile);

    return profile;
  }

  /**
   * Calculate individual trust factors
   */
  private calculateTrustFactors(
    transactions: any[],
    networkData: any,
    riskAnalysis: RiskIndicator[],
  ): TrustScoreFactors {
    // Transaction History Score (0-25)
    const transactionHistory = Math.min(
      transactions.length * 2 +
        (transactions.filter((t) => t.status === 'SUCCESS').length /
          transactions.length) *
          10,
      25,
    );

    // Reciprocity Score (0-20) - Bidirectional transactions indicate trust
    const sentCount = transactions.filter((t) => t.type === 'sent').length;
    const receivedCount = transactions.filter(
      (t) => t.type === 'received',
    ).length;
    const reciprocity =
      transactions.length > 0
        ? Math.min(20 - Math.abs(sentCount - receivedCount) * 2, 20)
        : 0;

    // Consistency Score (0-20) - Regular, predictable amounts
    const amounts = transactions.map((t) => Number(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length || 0;
    const variance =
      amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) /
      amounts.length;
    const consistency =
      avgAmount > 0
        ? Math.max(0, 20 - (Math.sqrt(variance) / avgAmount) * 10)
        : 0;

    // Network Trust Score (0-15) - How trusted this contact is by others
    const networkTrust = Math.min(networkData.communityTrustScore || 0, 15);

    // Time-based Trust Score (0-10) - Longer relationships score higher
    const oldestTransaction = transactions.reduce(
      (oldest, t) => (t.completedAt < oldest ? t.completedAt : oldest),
      new Date(),
    );
    const daysSinceFirst = Math.floor(
      (Date.now() - oldestTransaction.getTime()) / (1000 * 60 * 60 * 24),
    );
    const timebasedTrust = Math.min(daysSinceFirst / 30, 10); // Max trust after 10 months

    // Risk Factors (-20 to 0) - Negative points for suspicious behavior
    const riskFactors = Math.max(
      -riskAnalysis.reduce(
        (total, risk) =>
          total +
          (risk.severity === 'high' ? 10 : risk.severity === 'medium' ? 5 : 2),
        0,
      ),
      -20,
    );

    // Verification Score (0-10) - Verified contacts get bonus points
    const verification = networkData.isVerified ? 10 : 0;

    return {
      transactionHistory,
      reciprocity,
      consistency,
      networkTrust,
      timebasedTrust,
      riskFactors,
      verification,
    };
  }

  /**
   * Aggregate trust factors into final score
   */
  private aggregateTrustScore(factors: TrustScoreFactors): number {
    return Math.max(
      0,
      Math.min(
        100,
        factors.transactionHistory +
          factors.reciprocity +
          factors.consistency +
          factors.networkTrust +
          factors.timebasedTrust +
          factors.riskFactors +
          factors.verification,
      ),
    );
  }

  /**
   * Generate behavioral insights using ML patterns
   */
  private async generateBehavioralInsights(
    userId: string,
    contactVpa: string,
    transactions: any[],
  ): Promise<BehavioralInsight[]> {
    const insights: BehavioralInsight[] = [];

    if (transactions.length < 2) return insights;

    // Spending pattern analysis
    const recentTransactions = transactions.slice(0, 10);
    const olderTransactions = transactions.slice(10, 20);

    if (recentTransactions.length > 0 && olderTransactions.length > 0) {
      const recentAvg =
        recentTransactions.reduce((sum, t) => sum + Number(t.amount), 0) /
        recentTransactions.length;
      const olderAvg =
        olderTransactions.reduce((sum, t) => sum + Number(t.amount), 0) /
        olderTransactions.length;

      const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

      if (Math.abs(changePercent) > 20) {
        insights.push({
          type: 'spending_pattern',
          description: `Average transaction amount has ${changePercent > 0 ? 'increased' : 'decreased'} by ${Math.abs(changePercent).toFixed(1)}% recently`,
          confidence: 0.8,
          trend: changePercent > 0 ? 'increasing' : 'decreasing',
          timeframe: 'last_10_transactions',
        });
      }
    }

    // Frequency analysis
    const last30Days = transactions.filter(
      (t) => Date.now() - t.completedAt.getTime() < 30 * 24 * 60 * 60 * 1000,
    );
    const previous30Days = transactions.filter((t) => {
      const daysDiff =
        (Date.now() - t.completedAt.getTime()) / (24 * 60 * 60 * 1000);
      return daysDiff >= 30 && daysDiff < 60;
    });

    if (last30Days.length > 0 && previous30Days.length > 0) {
      const frequencyChange =
        ((last30Days.length - previous30Days.length) / previous30Days.length) *
        100;

      if (Math.abs(frequencyChange) > 50) {
        insights.push({
          type: 'frequency_change',
          description: `Transaction frequency has ${frequencyChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(frequencyChange).toFixed(1)}% this month`,
          confidence: 0.75,
          trend: frequencyChange > 0 ? 'increasing' : 'decreasing',
          timeframe: 'last_30_days',
        });
      }
    }

    return insights;
  }

  /**
   * Analyze risk factors using anomaly detection
   */
  private async analyzeRiskFactors(
    userId: string,
    contactVpa: string,
    transactions: any[],
  ): Promise<RiskIndicator[]> {
    const riskIndicators: RiskIndicator[] = [];

    // New contact risk
    if (transactions.length <= 2) {
      riskIndicators.push({
        type: 'new_contact',
        severity: 'medium',
        description: 'Limited transaction history with this contact',
        detectedAt: new Date(),
        falsePositiveRate: 0.3,
      });
    }

    // Unusual amount detection
    const amounts = transactions.map((t) => Number(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const recentLargeTransactions = transactions
      .slice(0, 5)
      .filter((t) => Number(t.amount) > avgAmount * 3);

    if (recentLargeTransactions.length > 0) {
      riskIndicators.push({
        type: 'unusual_amounts',
        severity: 'high',
        description: `Recent transactions significantly above average (${avgAmount.toFixed(0)})`,
        detectedAt: new Date(),
        falsePositiveRate: 0.15,
      });
    }

    // Failed transaction pattern
    const recentFailures = transactions
      .slice(0, 10)
      .filter((t) => t.status === 'FAILED');

    if (recentFailures.length > 2) {
      riskIndicators.push({
        type: 'failed_transactions',
        severity: 'medium',
        description: 'Multiple recent failed transactions detected',
        detectedAt: new Date(),
        falsePositiveRate: 0.25,
      });
    }

    // Frequency spike detection
    const last7Days = transactions.filter(
      (t) => Date.now() - t.completedAt.getTime() < 7 * 24 * 60 * 60 * 1000,
    );

    if (last7Days.length > 5 && transactions.length > 10) {
      riskIndicators.push({
        type: 'frequency_spike',
        severity: 'medium',
        description: 'Unusual spike in transaction frequency detected',
        detectedAt: new Date(),
        falsePositiveRate: 0.4,
      });
    }

    return riskIndicators;
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    trustScore: number,
    riskIndicators: RiskIndicator[],
  ): RecommendedAction[] {
    const recommendations: RecommendedAction[] = [];

    // Low trust score recommendations
    if (trustScore < 30) {
      recommendations.push({
        type: 'require_confirmation',
        priority: 'high',
        description: 'Enable payment confirmations for transactions above ₹500',
        expectedImpact: 'Prevent unauthorized or accidental large payments',
      });
    }

    // Medium trust score recommendations
    if (trustScore >= 30 && trustScore < 70) {
      recommendations.push({
        type: 'set_limit',
        priority: 'medium',
        description: 'Set a daily transaction limit of ₹5,000 for this contact',
        expectedImpact: 'Balance convenience with security',
      });
    }

    // High trust score recommendations
    if (trustScore >= 80) {
      recommendations.push({
        type: 'add_to_trusted',
        priority: 'low',
        description: 'Add to trusted contacts for faster payments',
        expectedImpact: 'Improve payment experience for trusted relationships',
      });
    }

    // Risk-based recommendations
    const hasHighRisk = riskIndicators.some((r) => r.severity === 'high');
    if (hasHighRisk) {
      recommendations.push({
        type: 'monitor_closely',
        priority: 'high',
        description: 'Enable enhanced monitoring for suspicious activity',
        expectedImpact:
          'Early detection of potential fraud or account compromise',
      });
    }

    return recommendations;
  }

  // Helper methods
  private async getContactTransactions(userId: string, contactVpa: string) {
    return await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        vpa: contactVpa,
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
    });
  }

  private async getNetworkTrustData(contactVpa: string) {
    // Get community trust data for this VPA
    const communityTrustData = await this.prisma.paymentIntent.groupBy({
      by: ['vpa'],
      where: { vpa: contactVpa },
      _count: {
        id: true,
      },
      _avg: {
        amount: true,
      },
    });

    return {
      communityTrustScore: Math.min(communityTrustData[0]?._count.id || 0, 15),
      isVerified: false, // Future: implement VPA verification
    };
  }

  private determineRiskLevel(
    trustScore: number,
    riskIndicators: RiskIndicator[],
  ): ContactTrustProfile['riskLevel'] {
    const highRiskCount = riskIndicators.filter(
      (r) => r.severity === 'high',
    ).length;

    if (trustScore < 20 || highRiskCount >= 2) return 'critical';
    if (trustScore < 40 || highRiskCount >= 1) return 'high';
    if (trustScore < 70) return 'medium';
    return 'low';
  }

  private classifyRelationship(
    transactions: any[],
  ): ContactTrustProfile['relationshipType'] {
    // Simple classification based on transaction patterns
    // Future: Use ML model for better classification

    if (transactions.length === 0) return 'unknown';

    const amounts = transactions.map((t) => Number(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // Large, regular amounts suggest family/close relationships
    if (
      avgAmount > 2000 &&
      amounts.every((a) => Math.abs(a - avgAmount) / avgAmount < 0.3)
    ) {
      return 'family';
    }

    // Small, frequent amounts suggest friends
    if (avgAmount < 1000 && transactions.length > 5) {
      return 'friend';
    }

    // Business-hour transactions suggest colleagues
    const businessHourTxns = transactions.filter((t) => {
      const hour = t.completedAt.getHours();
      return hour >= 9 && hour <= 18;
    });

    if (businessHourTxns.length / transactions.length > 0.7) {
      return 'colleague';
    }

    return 'unknown';
  }

  private async storeTrustScore(profile: ContactTrustProfile) {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO contact_trust_scores (
          user_id,
          contact_vpa,
          trust_score,
          risk_level,
          relationship_type,
          trust_factors,
          updated_at
        ) VALUES (
          ${profile.contactId.split('_')[0]},
          ${profile.vpa},
          ${profile.trustScore},
          ${profile.riskLevel},
          ${profile.relationshipType},
          ${JSON.stringify(profile.trustFactors)},
          NOW()
        )
        ON CONFLICT (user_id, contact_vpa)
        DO UPDATE SET
          trust_score = EXCLUDED.trust_score,
          risk_level = EXCLUDED.risk_level,
          relationship_type = EXCLUDED.relationship_type,
          trust_factors = EXCLUDED.trust_factors,
          updated_at = EXCLUDED.updated_at
      `;
    } catch (error) {
      this.logger.error('Failed to store trust score:', error);
    }
  }
}
