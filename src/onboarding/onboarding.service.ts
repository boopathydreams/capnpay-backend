import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteOnboardingDto } from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get budget recommendations based on salary
   */
  getBudgetRecommendations(salary: number) {
    // Financial research-based recommendations for Indian salary ranges
    const budgetPercentage = this.calculateBudgetPercentage(salary);
    const totalBudget = Math.round(salary * budgetPercentage);

    const categoryRecommendations = [
      {
        name: 'Food & Dining',
        color: '#10B981',
        percentage: 30,
        description: 'Meals, groceries, and dining out',
      },
      {
        name: 'Transport',
        color: '#3B82F6',
        percentage: 15,
        description: 'Commute, fuel, and transportation',
      },
      {
        name: 'Shopping',
        color: '#F59E0B',
        percentage: 20,
        description: 'Clothing, electronics, and personal items',
      },
      {
        name: 'Entertainment',
        color: '#8B5CF6',
        percentage: 10,
        description: 'Movies, subscriptions, and leisure',
      },
      {
        name: 'Bills & Utilities',
        color: '#EF4444',
        percentage: 20,
        description: 'Electricity, internet, phone bills',
      },
      {
        name: 'Health & Wellness',
        color: '#06B6D4',
        percentage: 5,
        description: 'Healthcare, fitness, and wellness',
      },
    ];

    const categories = categoryRecommendations.map((cat) => ({
      ...cat,
      amount: Math.round((totalBudget * cat.percentage) / 100),
    }));

    return {
      totalBudget,
      salaryPercentage: Math.round(budgetPercentage * 100),
      categories,
    };
  }

  /**
   * Calculate recommended budget percentage based on salary (Indian context)
   */
  private calculateBudgetPercentage(salary: number): number {
    // Progressive budget allocation based on Indian salary ranges
    if (salary <= 25000) return 0.65; // 65% for lower income
    if (salary <= 50000) return 0.55; // 55% for middle income
    if (salary <= 100000) return 0.45; // 45% for upper middle income
    return 0.35; // 35% for high income
  }

  /**
   * Complete user onboarding
   */
  async completeOnboarding(
    userId: string,
    onboardingDto: CompleteOnboardingDto,
  ) {
    const { name, salary, totalBudget, categories, caps } = onboardingDto;

    // Validate total budget allocation
    const totalCategoryBudget = categories.reduce(
      (sum, cat) => sum + cat.amount,
      0,
    );

    if (Math.abs(totalCategoryBudget - totalBudget) > 100) {
      throw new BadRequestException(
        'Category budgets must sum up to total budget',
      );
    }

    // Start transaction
    return this.prisma.$transaction(async (tx) => {
      // Update user with name, salary, and onboarding completion
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name,
          monthlySalary: salary,
          isOnboardingComplete: true,
          onboardingCompletedAt: new Date(),
        },
      });

      // Create default user settings (upsert to handle existing users)
      await tx.userSettings.upsert({
        where: { userId },
        create: {
          userId,
          themePreference: 'system',
          biometricEnabled: false,
          transactionAlerts: true,
          budgetAlerts: true,
          monthlyReports: true,
          marketingEmails: false,
          autoTagging: true,
          spendingInsights: true,
        },
        update: {
          // Keep existing settings if they already exist
        },
      });

      // Create categories using upsert to prevent duplicates
      const createdCategories = await Promise.all(
        categories.map((category) =>
          tx.category.upsert({
            where: {
              userId_name: {
                userId,
                name: category.name,
              },
            },
            create: {
              userId,
              name: category.name,
              color: category.color,
              capAmount: category.amount,
              softBlock: false,
              nearThresholdPct: 80,
              periodStart: new Date(), // Start tracking from now
            },
            update: {
              color: category.color,
              capAmount: category.amount,
              nearThresholdPct: 80,
              periodStart: new Date(),
            },
          }),
        ),
      );

      // Create spending caps if provided
      let createdCaps = [];
      if (caps && caps.length > 0) {
        // Create a map of category names to IDs for easy lookup
        const categoryMap = new Map(
          createdCategories.map((cat) => [cat.name, cat.id]),
        );

        createdCaps = await Promise.all(
          caps.map((cap) => {
            const categoryId = categoryMap.get(cap.name);
            if (!categoryId) {
              throw new BadRequestException(
                `Category "${cap.name}" not found for spending cap`,
              );
            }

            return tx.spendingCap.upsert({
              where: {
                userId_categoryId: {
                  userId,
                  categoryId,
                },
              },
              create: {
                userId,
                categoryId,
                categoryName: cap.name,
                color: cap.color,
                description: cap.description,
                dailyLimit: cap.dailyLimit,
                weeklyLimit: cap.weeklyLimit,
                monthlyLimit: cap.monthlyLimit,
                isEnabled: cap.isEnabled,
              },
              update: {
                categoryName: cap.name,
                color: cap.color,
                description: cap.description,
                dailyLimit: cap.dailyLimit,
                weeklyLimit: cap.weeklyLimit,
                monthlyLimit: cap.monthlyLimit,
                isEnabled: cap.isEnabled,
              },
            });
          }),
        );
      }

      return {
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phoneE164,
          isOnboardingComplete: true,
        },
        categories: createdCategories,
        spendingCaps: createdCaps,
      };
    });
  }

  /**
   * Check if user is already onboarded
   */
  async checkOnboardingStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        categories: {
          select: { id: true, name: true, capAmount: true, color: true },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      isOnboardingComplete: user.isOnboardingComplete,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phoneE164,
        avatarUrl: user.avatarUrl,
        categories: user.categories,
      },
    };
  }
}
