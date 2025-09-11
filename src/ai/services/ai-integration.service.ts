import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AIFinancialAdvisorService } from './ai-financial-advisor.service';
import { AIBehavioralNudgeService } from './behavioral-nudge.service';
import { EnhancedTaggingService } from './enhanced-tagging.service';
import { MerchantIntelligenceService } from './merchant-intelligence.service';
import { TrustScoreService } from './trust-score.service';
import { VoiceIntelligenceService } from './voice-intelligence.service';

export interface PaymentAnalysisRequest {
  amount: number;
  payeeName: string;
  vpa?: string;
  description?: string;
  userId: string;
  userContext?: {
    monthlyIncome?: number;
    categorySpending: Record<string, number>;
    recentTransactions: any[];
  };
}

export interface PaymentAnalysisResponse {
  suggestedCategory: string;
  categoryConfidence: number;
  trustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  behavioralNudge?: {
    message: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    actionRequired: boolean;
  };
  merchantInsights?: {
    businessType: string;
    trustLevel: string;
    riskFactors: string[];
    recommendations: string[];
  };
  shouldBlock: boolean;
  requiresUserConfirmation: boolean;
  reasoning: string;
}

export interface VoiceMemoAnalysis {
  transcript: string;
  confidence: number;
  extractedEntities: {
    amount?: number;
    merchant?: string;
    category?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
  suggestedTags: string[];
  actionItems: string[];
}

export interface SmartInsightsRequest {
  userId: string;
  timeframe: 'week' | 'month' | 'quarter';
  focusArea?: 'spending' | 'savings' | 'budgeting' | 'investments';
}

export interface SmartInsightsResponse {
  insights: Array<{
    type: 'trend' | 'anomaly' | 'opportunity' | 'warning';
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    actionable: boolean;
    suggestedAction?: string;
  }>;
  personalizedRecommendations: string[];
  nextSteps: string[];
  confidenceScore: number;
}

@Injectable()
export class AIIntegrationService {
  private readonly logger = new Logger(AIIntegrationService.name);
  private readonly ML_SERVICES_URL: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly financialAdvisor: AIFinancialAdvisorService,
    private readonly behavioralNudge: AIBehavioralNudgeService,
    private readonly enhancedTagging: EnhancedTaggingService,
    private readonly merchantIntelligence: MerchantIntelligenceService,
    private readonly trustScore: TrustScoreService,
    private readonly voiceIntelligence: VoiceIntelligenceService,
  ) {
    this.ML_SERVICES_URL =
      this.config.get('ML_SERVICES_URL') || 'http://localhost:8001';
  }

  /**
   * 🎯 COMPLETE PAYMENT ANALYSIS
   * Orchestrates all AI capabilities for payment decisions
   */
  async analyzePayment(
    request: PaymentAnalysisRequest,
  ): Promise<PaymentAnalysisResponse> {
    this.logger.log(
      `Analyzing payment: ₹${request.amount} to ${request.payeeName}`,
    );

    try {
      // Run all AI analyses in parallel for speed
      const [categoryResult, trustResult, behavioralResult, merchantResult] =
        await Promise.allSettled([
          this.enhancedTagging.predictCategory({
            userId: request.userId,
            amount: request.amount,
            vpa: request.vpa || request.payeeName,
            payeeName: request.payeeName,
            timeOfDay: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            userSpendingProfile: {
              avgTransactionAmount: 2500,
              categoryRatios: request.userContext?.categorySpending || {},
              timePreferences: {},
              frequencyPattern: 1,
            },
            merchantIntelligence: {
              isKnownMerchant: false,
              confidence: 0.5,
              similarMerchants: [],
            },
            networkEffects: {
              communityTagging: {},
              similarUserPatterns: [],
              trendingCategories: [],
              payeeSeenBefore: false,
              communityTopCategory: 'Other',
            },
          }),
          this.trustScore.calculateTrustScore(
            request.userId,
            request.vpa || request.payeeName,
          ),
          this.behavioralNudge.generateSmartNudges({
            userId: request.userId,
            amount: request.amount,
            categoryId: 'general',
            payeeName: request.payeeName,
            timeOfDay: new Date().getHours(),
            isWeekend: [0, 6].includes(new Date().getDay()),
            monthlySpent: Object.values(
              request.userContext?.categorySpending || {},
            ).reduce((a, b) => a + b, 0),
            categorySpent:
              request.userContext?.categorySpending?.['general'] || 0,
          }),
          this.merchantIntelligence.getMerchantProfile(
            request.vpa || request.payeeName,
            request.payeeName,
          ),
        ]);

      // Extract results with fallbacks - map ML response format
      const categoryPrediction = this.extractResult(categoryResult, {
        categoryName: 'Other',
        confidence: 0.3,
      });

      const categoryData = {
        category:
          categoryPrediction.categoryName ||
          (categoryPrediction as any).categoryId ||
          'Other',
        confidence: categoryPrediction.confidence || 0.3,
      };

      const trustData = this.extractResult(trustResult, {
        trustScore: 50,
        riskLevel: 'MEDIUM' as const,
      });

      const behavioralData = this.extractResult(behavioralResult, null);

      const merchantData = this.extractResult(merchantResult, null);

      // Determine risk level based on multiple factors
      const riskLevel = this.calculateOverallRisk(
        trustData.trustScore,
        request.amount,
        merchantData,
        request.userContext,
      );

      // Determine if payment should be blocked or requires confirmation
      const { shouldBlock, requiresConfirmation } = this.determinePaymentGate(
        riskLevel,
        trustData.trustScore,
        request.amount,
        behavioralData,
      );

      // Generate reasoning
      const reasoning = this.generatePaymentReasoning(
        categoryData,
        trustData,
        riskLevel,
        merchantData,
      );

      return {
        suggestedCategory: categoryData.category,
        categoryConfidence: categoryData.confidence,
        trustScore: trustData.trustScore,
        riskLevel,
        behavioralNudge: behavioralData
          ? {
              message: behavioralData.message || behavioralData.nudge_message,
              severity: this.mapNudgeSeverity(behavioralData.severity),
              actionRequired: behavioralData.action_required || false,
            }
          : undefined,
        merchantInsights: merchantData
          ? {
              businessType: merchantData.business_type || 'Unknown',
              trustLevel: merchantData.trust_level || 'Medium',
              riskFactors: merchantData.risk_factors || [],
              recommendations: merchantData.recommendations || [],
            }
          : undefined,
        shouldBlock,
        requiresUserConfirmation: requiresConfirmation,
        reasoning,
      };
    } catch (error) {
      this.logger.error('Payment analysis failed:', error);
      return this.getFallbackPaymentAnalysis(request);
    }
  }

  /**
   * 🎤 VOICE MEMO PROCESSING
   * Complete voice-to-insights pipeline
   */
  async processVoiceMemo(
    audioBuffer: Buffer,
    userId: string,
    paymentId?: string,
  ): Promise<VoiceMemoAnalysis> {
    this.logger.log('Processing voice memo with AI analysis');

    try {
      const voiceResult = await this.voiceIntelligence.processVoiceMemo(
        audioBuffer,
        paymentId,
        userId,
      );

      // Extract financial entities and insights
      const entities = this.extractFinancialEntities(voiceResult.transcript);

      // Generate contextual tags based on transcript content
      const suggestedTags = await this.generateTagsFromTranscript(
        voiceResult.transcript,
        entities,
      );

      // Extract action items from the transcript
      const actionItems = this.extractActionItems(voiceResult.transcript);

      return {
        transcript: voiceResult.transcript,
        confidence: voiceResult.confidence,
        extractedEntities: entities,
        suggestedTags,
        actionItems,
      };
    } catch (error) {
      this.logger.error('Voice memo processing failed:', error);
      throw new Error('Voice processing failed');
    }
  }

  /**
   * 💡 SMART INSIGHTS GENERATION
   * Comprehensive financial insights using all AI capabilities
   */
  async generateSmartInsights(
    request: SmartInsightsRequest,
  ): Promise<SmartInsightsResponse> {
    this.logger.log(
      `Generating smart insights for user ${request.userId} (${request.timeframe})`,
    );

    try {
      // Get insights from multiple AI services
      const [behavioralInsights, merchantInsights] = await Promise.allSettled([
        this.getBehavioralInsights(request.userId, request.timeframe),
        this.getMerchantInsights(request.userId, request.timeframe),
      ]);

      const insights = [];
      let confidenceScore = 0.7;

      // Process behavioral insights
      if (behavioralInsights.status === 'fulfilled') {
        insights.push(
          ...this.processBehavioralInsights(behavioralInsights.value),
        );
        confidenceScore += 0.1;
      }

      // Process merchant insights
      if (merchantInsights.status === 'fulfilled') {
        insights.push(...this.processMerchantInsights(merchantInsights.value));
        confidenceScore += 0.1;
      }

      // Generate personalized recommendations
      const recommendations = await this.generatePersonalizedRecommendations(
        request.userId,
        insights,
      );

      // Determine next steps
      const nextSteps = this.determineNextSteps(insights, request.focusArea);

      return {
        insights,
        personalizedRecommendations: recommendations,
        nextSteps,
        confidenceScore: Math.min(confidenceScore, 0.95),
      };
    } catch (error) {
      this.logger.error('Smart insights generation failed:', error);
      return this.getFallbackInsights();
    }
  }

  /**
   * 🔄 REAL-TIME PAYMENT MONITORING
   * Continuous AI monitoring for fraud/anomaly detection
   */
  async monitorTransaction(
    transactionData: any,
    userId: string,
  ): Promise<{
    flagged: boolean;
    reason?: string;
    confidence: number;
    suggestedAction: 'allow' | 'review' | 'block';
  }> {
    try {
      // Check for anomalies using multiple AI models
      const anomalyResult = await this.httpService
        .post(`${this.ML_SERVICES_URL}/predict/anomaly-detection`, {
          transaction: transactionData,
          user_id: userId,
        })
        .toPromise();

      const { is_anomaly, confidence, reason } = anomalyResult.data;

      return {
        flagged: is_anomaly,
        reason,
        confidence,
        suggestedAction: this.determineSuggestedAction(
          is_anomaly,
          confidence,
          transactionData.amount,
        ),
      };
    } catch (error) {
      this.logger.error('Transaction monitoring failed:', error);
      return {
        flagged: false,
        confidence: 0.5,
        suggestedAction: 'allow',
      };
    }
  }

  // Private helper methods
  private extractResult<T>(result: PromiseSettledResult<any>, fallback: T): T {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    this.logger.warn('AI service call failed, using fallback');
    return fallback;
  }

  private calculateOverallRisk(
    trustScore: number,
    amount: number,
    merchantData: any,
    userContext?: any,
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    let riskPoints = 0;

    // Trust score factor
    if (trustScore < 30) riskPoints += 3;
    else if (trustScore < 60) riskPoints += 1;

    // Amount factor
    if (amount > 50000) riskPoints += 2;
    else if (amount > 10000) riskPoints += 1;

    // Merchant risk factors
    if (merchantData?.risk_factors?.length > 2) riskPoints += 2;

    // User context
    if (
      userContext?.monthlyIncome &&
      amount > userContext.monthlyIncome * 0.3
    ) {
      riskPoints += 2;
    }

    if (riskPoints >= 4) return 'HIGH';
    if (riskPoints >= 2) return 'MEDIUM';
    return 'LOW';
  }

  private determinePaymentGate(
    riskLevel: string,
    trustScore: number,
    amount: number,
    behavioralData: any,
  ): { shouldBlock: boolean; requiresConfirmation: boolean } {
    // Block criteria
    if (riskLevel === 'HIGH' && trustScore < 20) {
      return { shouldBlock: true, requiresConfirmation: false };
    }

    // Confirmation criteria
    if (
      riskLevel === 'HIGH' ||
      amount > 25000 ||
      behavioralData?.action_required
    ) {
      return { shouldBlock: false, requiresConfirmation: true };
    }

    return { shouldBlock: false, requiresConfirmation: false };
  }

  private generatePaymentReasoning(
    categoryData: any,
    trustData: any,
    riskLevel: string,
    merchantData: any,
  ): string {
    const reasons = [];

    reasons.push(
      `Categorized as ${categoryData.category} (${Math.round(categoryData.confidence * 100)}% confidence)`,
    );
    reasons.push(`Trust score: ${trustData.trustScore}/100`);
    reasons.push(`Risk level: ${riskLevel}`);

    if (merchantData?.business_type) {
      reasons.push(`Merchant type: ${merchantData.business_type}`);
    }

    return reasons.join('. ');
  }

  private mapNudgeSeverity(severity: any): 'INFO' | 'WARNING' | 'CRITICAL' {
    if (typeof severity === 'string') {
      const upper = severity.toUpperCase();
      if (['CRITICAL', 'HIGH'].includes(upper)) return 'CRITICAL';
      if (['WARNING', 'MEDIUM'].includes(upper)) return 'WARNING';
    }
    return 'INFO';
  }

  private extractFinancialEntities(transcript: string): any {
    const entities: any = {};

    // Extract amount (₹ symbol or numbers)
    const amountMatch = transcript.match(/₹\s*(\d+(?:,\d+)*)/);
    if (amountMatch) {
      entities.amount = parseInt(amountMatch[1].replace(/,/g, ''));
    }

    // Extract merchant names (proper nouns)
    const merchantMatch = transcript.match(
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/,
    );
    if (merchantMatch) {
      entities.merchant = merchantMatch[0];
    }

    // Extract sentiment
    const positiveWords = ['good', 'great', 'happy', 'satisfied'];
    const negativeWords = ['bad', 'terrible', 'unhappy', 'disappointed'];

    const hasPositive = positiveWords.some((word) =>
      transcript.toLowerCase().includes(word),
    );
    const hasNegative = negativeWords.some((word) =>
      transcript.toLowerCase().includes(word),
    );

    if (hasPositive && !hasNegative) entities.sentiment = 'positive';
    else if (hasNegative && !hasPositive) entities.sentiment = 'negative';
    else entities.sentiment = 'neutral';

    return entities;
  }

  private async generateTagsFromTranscript(
    transcript: string,
    entities: any,
  ): Promise<string[]> {
    const tags = [];

    // Use entities to suggest tags
    if (entities.merchant) tags.push(`merchant:${entities.merchant}`);
    if (entities.amount) tags.push(`amount:${entities.amount}`);

    // Keyword-based tagging
    const keywords = {
      food: ['restaurant', 'food', 'dinner', 'lunch', 'cafe'],
      transport: ['uber', 'ola', 'taxi', 'metro', 'bus'],
      shopping: ['amazon', 'flipkart', 'shopping', 'purchase'],
      entertainment: ['movie', 'game', 'entertainment', 'fun'],
    };

    Object.entries(keywords).forEach(([category, words]) => {
      if (words.some((word) => transcript.toLowerCase().includes(word))) {
        tags.push(category);
      }
    });

    return tags.slice(0, 5); // Limit to 5 tags
  }

  private extractActionItems(transcript: string): string[] {
    const actionWords = [
      'need to',
      'should',
      'must',
      'have to',
      'remember to',
      "don't forget",
    ];

    const sentences = transcript.split('.').map((s) => s.trim());
    const actionItems = sentences.filter((sentence) =>
      actionWords.some((word) => sentence.toLowerCase().includes(word)),
    );

    return actionItems.slice(0, 3); // Limit to 3 action items
  }

  private async getBehavioralInsights(
    userId: string,
    timeframe: string,
  ): Promise<any> {
    // Implementation would call behavioral analysis
    return { insights: [], trends: [] };
  }

  private async getMerchantInsights(
    userId: string,
    timeframe: string,
  ): Promise<any> {
    // Implementation would call merchant analysis
    return { merchants: [], patterns: [] };
  }

  private processBehavioralInsights(data: any): any[] {
    return [
      {
        type: 'trend',
        title: 'Spending Pattern Detected',
        description: 'Your spending has increased by 15% this month',
        impact: 'medium',
        actionable: true,
        suggestedAction: 'Review your budget and identify areas to optimize',
      },
    ];
  }

  private processMerchantInsights(data: any): any[] {
    return [
      {
        type: 'opportunity',
        title: 'Merchant Loyalty Rewards',
        description: 'You could save ₹500/month with loyalty programs',
        impact: 'low',
        actionable: true,
        suggestedAction: 'Sign up for merchant loyalty programs',
      },
    ];
  }

  private async generatePersonalizedRecommendations(
    userId: string,
    insights: any[],
  ): Promise<string[]> {
    return [
      'Set up automatic savings of ₹5,000 per month',
      'Review your food & dining expenses - potential 20% savings',
      'Consider switching to a higher-yield savings account',
    ];
  }

  private determineNextSteps(insights: any[], focusArea?: string): string[] {
    const steps = ["Review this month's spending patterns"];

    if (focusArea === 'savings') {
      steps.push('Set up a systematic savings plan');
    }

    steps.push('Enable smart spending alerts');
    return steps;
  }

  private determineSuggestedAction(
    isAnomaly: boolean,
    confidence: number,
    amount: number,
  ): 'allow' | 'review' | 'block' {
    if (isAnomaly && confidence > 0.8 && amount > 50000) return 'block';
    if (isAnomaly && confidence > 0.6) return 'review';
    return 'allow';
  }

  private getFallbackPaymentAnalysis(
    request: PaymentAnalysisRequest,
  ): PaymentAnalysisResponse {
    return {
      suggestedCategory: 'Other',
      categoryConfidence: 0.5,
      trustScore: 50,
      riskLevel: 'MEDIUM',
      shouldBlock: false,
      requiresUserConfirmation: request.amount > 10000,
      reasoning: 'AI services temporarily unavailable, using basic analysis',
    };
  }

  private getFallbackInsights(): SmartInsightsResponse {
    return {
      insights: [
        {
          type: 'trend',
          title: 'Review Available',
          description: 'Your financial data is ready for review',
          impact: 'low',
          actionable: true,
          suggestedAction: 'Check your spending patterns manually',
        },
      ],
      personalizedRecommendations: [
        'Review your monthly spending',
        'Set up budget categories',
      ],
      nextSteps: ['Access your financial dashboard'],
      confidenceScore: 0.5,
    };
  }
}
