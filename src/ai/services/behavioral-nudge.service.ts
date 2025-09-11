import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BehavioralContext {
  userId: string;
  amount: number;
  categoryId: string;
  payeeName?: string;
  timeOfDay: number;
  isWeekend: boolean;
  monthlySpent: number;
  categorySpent: number;
  lastSimilarTransaction?: Date;
}

export interface AIGeneratedNudge {
  id: string;
  type:
    | 'spending_alert'
    | 'saving_opportunity'
    | 'pattern_insight'
    | 'goal_progress'
    | 'habit_formation';
  severity: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  actionText?: string;
  actionType?: 'defer' | 'reduce' | 'alternative' | 'acknowledge';
  psychologyTechnique:
    | 'loss_aversion'
    | 'social_proof'
    | 'commitment'
    | 'visualization'
    | 'micro_investment';
  personalizedData: Record<string, any>;
  timing:
    | 'pre_payment'
    | 'post_payment'
    | 'daily_summary'
    | 'weekly_reflection';
  effectiveness?: number; // Historical effectiveness score
}

@Injectable()
export class AIBehavioralNudgeService {
  private readonly logger = new Logger(AIBehavioralNudgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate contextual AI nudges using behavioral finance principles
   */
  async generateSmartNudges(
    context: BehavioralContext,
  ): Promise<AIGeneratedNudge[]> {
    const nudges: AIGeneratedNudge[] = [];

    // 1. Loss Aversion Nudges
    const lossAversionNudge = await this.generateLossAversionNudge(context);
    if (lossAversionNudge) nudges.push(lossAversionNudge);

    // 2. Social Proof Nudges
    const socialProofNudge = await this.generateSocialProofNudge(context);
    if (socialProofNudge) nudges.push(socialProofNudge);

    // 3. Commitment Device Nudges
    const commitmentNudge = await this.generateCommitmentNudge(context);
    if (commitmentNudge) nudges.push(commitmentNudge);

    // 4. Mental Accounting Nudges
    const mentalAccountingNudge =
      await this.generateMentalAccountingNudge(context);
    if (mentalAccountingNudge) nudges.push(mentalAccountingNudge);

    // 5. Future Self Visualization
    const visualizationNudge = await this.generateVisualizationNudge(context);
    if (visualizationNudge) nudges.push(visualizationNudge);

    // Sort by effectiveness and severity
    return nudges
      .sort((a, b) => (b.effectiveness || 0) - (a.effectiveness || 0))
      .slice(0, 3); // Maximum 3 nudges to avoid overwhelm
  }

  /**
   * Loss Aversion: Frame spending in terms of what user is giving up
   */
  private async generateLossAversionNudge(
    context: BehavioralContext,
  ): Promise<AIGeneratedNudge | null> {
    const categoryLimit = await this.getCategoryLimit(
      context.userId,
      context.categoryId,
    );
    if (!categoryLimit) return null;

    const remainingBudget = categoryLimit - context.categorySpent;
    const spendingRate = context.categorySpent / categoryLimit;

    if (spendingRate > 0.8) {
      // Calculate alternative uses for the money
      const savingsGoal = await this.getUserSavingsGoal(context.userId);
      const alternativeUse = this.calculateAlternativeUse(context.amount);

      return {
        id: `loss_aversion_${Date.now()}`,
        type: 'spending_alert',
        severity: 'high',
        title: 'Budget Alert',
        message: `You're about to spend ₹${context.amount}. This could be ${alternativeUse} instead. Only ₹${remainingBudget.toFixed(0)} left in your budget.`,
        actionText: 'Maybe Later',
        actionType: 'defer',
        psychologyTechnique: 'loss_aversion',
        personalizedData: {
          remainingBudget,
          alternativeUse,
          spendingRate: Math.round(spendingRate * 100),
        },
        timing: 'pre_payment',
        effectiveness: 0.78,
      };
    }

    return null;
  }

  /**
   * Social Proof: Show how user compares to similar users
   */
  private async generateSocialProofNudge(
    context: BehavioralContext,
  ): Promise<AIGeneratedNudge | null> {
    const peerComparison = await this.getPeerSpendingComparison(context);

    if (peerComparison.percentile > 80) {
      return {
        id: `social_proof_${Date.now()}`,
        type: 'pattern_insight',
        severity: 'medium',
        title: 'Spending Insight',
        message: `You're spending more than ${100 - peerComparison.percentile}% of similar users this month. The average person in your spending range spends ₹${peerComparison.peerAverage} on ${context.categoryId}.`,
        psychologyTechnique: 'social_proof',
        personalizedData: {
          percentile: peerComparison.percentile,
          peerAverage: peerComparison.peerAverage,
          yourSpending: context.categorySpent,
        },
        timing: 'pre_payment',
        effectiveness: 0.65,
      };
    }

    return null;
  }

  /**
   * Commitment Device: Help user commit to spending limits
   */
  private async generateCommitmentNudge(
    context: BehavioralContext,
  ): Promise<AIGeneratedNudge | null> {
    const hasCommitment = await this.hasActiveCommitment(
      context.userId,
      context.categoryId,
    );

    if (!hasCommitment && context.categorySpent > 0) {
      const suggestedLimit = Math.ceil(context.categorySpent * 1.2); // 20% buffer

      return {
        id: `commitment_${Date.now()}`,
        type: 'habit_formation',
        severity: 'low',
        title: 'Stay on Track',
        message: `Want to limit your ${context.categoryId} spending? Set a ₹${suggestedLimit} monthly limit to stay mindful.`,
        actionText: 'Set Limit',
        actionType: 'defer',
        psychologyTechnique: 'commitment',
        personalizedData: {
          suggestedLimit,
          currentSpending: context.categorySpent,
          category: context.categoryId,
        },
        timing: 'post_payment',
        effectiveness: 0.72,
      };
    }

    return null;
  }

  /**
   * Mental Accounting: Reframe spending in different contexts
   */
  private async generateMentalAccountingNudge(
    context: BehavioralContext,
  ): Promise<AIGeneratedNudge | null> {
    const monthlyIncome = await this.getUserMonthlyIncome(context.userId);
    if (!monthlyIncome) return null;

    const percentOfIncome = (context.amount / monthlyIncome) * 100;

    if (percentOfIncome > 2) {
      // More than 2% of monthly income
      const workHours = this.calculateWorkHours(context.amount, monthlyIncome);

      return {
        id: `mental_accounting_${Date.now()}`,
        type: 'spending_alert',
        severity: 'medium',
        title: 'Think About It',
        message: `This ₹${context.amount} represents ${workHours} hours of work (${percentOfIncome.toFixed(1)}% of your monthly income). Is it worth it?`,
        actionText: 'Reconsider Amount',
        actionType: 'reduce',
        psychologyTechnique: 'visualization',
        personalizedData: {
          workHours,
          percentOfIncome: percentOfIncome.toFixed(1),
          monthlyIncome,
        },
        timing: 'pre_payment',
        effectiveness: 0.68,
      };
    }

    return null;
  }

  /**
   * Future Self Visualization: Show long-term impact
   */
  private async generateVisualizationNudge(
    context: BehavioralContext,
  ): Promise<AIGeneratedNudge | null> {
    const avgMonthlySpending = await this.getAverageMonthlySpending(
      context.userId,
      context.categoryId,
    );

    if (avgMonthlySpending > 0) {
      const yearlyProjection = avgMonthlySpending * 12;
      const potentialSavings = yearlyProjection * 0.2; // 20% reduction
      const investmentGrowth = this.calculateInvestmentGrowth(
        potentialSavings,
        5,
      ); // 5 years at 12% return

      return {
        id: `visualization_${Date.now()}`,
        type: 'saving_opportunity',
        severity: 'low',
        title: 'Future You',
        message: `If you reduce ${context.categoryId} spending by 20%, you could invest ₹${potentialSavings.toFixed(0)}/year. In 5 years, this could grow to ₹${investmentGrowth.toFixed(0)}.`,
        actionText: 'Learn More',
        actionType: 'alternative',
        psychologyTechnique: 'visualization',
        personalizedData: {
          yearlyProjection,
          potentialSavings: potentialSavings.toFixed(0),
          investmentGrowth: investmentGrowth.toFixed(0),
          category: context.categoryId,
        },
        timing: 'weekly_reflection',
        effectiveness: 0.45,
      };
    }

    return null;
  }

  // Helper methods
  private async getCategoryLimit(
    userId: string,
    categoryId: string,
  ): Promise<number | null> {
    const category = await this.prisma.category.findFirst({
      where: { userId, id: categoryId },
    });
    return category?.capAmount ? Number(category.capAmount) : null;
  }

  private async getUserSavingsGoal(userId: string): Promise<number | null> {
    // Future: Implement savings goals
    return null;
  }

  private calculateAlternativeUse(amount: number): string {
    if (amount >= 500) return `${Math.floor(amount / 500)} movie tickets`;
    if (amount >= 200) return `${Math.floor(amount / 200)} coffee dates`;
    if (amount >= 100) return `${Math.floor(amount / 100)} snacks`;
    return 'a small treat';
  }

  private async getPeerSpendingComparison(context: BehavioralContext) {
    // Simplified peer comparison - in production, use sophisticated cohort analysis
    const peerAverage = context.categorySpent * 0.8; // Mock: user spends 20% more than peers
    const percentile = 75; // Mock: user is in 75th percentile

    return { peerAverage, percentile };
  }

  private async hasActiveCommitment(
    userId: string,
    categoryId: string,
  ): Promise<boolean> {
    const category = await this.prisma.category.findFirst({
      where: { userId, id: categoryId, capAmount: { not: null } },
    });
    return !!category;
  }

  private async getUserMonthlyIncome(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { monthlySalary: true },
    });
    return user?.monthlySalary ? Number(user.monthlySalary) : null;
  }

  private calculateWorkHours(amount: number, monthlyIncome: number): string {
    const hourlyRate = monthlyIncome / (22 * 8); // 22 working days, 8 hours
    const hours = amount / hourlyRate;

    if (hours < 1) return `${Math.round(hours * 60)} minutes`;
    if (hours < 8) return `${hours.toFixed(1)} hours`;
    return `${Math.round(hours / 8)} days`;
  }

  private async getAverageMonthlySpending(
    userId: string,
    categoryId: string,
  ): Promise<number> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const payments = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        status: 'SUCCESS',
        completedAt: { gte: threeMonthsAgo },
        tags: { some: { categoryId } },
      },
    });

    const totalSpent = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return totalSpent / 3; // 3-month average
  }

  private calculateInvestmentGrowth(
    principal: number,
    years: number,
    rate = 0.12,
  ): number {
    return principal * Math.pow(1 + rate, years);
  }
}
