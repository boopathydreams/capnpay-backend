import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface MerchantProfile {
  vpa: string;
  merchantName: string;
  category: string;
  confidence: number;
  communityTags: CommunityTag[];
  verificationStatus: 'verified' | 'pending' | 'disputed' | 'unverified';
  businessType: 'individual' | 'small_business' | 'enterprise' | 'unknown';
  riskScore: number;
  transactionPatterns: TransactionPattern;
  lastUpdated: Date;
}

export interface CommunityTag {
  category: string;
  votes: number;
  confidence: number;
  lastVoted: Date;
  contributors: number;
}

export interface TransactionPattern {
  avgAmount: number;
  frequency: number;
  timeDistribution: Record<string, number>; // hour -> frequency
  dayDistribution: Record<string, number>; // day -> frequency
  amountDistribution: {
    min: number;
    max: number;
    median: number;
    commonAmounts: number[];
  };
}

export interface MerchantSuggestion {
  vpa: string;
  merchantName: string;
  suggestedCategory: string;
  confidence: number;
  reasoning: string;
  communityEvidence: {
    totalUsers: number;
    agreementRate: number;
    recentTags: string[];
  };
}

@Injectable()
export class MerchantIntelligenceService {
  private readonly logger = new Logger(MerchantIntelligenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get or create merchant profile with community intelligence
   */
  async getMerchantProfile(
    vpa: string,
    merchantName?: string,
  ): Promise<MerchantProfile> {
    // Get community data for this merchant
    const communityData = await this.getCommunityMerchantData(
      vpa,
      merchantName,
    );

    // Analyze transaction patterns
    const patterns = await this.analyzeTransactionPatterns(vpa);

    // Determine category through community consensus
    const category = this.determineCommunityCategory(communityData.tags);

    // Calculate risk score
    const riskScore = this.calculateMerchantRiskScore(patterns, communityData);

    const profile: MerchantProfile = {
      vpa,
      merchantName: merchantName || 'Unknown Merchant',
      category: category.name,
      confidence: category.confidence,
      communityTags: communityData.tags,
      verificationStatus: this.determineVerificationStatus(communityData),
      businessType: this.classifyBusinessType(patterns, communityData),
      riskScore,
      transactionPatterns: patterns,
      lastUpdated: new Date(),
    };

    // Update merchant database
    await this.storeMerchantProfile(profile);

    return profile;
  }

  /**
   * Submit community tag for a merchant (like Truecaller)
   */
  async submitCommunityTag(
    userId: string,
    vpa: string,
    merchantName: string,
    category: string,
    paymentAmount?: number,
  ): Promise<void> {
    try {
      // Check if user has made payments to this merchant (prevents spam)
      const userPayments = await this.prisma.paymentIntent.count({
        where: {
          userId,
          vpa,
          status: 'SUCCESS',
        },
      });

      if (userPayments === 0) {
        throw new Error('User must have payment history with merchant to tag');
      }

      // Store community tag
      await this.prisma.$executeRaw`
        INSERT INTO merchant_community_tags (
          user_id,
          merchant_vpa,
          merchant_name,
          category,
          payment_amount,
          created_at
        ) VALUES (
          ${userId},
          ${vpa},
          ${merchantName},
          ${category},
          ${paymentAmount || 0},
          NOW()
        )
        ON CONFLICT (user_id, merchant_vpa)
        DO UPDATE SET
          category = EXCLUDED.category,
          merchant_name = EXCLUDED.merchant_name,
          payment_amount = EXCLUDED.payment_amount,
          updated_at = NOW()
      `;

      // Update merchant profile confidence
      await this.updateMerchantConfidence(vpa);

      this.logger.log(
        `Community tag submitted: ${vpa} -> ${category} by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to submit community tag: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get merchant suggestions for unknown VPAs
   */
  async getMerchantSuggestions(
    vpa: string,
    merchantName?: string,
    amount?: number,
  ): Promise<MerchantSuggestion[]> {
    const suggestions: MerchantSuggestion[] = [];

    // Name-based suggestions
    if (merchantName) {
      const nameSuggestion = await this.getNameBasedSuggestion(merchantName);
      if (nameSuggestion) suggestions.push(nameSuggestion);
    }

    // VPA pattern suggestions
    const vpaSuggestion = await this.getVpaPatternSuggestion(vpa);
    if (vpaSuggestion) suggestions.push(vpaSuggestion);

    // Amount-based suggestions
    if (amount) {
      const amountSuggestion = await this.getAmountBasedSuggestion(amount, vpa);
      if (amountSuggestion) suggestions.push(amountSuggestion);
    }

    // Community-based suggestions
    const communitySuggestions = await this.getCommunityBasedSuggestions(
      vpa,
      merchantName,
    );
    suggestions.push(...communitySuggestions);

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /**
   * Bulk update merchant categories from community data
   */
  async updateMerchantDatabase(): Promise<void> {
    this.logger.log('Starting merchant database update...');

    try {
      // Get all merchants with community tags
      const merchantsWithTags = await this.prisma.$queryRaw<any[]>`
        SELECT
          merchant_vpa,
          merchant_name,
          category,
          COUNT(*) as votes,
          COUNT(DISTINCT user_id) as contributors
        FROM merchant_community_tags
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY merchant_vpa, merchant_name, category
        HAVING COUNT(*) >= 3  -- Minimum 3 votes
        ORDER BY votes DESC
      `;

      let updated = 0;

      for (const merchant of merchantsWithTags) {
        const confidence = Math.min(
          0.5 + (merchant.votes / 10) * 0.4 + (merchant.contributors / 5) * 0.1,
          0.95,
        );

        await this.prisma.$executeRaw`
          INSERT INTO merchant_profiles (
            vpa,
            merchant_name,
            category,
            confidence,
            community_votes,
            last_updated
          ) VALUES (
            ${merchant.merchant_vpa},
            ${merchant.merchant_name},
            ${merchant.category},
            ${confidence},
            ${merchant.votes},
            NOW()
          )
          ON CONFLICT (vpa)
          DO UPDATE SET
            category = CASE
              WHEN EXCLUDED.confidence > merchant_profiles.confidence
              THEN EXCLUDED.category
              ELSE merchant_profiles.category
            END,
            confidence = GREATEST(merchant_profiles.confidence, EXCLUDED.confidence),
            community_votes = EXCLUDED.community_votes,
            last_updated = NOW()
        `;

        updated++;
      }

      this.logger.log(
        `Updated ${updated} merchant profiles from community data`,
      );
    } catch (error) {
      this.logger.error(`Merchant database update failed: ${error.message}`);
      throw error;
    }
  }

  // Private helper methods
  private async getCommunityMerchantData(vpa: string, merchantName?: string) {
    const tags = await this.prisma.$queryRaw<any[]>`
      SELECT
        category,
        COUNT(*) as votes,
        COUNT(DISTINCT user_id) as contributors,
        MAX(created_at) as last_voted
      FROM merchant_community_tags
      WHERE merchant_vpa = ${vpa}
        ${merchantName ? `OR merchant_name ILIKE ${`%${merchantName}%`}` : ''}
      GROUP BY category
      ORDER BY votes DESC
    `;

    return {
      tags: tags.map((tag) => ({
        category: tag.category,
        votes: parseInt(tag.votes),
        confidence: Math.min(0.5 + (tag.votes / 10) * 0.5, 0.95),
        lastVoted: tag.last_voted,
        contributors: parseInt(tag.contributors),
      })),
      totalVotes: tags.reduce((sum, tag) => sum + parseInt(tag.votes), 0),
      totalContributors: Math.max(
        ...tags.map((tag) => parseInt(tag.contributors)),
        0,
      ),
    };
  }

  private async analyzeTransactionPatterns(
    vpa: string,
  ): Promise<TransactionPattern> {
    const transactions = await this.prisma.paymentIntent.findMany({
      where: { vpa, status: 'SUCCESS' },
      take: 100,
      orderBy: { completedAt: 'desc' },
    });

    if (transactions.length === 0) {
      return {
        avgAmount: 0,
        frequency: 0,
        timeDistribution: {},
        dayDistribution: {},
        amountDistribution: { min: 0, max: 0, median: 0, commonAmounts: [] },
      };
    }

    const amounts = transactions
      .map((t) => Number(t.amount))
      .sort((a, b) => a - b);
    const avgAmount =
      amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;

    // Time distribution
    const timeDistribution: Record<string, number> = {};
    const dayDistribution: Record<string, number> = {};

    transactions.forEach((t) => {
      const hour = t.completedAt.getHours();
      const day = t.completedAt.getDay();

      timeDistribution[hour] = (timeDistribution[hour] || 0) + 1;
      dayDistribution[day] = (dayDistribution[day] || 0) + 1;
    });

    // Common amounts (round numbers or repeated values)
    const amountCounts: Record<number, number> = {};
    amounts.forEach((amt) => {
      amountCounts[amt] = (amountCounts[amt] || 0) + 1;
    });

    const commonAmounts = Object.entries(amountCounts)
      .filter(([, count]) => count > 1)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([amount]) => Number(amount));

    return {
      avgAmount,
      frequency: transactions.length,
      timeDistribution,
      dayDistribution,
      amountDistribution: {
        min: amounts[0],
        max: amounts[amounts.length - 1],
        median: amounts[Math.floor(amounts.length / 2)],
        commonAmounts,
      },
    };
  }

  private determineCommunityCategory(tags: CommunityTag[]) {
    if (tags.length === 0) {
      return { name: 'Other', confidence: 0.1 };
    }

    const topTag = tags[0];
    const totalVotes = tags.reduce((sum, tag) => sum + tag.votes, 0);
    const consensus = topTag.votes / totalVotes;

    return {
      name: topTag.category,
      confidence: Math.min(0.3 + consensus * 0.7, 0.95),
    };
  }

  private calculateMerchantRiskScore(
    patterns: TransactionPattern,
    communityData: any,
  ): number {
    let riskScore = 0;

    // Low community engagement = higher risk
    if (communityData.totalVotes < 5) riskScore += 30;

    // Unusual transaction patterns
    if (patterns.amountDistribution.max > patterns.avgAmount * 10)
      riskScore += 20;

    // Very new merchant
    if (patterns.frequency < 3) riskScore += 25;

    // Disputed tags indicate risk
    const categoryDispersion = communityData.tags.length;
    if (categoryDispersion > 3) riskScore += 15;

    return Math.min(riskScore, 100);
  }

  private determineVerificationStatus(
    communityData: any,
  ): MerchantProfile['verificationStatus'] {
    if (
      communityData.totalVotes >= 20 &&
      communityData.totalContributors >= 10
    ) {
      return 'verified';
    }
    if (communityData.totalVotes >= 5) {
      return 'pending';
    }
    if (communityData.tags.some((tag: CommunityTag) => tag.votes === 1)) {
      return 'disputed';
    }
    return 'unverified';
  }

  private classifyBusinessType(
    patterns: TransactionPattern,
    communityData: any,
  ): MerchantProfile['businessType'] {
    // High frequency, consistent amounts = enterprise
    if (
      patterns.frequency > 50 &&
      patterns.amountDistribution.commonAmounts.length > 3
    ) {
      return 'enterprise';
    }

    // Moderate activity = small business
    if (patterns.frequency > 10 && communityData.totalContributors > 5) {
      return 'small_business';
    }

    // Low activity = individual
    if (patterns.frequency < 10) {
      return 'individual';
    }

    return 'unknown';
  }

  private async getNameBasedSuggestion(
    merchantName: string,
  ): Promise<MerchantSuggestion | null> {
    // Pattern matching for merchant names
    const name = merchantName.toLowerCase();

    const patterns = {
      'Food & Dining': [
        'zomato',
        'swiggy',
        'food',
        'restaurant',
        'cafe',
        'pizza',
        'burger',
      ],
      Shopping: ['amazon', 'flipkart', 'myntra', 'store', 'mall', 'shop'],
      Transport: ['uber', 'ola', 'metro', 'cab', 'taxi', 'bus'],
      Healthcare: ['hospital', 'clinic', 'pharmacy', 'medical', 'doctor'],
      Bills: ['electricity', 'water', 'gas', 'internet', 'mobile', 'telecom'],
    };

    for (const [category, keywords] of Object.entries(patterns)) {
      const matches = keywords.filter((keyword) => name.includes(keyword));
      if (matches.length > 0) {
        return {
          vpa: '',
          merchantName,
          suggestedCategory: category,
          confidence: 0.8 + matches.length * 0.05,
          reasoning: `Merchant name contains keywords: ${matches.join(', ')}`,
          communityEvidence: {
            totalUsers: 0,
            agreementRate: 0,
            recentTags: [],
          },
        };
      }
    }

    return null;
  }

  private async getVpaPatternSuggestion(
    vpa: string,
  ): Promise<MerchantSuggestion | null> {
    // Analyze VPA patterns
    const domain = vpa.split('@')[1];

    const domainPatterns = {
      paytm: 'Shopping',
      phonepe: 'Bills',
      gpay: 'General',
      razorpay: 'Shopping',
      cashfree: 'Shopping',
    };

    if (domain && domainPatterns[domain]) {
      return {
        vpa,
        merchantName: 'Unknown',
        suggestedCategory: domainPatterns[domain],
        confidence: 0.6,
        reasoning: `VPA domain ${domain} commonly used for ${domainPatterns[domain]}`,
        communityEvidence: {
          totalUsers: 0,
          agreementRate: 0,
          recentTags: [],
        },
      };
    }

    return null;
  }

  private async getAmountBasedSuggestion(
    amount: number,
    vpa: string,
  ): Promise<MerchantSuggestion | null> {
    // Amount-based category suggestions
    if (amount <= 100) {
      return {
        vpa,
        merchantName: 'Unknown',
        suggestedCategory: 'Food & Dining',
        confidence: 0.4,
        reasoning: 'Small amounts often indicate food purchases',
        communityEvidence: { totalUsers: 0, agreementRate: 0, recentTags: [] },
      };
    }

    if (amount >= 1000 && amount <= 5000) {
      return {
        vpa,
        merchantName: 'Unknown',
        suggestedCategory: 'Shopping',
        confidence: 0.5,
        reasoning: 'Medium amounts often indicate shopping',
        communityEvidence: { totalUsers: 0, agreementRate: 0, recentTags: [] },
      };
    }

    return null;
  }

  private async getCommunityBasedSuggestions(
    vpa: string,
    merchantName?: string,
  ): Promise<MerchantSuggestion[]> {
    // Get similar merchants based on community data
    const similarMerchants = await this.prisma.$queryRaw<any[]>`
      SELECT DISTINCT
        merchant_vpa,
        merchant_name,
        category,
        COUNT(*) as community_votes
      FROM merchant_community_tags
      WHERE merchant_name ILIKE ${merchantName ? `%${merchantName}%` : '%merchant%'}
        OR merchant_vpa = ${vpa}
      GROUP BY merchant_vpa, merchant_name, category
      HAVING COUNT(*) >= 2
      ORDER BY community_votes DESC
      LIMIT 3
    `;

    return similarMerchants.map((merchant) => ({
      vpa: merchant.merchant_vpa,
      merchantName: merchant.merchant_name,
      suggestedCategory: merchant.category,
      confidence: Math.min(0.6 + (merchant.community_votes / 20) * 0.3, 0.9),
      reasoning: 'Based on community tagging of similar merchants',
      communityEvidence: {
        totalUsers: merchant.community_votes,
        agreementRate: 0.8, // Estimated
        recentTags: [merchant.category],
      },
    }));
  }

  private async updateMerchantConfidence(vpa: string): Promise<void> {
    const communityData = await this.getCommunityMerchantData(vpa);
    const category = this.determineCommunityCategory(communityData.tags);

    await this.prisma.$executeRaw`
      UPDATE merchant_profiles
      SET
        confidence = ${category.confidence},
        community_votes = ${communityData.totalVotes},
        last_updated = NOW()
      WHERE vpa = ${vpa}
    `;
  }

  private async storeMerchantProfile(profile: MerchantProfile): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO merchant_profiles (
          vpa,
          merchant_name,
          category,
          confidence,
          verification_status,
          business_type,
          risk_score,
          transaction_patterns,
          last_updated
        ) VALUES (
          ${profile.vpa},
          ${profile.merchantName},
          ${profile.category},
          ${profile.confidence},
          ${profile.verificationStatus},
          ${profile.businessType},
          ${profile.riskScore},
          ${JSON.stringify(profile.transactionPatterns)},
          NOW()
        )
        ON CONFLICT (vpa)
        DO UPDATE SET
          merchant_name = EXCLUDED.merchant_name,
          category = EXCLUDED.category,
          confidence = EXCLUDED.confidence,
          verification_status = EXCLUDED.verification_status,
          business_type = EXCLUDED.business_type,
          risk_score = EXCLUDED.risk_score,
          transaction_patterns = EXCLUDED.transaction_patterns,
          last_updated = EXCLUDED.last_updated
      `;
    } catch (error) {
      this.logger.error(`Failed to store merchant profile: ${error.message}`);
    }
  }
}
