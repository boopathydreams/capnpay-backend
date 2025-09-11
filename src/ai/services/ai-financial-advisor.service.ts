import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    intent?: string;
    confidence?: number;
    actionTaken?: string;
    dataUsed?: string[];
  };
}

export interface UserFinancialContext {
  monthlyIncome?: number;
  totalSpending: number;
  categoryBreakdown: Record<string, number>;
  savingsRate: number;
  topMerchants: Array<{ name: string; amount: number; frequency: number }>;
  spendingTrends: {
    thisMonth: number;
    lastMonth: number;
    threeMonthAvg: number;
  };
  goalProgress: Array<{
    goal: string;
    target: number;
    current: number;
    timeline: string;
  }>;
  riskFactors: string[];
  opportunities: string[];
}

export interface AIResponse {
  message: string;
  suggestedActions: Array<{
    type:
      | 'set_budget'
      | 'create_goal'
      | 'reduce_spending'
      | 'invest'
      | 'learn_more';
    title: string;
    description: string;
    data?: any;
  }>;
  dataVisualization?: {
    type: 'chart' | 'comparison' | 'progress';
    data: any;
  };
  followUpQuestions: string[];
  confidence: number;
}

@Injectable()
export class AIFinancialAdvisorService {
  private readonly logger = new Logger(AIFinancialAdvisorService.name);
  private readonly OPENAI_API_URL: string;
  private readonly ML_SERVICES_URL: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.OPENAI_API_URL =
      this.config.get('OPENAI_API_URL') || 'https://api.openai.com/v1';
    this.ML_SERVICES_URL =
      this.config.get('ML_SERVICES_URL') || 'http://localhost:8001';
  }

  /**
   * Process user query with comprehensive financial context
   */
  async processFinancialQuery(
    userId: string,
    query: string,
    conversationHistory: ChatMessage[] = [],
  ): Promise<AIResponse> {
    try {
      // Get user's financial context
      const financialContext = await this.buildFinancialContext(userId);

      // Determine query intent
      const intent = await this.classifyQueryIntent(query);

      // Generate AI response with financial expertise
      const aiResponse = await this.generateFinancialAdvice(
        query,
        financialContext,
        conversationHistory,
        intent,
      );

      // Log interaction for learning
      await this.logInteraction(userId, query, aiResponse, intent);

      return aiResponse;
    } catch (error) {
      this.logger.error(`AI chat processing failed: ${error.message}`);
      return this.getFallbackResponse(query);
    }
  }

  /**
   * Build comprehensive financial context for the user
   */
  private async buildFinancialContext(
    userId: string,
  ): Promise<UserFinancialContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        categories: true,
        paymentIntents: {
          where: {
            status: 'SUCCESS',
            completedAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
            },
          },
          include: {
            tags: { include: { category: true } },
          },
          orderBy: { completedAt: 'desc' },
        },
      },
    });

    if (!user) throw new Error('User not found');

    // Calculate spending metrics
    const totalSpending = user.paymentIntents.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    user.paymentIntents.forEach((payment) => {
      const category = payment.tags[0]?.category?.name || 'Other';
      categoryBreakdown[category] =
        (categoryBreakdown[category] || 0) + Number(payment.amount);
    });

    // Top merchants
    const merchantSpending: Record<
      string,
      { amount: number; frequency: number }
    > = {};
    user.paymentIntents.forEach((payment) => {
      const merchant = payment.payeeName || 'Unknown';
      if (!merchantSpending[merchant]) {
        merchantSpending[merchant] = { amount: 0, frequency: 0 };
      }
      merchantSpending[merchant].amount += Number(payment.amount);
      merchantSpending[merchant].frequency += 1;
    });

    const topMerchants = Object.entries(merchantSpending)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data }));

    // Spending trends
    const thisMonth = this.getMonthSpending(user.paymentIntents, 0);
    const lastMonth = this.getMonthSpending(user.paymentIntents, 1);
    const threeMonthAvg =
      [0, 1, 2]
        .map((monthsBack) =>
          this.getMonthSpending(user.paymentIntents, monthsBack),
        )
        .reduce((sum, month) => sum + month, 0) / 3;

    // Risk factors and opportunities
    const riskFactors = this.identifyRiskFactors(
      user,
      categoryBreakdown,
      thisMonth,
      lastMonth,
    );
    const opportunities = this.identifyOpportunities(
      user,
      categoryBreakdown,
      totalSpending,
    );

    return {
      monthlyIncome: user.monthlySalary
        ? Number(user.monthlySalary)
        : undefined,
      totalSpending,
      categoryBreakdown,
      savingsRate: user.monthlySalary
        ? Math.max(
            0,
            (Number(user.monthlySalary) - thisMonth) /
              Number(user.monthlySalary),
          )
        : 0,
      topMerchants,
      spendingTrends: { thisMonth, lastMonth, threeMonthAvg },
      goalProgress: [], // Future: implement savings goals
      riskFactors,
      opportunities,
    };
  }

  /**
   * Classify user query intent for better response generation
   */
  private async classifyQueryIntent(query: string): Promise<string> {
    const lowerQuery = query.toLowerCase();

    // Rule-based intent classification (future: ML model)
    if (lowerQuery.includes('budget') || lowerQuery.includes('limit'))
      return 'budget_management';
    if (lowerQuery.includes('save') || lowerQuery.includes('saving'))
      return 'savings_advice';
    if (lowerQuery.includes('invest') || lowerQuery.includes('investment'))
      return 'investment_guidance';
    if (lowerQuery.includes('spend') || lowerQuery.includes('spending'))
      return 'spending_analysis';
    if (lowerQuery.includes('goal') || lowerQuery.includes('target'))
      return 'goal_setting';
    if (lowerQuery.includes('reduce') || lowerQuery.includes('cut'))
      return 'expense_reduction';
    if (lowerQuery.includes('compare') || lowerQuery.includes('analysis'))
      return 'financial_analysis';

    return 'general_inquiry';
  }

  /**
   * Generate AI financial advice using GPT-4 with financial expertise + ML insights
   */
  private async generateFinancialAdvice(
    query: string,
    context: UserFinancialContext,
    history: ChatMessage[],
    intent: string,
  ): Promise<AIResponse> {
    // Get ML-powered insights to enhance the advice
    const mlInsights = await this.getMLInsights(context, intent);

    const systemPrompt = `You are Cap'n Pay's AI financial advisor with expertise in:
- Personal finance and budgeting for Indian users
- Behavioral finance and spending psychology
- Investment planning and wealth building
- UPI payments and digital finance in India
- Expense categorization and financial analytics

User's Financial Profile:
- Monthly Income: ₹${context.monthlyIncome?.toLocaleString('en-IN') || 'Not provided'}
- Total Spending (90 days): ₹${context.totalSpending.toLocaleString('en-IN')}
- Savings Rate: ${(context.savingsRate * 100).toFixed(1)}%
- Top Categories: ${Object.entries(context.categoryBreakdown)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cat, amt]) => `${cat}: ₹${amt.toLocaleString('en-IN')}`)
      .join(', ')}
- Spending Trend: This month ₹${context.spendingTrends.thisMonth.toLocaleString('en-IN')} vs last month ₹${context.spendingTrends.lastMonth.toLocaleString('en-IN')}

Risk Factors: ${context.riskFactors.join(', ')}
Opportunities: ${context.opportunities.join(', ')}

ML-Powered Insights:
${mlInsights.behavioralNudge ? `🧠 Behavioral Insight: ${mlInsights.behavioralNudge}` : ''}
${mlInsights.trustScore ? `🛡️ Trust Assessment: ${mlInsights.trustScore}` : ''}
${mlInsights.spendingPrediction ? `📊 Spending Prediction: ${mlInsights.spendingPrediction}` : ''}

Guidelines:
1. Use Indian currency (₹) and local context
2. Be encouraging but realistic about financial goals
3. Suggest specific, actionable steps
4. Reference their actual spending data when relevant
5. Keep responses conversational and personalized
6. Always prioritize user's financial wellbeing
7. Integrate ML insights naturally into your advice

Query Intent: ${intent}`;

    const response = await this.httpService
      .post(
        `${this.OPENAI_API_URL}/chat/completions`,
        {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6).map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            { role: 'user', content: query },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
        },
      )
      .toPromise();

    const aiMessage = response.data.choices[0].message.content;

    // Generate suggested actions based on intent
    const suggestedActions = this.generateSuggestedActions(intent, context);

    // Generate follow-up questions
    const followUpQuestions = this.generateFollowUpQuestions(intent, context);

    return {
      message: aiMessage,
      suggestedActions,
      followUpQuestions,
      confidence: Math.min(0.95, 0.85 + (mlInsights.confidenceBoost || 0)),
      dataVisualization: this.generateDataVisualization(intent, context),
    };
  }

  /**
   * Get ML-powered insights from our AI services
   */
  private async getMLInsights(
    context: UserFinancialContext,
    intent: string,
  ): Promise<{
    behavioralNudge?: string;
    trustScore?: string;
    spendingPrediction?: string;
    confidenceBoost?: number;
  }> {
    try {
      const insights: any = {};
      let confidenceBoost = 0;

      // Get behavioral nudges for spending patterns
      if (intent === 'spending_analysis' || intent === 'budget_management') {
        try {
          const behavioralResponse = await this.httpService
            .post(`${this.ML_SERVICES_URL}/predict/behavioral-nudge`, {
              spending_data: context.categoryBreakdown,
              monthly_income: context.monthlyIncome || 50000,
              savings_rate: context.savingsRate,
            })
            .toPromise();

          insights.behavioralNudge = behavioralResponse.data.nudge_message;
          confidenceBoost += 0.05;
        } catch {
          this.logger.warn('Behavioral nudge service unavailable');
        }
      }

      // Get trust scoring insights for merchant-related queries
      if (context.topMerchants.length > 0) {
        try {
          const trustResponse = await this.httpService
            .post(`${this.ML_SERVICES_URL}/predict/trust-score`, {
              user_id: 'current_user',
              contact_vpa: context.topMerchants[0].name,
              transaction_history: context.topMerchants.map((m) => ({
                amount: m.amount,
                frequency: m.frequency,
              })),
            })
            .toPromise();

          insights.trustScore = `Your top merchant ${context.topMerchants[0].name} has a trust score of ${trustResponse.data.trust_score}/100`;
          confidenceBoost += 0.03;
        } catch {
          this.logger.warn('Trust scoring service unavailable');
        }
      }

      insights.confidenceBoost = confidenceBoost;
      return insights;
    } catch (error) {
      this.logger.error('ML insights failed:', error.message);
      return {};
    }
  }

  /**
   * Generate contextual suggested actions
   */
  private generateSuggestedActions(
    intent: string,
    context: UserFinancialContext,
  ): AIResponse['suggestedActions'] {
    const actions: AIResponse['suggestedActions'] = [];

    switch (intent) {
      case 'budget_management':
        if (context.savingsRate < 0.2) {
          actions.push({
            type: 'set_budget',
            title: 'Set Monthly Budgets',
            description: `Create spending limits for your top categories`,
            data: { suggestedLimits: context.categoryBreakdown },
          });
        }
        break;

      case 'savings_advice':
        const potentialSavings = Object.entries(context.categoryBreakdown).sort(
          ([, a], [, b]) => b - a,
        )[0];

        if (potentialSavings) {
          actions.push({
            type: 'reduce_spending',
            title: `Reduce ${potentialSavings[0]} Spending`,
            description: `Save ₹${(potentialSavings[1] * 0.2).toLocaleString('en-IN')} monthly by cutting 20%`,
          });
        }
        break;

      case 'investment_guidance':
        if (context.savingsRate > 0.1) {
          actions.push({
            type: 'invest',
            title: 'Start SIP Investment',
            description:
              'Begin systematic investment with your monthly savings',
            data: { suggestedAmount: context.spendingTrends.thisMonth * 0.2 },
          });
        }
        break;
    }

    return actions;
  }

  /**
   * Generate relevant follow-up questions
   */
  private generateFollowUpQuestions(
    intent: string,
    context: UserFinancialContext,
  ): string[] {
    const questions: string[] = [];

    if (intent === 'spending_analysis') {
      questions.push('Which category would you like to focus on reducing?');
      questions.push('What triggers your highest spending days?');
    }

    if (intent === 'savings_advice') {
      questions.push('What are you saving money for?');
      questions.push('Would you like help setting up automatic savings?');
    }

    if (context.savingsRate < 0.1) {
      questions.push('Would you like tips on increasing your savings rate?');
    }

    return questions.slice(0, 3);
  }

  /**
   * Generate data visualization suggestions
   */
  private generateDataVisualization(
    intent: string,
    context: UserFinancialContext,
  ): AIResponse['dataVisualization'] | undefined {
    if (intent === 'spending_analysis') {
      return {
        type: 'chart',
        data: {
          type: 'pie',
          title: 'Spending by Category',
          data: context.categoryBreakdown,
        },
      };
    }

    if (intent === 'budget_management') {
      return {
        type: 'comparison',
        data: {
          title: 'Monthly Spending Trend',
          current: context.spendingTrends.thisMonth,
          previous: context.spendingTrends.lastMonth,
          average: context.spendingTrends.threeMonthAvg,
        },
      };
    }

    return undefined;
  }

  // Helper methods
  private getMonthSpending(payments: any[], monthsBack: number): number {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() - monthsBack);

    const startOfMonth = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      1,
    );
    const endOfMonth = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0,
    );

    return payments
      .filter(
        (p) => p.completedAt >= startOfMonth && p.completedAt <= endOfMonth,
      )
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }

  private identifyRiskFactors(
    user: any,
    categoryBreakdown: Record<string, number>,
    thisMonth: number,
    lastMonth: number,
  ): string[] {
    const risks: string[] = [];

    // High month-over-month increase
    if (thisMonth > lastMonth * 1.3) {
      risks.push('Spending increased 30%+ this month');
    }

    // Low savings rate
    if (user.monthlySalary && thisMonth > Number(user.monthlySalary) * 0.8) {
      risks.push('Spending over 80% of income');
    }

    // Category concentration
    const topCategory = Object.entries(categoryBreakdown).sort(
      ([, a], [, b]) => b - a,
    )[0];
    if (topCategory && topCategory[1] > thisMonth * 0.6) {
      risks.push(`Over-concentrated in ${topCategory[0]} spending`);
    }

    return risks;
  }

  private identifyOpportunities(
    user: any,
    categoryBreakdown: Record<string, number>,
    totalSpending: number,
  ): string[] {
    const opportunities: string[] = [];

    // High discretionary spending
    const discretionary = ['Entertainment', 'Shopping', 'Food & Dining'];
    const discretionaryTotal = discretionary.reduce(
      (sum, cat) => sum + (categoryBreakdown[cat] || 0),
      0,
    );

    if (discretionaryTotal > totalSpending * 0.4) {
      opportunities.push('Optimize discretionary spending categories');
    }

    // Investment opportunity
    if (
      user.monthlySalary &&
      Number(user.monthlySalary) > totalSpending * 1.2
    ) {
      opportunities.push('Start systematic investment plan');
    }

    return opportunities;
  }

  private async logInteraction(
    userId: string,
    query: string,
    response: AIResponse,
    intent: string,
  ) {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ai_chat_logs (
          user_id,
          query,
          intent,
          response_confidence,
          actions_suggested,
          created_at
        ) VALUES (
          ${userId},
          ${query},
          ${intent},
          ${response.confidence},
          ${JSON.stringify(response.suggestedActions)},
          NOW()
        )
      `;
    } catch (error) {
      this.logger.error('Failed to log AI interaction:', error);
    }
  }

  private getFallbackResponse(_query: string): AIResponse {
    console.log(_query);
    return {
      message:
        "I'm experiencing some technical difficulties right now. Let me help you with some general financial guidance based on your question.",
      suggestedActions: [
        {
          type: 'learn_more',
          title: 'View Spending Summary',
          description: 'Check your recent spending patterns and trends',
        },
      ],
      followUpQuestions: [
        'What specific area of your finances would you like help with?',
        'Are you looking to save more or spend smarter?',
      ],
      confidence: 0.3,
    };
  }
}
