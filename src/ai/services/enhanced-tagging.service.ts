import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CategoriesService } from '../../categories/categories.service';
import { lastValueFrom } from 'rxjs';

export interface EnhancedTaggingContext {
  userId: string;
  amount: number;
  vpa: string;
  payeeName?: string;
  timeOfDay: number;
  dayOfWeek: number;
  userSpendingProfile: UserSpendingProfile;
  merchantIntelligence: MerchantIntelligence;
  networkEffects: NetworkEffects;
}

export interface UserSpendingProfile {
  avgTransactionAmount: number;
  categoryRatios: Record<string, number>;
  timePreferences: Record<string, number>;
  frequencyPattern: number;
}

export interface MerchantIntelligence {
  isKnownMerchant: boolean;
  merchantCategory?: string;
  categoryId?: string;
  confidence: number;
  similarMerchants: string[];
}

export interface NetworkEffects {
  communityTagging: Record<string, number>;
  similarUserPatterns: string[];
  trendingCategories: string[];
  payeeSeenBefore: boolean;
  communityTopCategory: string;
}

export interface MLPrediction {
  categoryId: string;
  categoryName: string;
  confidence: number;
  modelUsed: 'champion' | 'delta' | 'fallback';
  alternatives: Array<{
    categoryId: string;
    categoryName: string;
    probability: number;
  }>;
  featureImportance: Record<string, number>;
  // Category validation flags from ML service
  requires_review: boolean;
  novel_merchant: boolean;
  raw_confidence: number; // Original confidence before any adjustments
}

@Injectable()
export class EnhancedTaggingService {
  private readonly logger = new Logger(EnhancedTaggingService.name);
  private readonly ML_SERVICE_URL: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly categoriesService: CategoriesService,
  ) {
    this.ML_SERVICE_URL =
      this.config.get('ML_SERVICE_URL') || 'http://localhost:8001';
  }

  /**
   * Enhanced ML-powered auto-tagging with Champion-Delta ensemble
   */
  async predictCategory(
    context: EnhancedTaggingContext,
  ): Promise<MLPrediction> {
    try {
      // Build comprehensive feature vector (for future enhancements)
      // const features = await this.extractFeatures(context);

      // Call ML service with correct format
      const requestPayload = {
        transactions: [
          {
            user_id: context.userId,
            merchant_name: context.payeeName,
            amount: context.amount,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      this.logger.log(
        `Sending to ML service: ${JSON.stringify(requestPayload)}`,
      );

      const response = await lastValueFrom(
        this.httpService.post(
          `${this.ML_SERVICE_URL}/predict/auto-tag`,
          requestPayload,
        ),
      );

      const mlResponse = response.data;
      this.logger.log(`Raw ML Response: ${JSON.stringify(mlResponse)}`);

      const prediction = mlResponse.predictions[0]; // Get first prediction
      this.logger.log(`Extracted prediction: ${JSON.stringify(prediction)}`);

      // Enhanced logging for model monitoring
      this.logger.log(
        `ML Prediction: ${prediction.predicted_category} (${prediction.confidence}), Method: ${prediction.method}`,
      );

      // Phase 2: Convert ML prediction to actual DB category
      const userCategory = await this.resolveMLPredictionToCategory(
        context.userId,
        prediction.predicted_category,
        context.payeeName,
      );

      // Process alternatives to include DB IDs
      const alternatives = await Promise.all(
        (prediction.top_predictions || []).slice(1, 4).map(async (alt) => {
          const altCategory = await this.resolveMLPredictionToCategory(
            context.userId,
            alt.category,
            context.payeeName,
          );
          return {
            categoryId: altCategory.id,
            categoryName: altCategory.name,
            probability: alt.confidence,
          };
        }),
      );

      return {
        categoryId: userCategory.id,
        categoryName: userCategory.name,
        confidence: prediction.confidence,
        modelUsed: prediction.model_source || 'unknown',
        alternatives,
        featureImportance: {},
        // Extract category validation flags from ML response
        requires_review: prediction.requires_review || false,
        novel_merchant: prediction.novel_merchant || false,
        raw_confidence: prediction.confidence,
      };
    } catch (error) {
      this.logger.error(`ML prediction failed: ${error.message}`);
      // Fallback to rule-based system
      return this.fallbackPrediction(context);
    }
  }

  /**
   * Extract comprehensive features for ML model
   */
  private async extractFeatures(context: EnhancedTaggingContext) {
    // User behavioral profiling
    const userBehavioral = await this.buildUserSpendingProfile(context.userId);

    // Merchant intelligence
    const merchantIntel = await this.analyzeMerchant(
      context.vpa,
      context.payeeName,
    );

    // Network effects
    const networkEffects = await this.extractNetworkEffects(context);

    return {
      userBehavioral,
      merchantIntel,
      networkEffects,
    };
  }

  /**
   * Build user spending behavioral profile
   */
  private async buildUserSpendingProfile(
    userId: string,
  ): Promise<UserSpendingProfile> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentPayments = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        status: 'SUCCESS',
        completedAt: { gte: thirtyDaysAgo },
      },
      include: {
        tags: {
          include: { category: true },
        },
      },
    });

    if (recentPayments.length === 0) {
      return {
        avgTransactionAmount: 500,
        categoryRatios: {
          food: 0.25,
          transport: 0.15,
          shopping: 0.3,
          other: 0.3,
        },
        timePreferences: {},
        frequencyPattern: 0,
      };
    }

    // Calculate behavioral metrics
    const totalAmount = recentPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const avgTransactionAmount = totalAmount / recentPayments.length;

    // Category distribution
    const categorySpending = {};
    recentPayments.forEach((payment) => {
      const category = payment.tags[0]?.category?.name || 'other';
      categorySpending[category] =
        (categorySpending[category] || 0) + Number(payment.amount);
    });

    const categoryRatios = {};
    Object.keys(categorySpending).forEach((cat) => {
      categoryRatios[cat] = categorySpending[cat] / totalAmount;
    });

    // Time preferences
    const timePreferences = {};
    recentPayments.forEach((payment) => {
      const hour = payment.completedAt.getHours();
      const timeSlot = this.getTimeSlot(hour);
      timePreferences[timeSlot] = (timePreferences[timeSlot] || 0) + 1;
    });

    return {
      avgTransactionAmount,
      categoryRatios,
      timePreferences,
      frequencyPattern: recentPayments.length / 30, // transactions per day
    };
  }

  /**
   * Analyze merchant intelligence
   */
  private async analyzeMerchant(
    vpa: string,
    payeeName?: string,
  ): Promise<MerchantIntelligence> {
    // Check internal merchant database
    const knownMerchant = await this.prisma.paymentIntent.findFirst({
      where: {
        OR: [
          { vpa },
          ...(payeeName
            ? [
                {
                  payeeName: {
                    contains: payeeName,
                    mode: 'insensitive' as any,
                  },
                },
              ]
            : []),
        ],
        tags: { some: {} },
      },
      include: {
        tags: { include: { category: true } },
      },
    });

    if (knownMerchant) {
      // TODO: Implement proper merchant intelligence with tags
      return {
        isKnownMerchant: true,
        merchantCategory: 'unknown',
        confidence: 0.9,
        categoryId: undefined,
        similarMerchants: [],
      };
    }

    // External merchant intelligence (future: integrate with merchant databases)
    const merchantPatterns = this.analyzePayeePatterns(payeeName);

    return {
      isKnownMerchant: false,
      confidence: merchantPatterns.confidence,
      merchantCategory: merchantPatterns.category,
      similarMerchants: merchantPatterns.similar,
    };
  }

  /**
   * Extract network effects and community patterns
   */
  private async extractNetworkEffects(
    context: EnhancedTaggingContext,
  ): Promise<NetworkEffects> {
    // Check if payee has been seen by other users
    const payeeSeenBefore = await this.prisma.paymentIntent.findFirst({
      where: {
        OR: [
          { vpa: context.vpa },
          ...(context.payeeName
            ? [
                {
                  payeeName: {
                    contains: context.payeeName,
                    mode: 'insensitive' as any,
                  },
                },
              ]
            : []),
        ],
        userId: { not: context.userId },
        tags: { some: {} },
      },
    });

    // Get community tagging patterns
    const communityTags = await this.prisma.tag.findMany({
      where: {
        paymentIntent: {
          OR: [
            { vpa: context.vpa },
            ...(context.payeeName
              ? [
                  {
                    payeeName: {
                      contains: context.payeeName,
                      mode: 'insensitive' as any,
                    },
                  },
                ]
              : []),
          ],
        },
      },
      include: { category: true },
    });

    const communityTagging = {};
    let communityTopCategory = 'other';
    let maxCount = 0;

    communityTags.forEach((tag) => {
      // TODO: Fix category relationship - using categoryId for now
      const categoryName = tag.categoryId || 'other';
      communityTagging[categoryName] =
        (communityTagging[categoryName] || 0) + 1;
      if (communityTagging[categoryName] > maxCount) {
        maxCount = communityTagging[categoryName];
        communityTopCategory = categoryName;
      }
    });

    return {
      payeeSeenBefore: !!payeeSeenBefore,
      communityTagging,
      communityTopCategory,
      similarUserPatterns: [],
      trendingCategories: [],
    };
  }

  /**
   * Rule-based fallback using canonical merchant catalog
   */
  private async fallbackPrediction(
    context: EnhancedTaggingContext,
  ): Promise<MLPrediction> {
    // Try canonical merchant lookup first
    let canonicalCategory = null;
    let confidence = 0.3;

    if (context.payeeName) {
      canonicalCategory = await this.findCanonicalCategoryForMerchant(
        context.payeeName,
      );
      if (canonicalCategory) {
        confidence = 0.9; // High confidence for curated merchant data
      }
    }

    // Fallback to pattern matching if no merchant found
    if (!canonicalCategory) {
      canonicalCategory = await this.patternMatchCanonicalCategory(
        context.payeeName,
      );
      confidence = canonicalCategory ? 0.7 : 0.3;
    }

    // Get user's categories for fallback
    const userCategories = await this.prisma.category.findMany({
      where: { userId: context.userId },
      include: { canonicalCategory: true },
    });

    let predictedCategory = userCategories[0];

    // If we found a canonical category, try to find user's matching category
    if (canonicalCategory) {
      const matchingUserCategory = userCategories.find(
        (cat) => cat.canonicalCategoryId === canonicalCategory.id,
      );

      if (matchingUserCategory) {
        predictedCategory = matchingUserCategory;
      } else {
        // Create new user category mapped to canonical category
        predictedCategory = await this.prisma.category.create({
          data: {
            userId: context.userId,
            name: canonicalCategory.name,
            color: canonicalCategory.color,
            capAmount: canonicalCategory.defaultCapAmount,
            canonicalCategoryId: canonicalCategory.id,
            softBlock: false,
            nearThresholdPct: 80,
          },
          include: { canonicalCategory: true },
        });
      }
    }

    return {
      categoryId: predictedCategory.id,
      categoryName: predictedCategory.name,
      confidence,
      modelUsed: 'fallback',
      alternatives: userCategories.slice(1, 4).map((cat) => ({
        categoryId: cat.id,
        categoryName: cat.name,
        probability: 0.1,
      })),
      featureImportance: { merchant_lookup: canonicalCategory ? 0.9 : 0.1 },
      // Fallback predictions always require review due to low confidence
      requires_review: true,
      novel_merchant: true, // Fallback suggests unknown merchant
      raw_confidence: confidence,
    };
  }

  /**
   * Find canonical category for merchant using catalog
   */
  private async findCanonicalCategoryForMerchant(merchantName: string) {
    if (!merchantName) return null;

    const normalizedName = merchantName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Search for merchant with JSON array filtering for aliases
    const merchants = await this.prisma.merchantCatalog.findMany({
      where: {
        OR: [
          { normalizedName: normalizedName },
          { name: { contains: merchantName, mode: 'insensitive' } },
        ],
      },
      include: {
        categoryCatalog: true,
      },
    });

    // Filter by aliases in memory since JSON array filtering is complex
    const merchant =
      merchants.find((m) => {
        if (!m.aliases) return false;
        const aliasArray = Array.isArray(m.aliases) ? m.aliases : [];
        return aliasArray.some(
          (alias: string) =>
            typeof alias === 'string' &&
            alias.toLowerCase().includes(merchantName.toLowerCase()),
        );
      }) || merchants[0]; // Fallback to first match

    return merchant?.categoryCatalog || null;
  }

  /**
   * Pattern match to canonical categories when merchant not found
   */
  private async patternMatchCanonicalCategory(payeeName?: string) {
    if (!payeeName) return null;

    const name = payeeName.toLowerCase();
    let categoryName = null;

    // Enhanced pattern matching using canonical categories
    if (
      [
        'zomato',
        'swiggy',
        'food',
        'restaurant',
        'cafe',
        'mcdonald',
        'kfc',
        'pizza',
        'dominos',
      ].some((p) => name.includes(p))
    ) {
      categoryName = 'Food & Dining';
    } else if (
      ['uber', 'ola', 'transport', 'metro', 'cab', 'taxi', 'bus', 'train'].some(
        (p) => name.includes(p),
      )
    ) {
      categoryName = 'Transport';
    } else if (
      [
        'amazon',
        'flipkart',
        'shopping',
        'mall',
        'store',
        'myntra',
        'ajio',
      ].some((p) => name.includes(p))
    ) {
      categoryName = 'Shopping';
    } else if (
      [
        'netflix',
        'prime',
        'hotstar',
        'movie',
        'entertainment',
        'spotify',
        'youtube',
      ].some((p) => name.includes(p))
    ) {
      categoryName = 'Entertainment';
    } else if (
      [
        'hospital',
        'clinic',
        'pharmacy',
        'medical',
        'health',
        'doctor',
        'apollo',
      ].some((p) => name.includes(p))
    ) {
      categoryName = 'Healthcare';
    } else if (
      [
        'electricity',
        'gas',
        'water',
        'internet',
        'mobile',
        'recharge',
        'bill',
      ].some((p) => name.includes(p))
    ) {
      categoryName = 'Bills & Utilities';
    } else if (
      [
        'mutual',
        'sip',
        'insurance',
        'investment',
        'stocks',
        'fd',
        'zerodha',
      ].some((p) => name.includes(p))
    ) {
      categoryName = 'Investment';
    }

    if (categoryName) {
      return await this.prisma.categoryCatalog.findFirst({
        where: { name: categoryName },
      });
    }

    return null;
  }

  private analyzePayeePatterns(payeeName?: string) {
    if (!payeeName) return { confidence: 0, category: 'other', similar: [] };

    const name = payeeName.toLowerCase();

    // Enhanced pattern matching
    const patterns = {
      food: [
        'zomato',
        'swiggy',
        'uber eats',
        'dominos',
        'mcdonald',
        'kfc',
        'pizza',
        'restaurant',
        'cafe',
        'food',
        'kitchen',
        'canteen',
        'mess',
        'dhaba',
      ],
      transport: [
        'uber',
        'ola',
        'rapido',
        'metro',
        'bus',
        'taxi',
        'auto',
        'cab',
        'parking',
        'petrol',
        'fuel',
      ],
      shopping: [
        'amazon',
        'flipkart',
        'myntra',
        'ajio',
        'nykaa',
        'big bazaar',
        'dmart',
        'reliance',
        'mall',
        'store',
        'mart',
      ],
      healthcare: [
        'apollo',
        'max',
        'fortis',
        'hospital',
        'clinic',
        'pharmacy',
        'medical',
        'doctor',
        'medicine',
      ],
      bills: [
        'electricity',
        'water',
        'gas',
        'internet',
        'mobile',
        'recharge',
        'broadband',
        'wifi',
        'utility',
      ],
    };

    for (const [category, keywords] of Object.entries(patterns)) {
      const matches = keywords.filter((keyword) => name.includes(keyword));
      if (matches.length > 0) {
        return {
          confidence: Math.min(0.9, 0.6 + matches.length * 0.1),
          category,
          similar: matches,
        };
      }
    }

    return { confidence: 0.2, category: 'other', similar: [] };
  }

  private getTimeSlot(hour: number): string {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Phase 2: Resolve ML prediction to actual user category with DB ID
   */
  private async resolveMLPredictionToCategory(
    userId: string,
    predictedCategoryName: string,
    merchantName?: string,
  ) {
    // Try to resolve using canonical categories and merchant lookup
    return this.categoriesService.upsertUserCategoryWithCanonical(userId, {
      name: predictedCategoryName,
      merchantName,
    });
  }
}
