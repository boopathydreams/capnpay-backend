import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create test user for development
   */
  async findOrCreateTestUser(userId: string) {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: userId,
          phoneE164: '+919999999999',
          name: 'Test User',
        },
      });
    }

    return user;
  }

  /**
   * Get all categories for user
   */
  async getUserCategories(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Seed default categories for a new user using canonical categories
   */
  async seedDefaultCategories(userId: string) {
    // Get canonical categories from catalog
    const canonicalCategories = await this.prisma.categoryCatalog.findMany({
      where: {
        name: {
          in: [
            'Food & Dining',
            'Shopping',
            'Transport',
            'Entertainment',
            'Bills & Utilities',
            'Healthcare',
          ],
        },
      },
      orderBy: { name: 'asc' },
    });

    const categories = await Promise.all(
      canonicalCategories.map((canonicalCat) =>
        this.prisma.category.create({
          data: {
            userId,
            name: canonicalCat.name,
            color: canonicalCat.color,
            capAmount: canonicalCat.defaultCapAmount,
            canonicalCategoryId: canonicalCat.id,
            softBlock: false,
            nearThresholdPct: 80,
          },
        }),
      ),
    );

    return categories;
  }

  /**
   * Find canonical category for merchant name
   */
  async findCanonicalCategoryForMerchant(merchantName: string) {
    if (!merchantName) return null;

    // Normalize merchant name for lookup
    const normalizedName = merchantName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Look up in merchant catalog
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

    // Filter by aliases in memory
    const merchant =
      merchants.find((m) => {
        if (!m.aliases) return false;
        const aliasArray = Array.isArray(m.aliases) ? m.aliases : [];
        return aliasArray.some(
          (alias: string) =>
            typeof alias === 'string' &&
            alias.toLowerCase().includes(merchantName.toLowerCase()),
        );
      }) || merchants[0];

    return merchant?.categoryCatalog || null;
  }

  /**
   * Get or create category with canonical mapping
   */
  async getOrCreateCategoryWithCanonical(
    userId: string,
    categoryName: string,
    merchantName?: string,
  ) {
    // First try to find existing user category
    let category = await this.prisma.category.findFirst({
      where: {
        userId,
        name: { equals: categoryName, mode: 'insensitive' },
      },
      include: {
        canonicalCategory: true,
      },
    });

    if (category) {
      return category;
    }

    // Find canonical category for merchant or category name
    let canonicalCategory = null;

    if (merchantName) {
      canonicalCategory =
        await this.findCanonicalCategoryForMerchant(merchantName);
    }

    if (!canonicalCategory) {
      // Find by category name matching - get all categories and filter in memory
      const allCanonicalCategories = await this.prisma.categoryCatalog.findMany(
        {
          where: {
            name: { equals: categoryName, mode: 'insensitive' },
          },
        },
      );

      if (allCanonicalCategories.length === 0) {
        // Search by aliases in memory
        const categoriesWithAliases =
          await this.prisma.categoryCatalog.findMany();
        canonicalCategory = categoriesWithAliases.find((cat) => {
          if (!cat.aliases) return false;
          const aliasArray = Array.isArray(cat.aliases) ? cat.aliases : [];
          return aliasArray.some(
            (alias: string) =>
              typeof alias === 'string' &&
              alias.toLowerCase() === categoryName.toLowerCase(),
          );
        });
      } else {
        canonicalCategory = allCanonicalCategories[0];
      }
    }

    // Create new category with canonical mapping
    category = await this.prisma.category.create({
      data: {
        userId,
        name: categoryName,
        color: canonicalCategory?.color || '#C7ECEE', // Default to 'Other' color
        capAmount: canonicalCategory?.defaultCapAmount || 10000,
        canonicalCategoryId: canonicalCategory?.id,
        softBlock: false,
        nearThresholdPct: 80,
      },
      include: {
        canonicalCategory: true,
      },
    });

    return category;
  }

  /**
   * Phase 2: Resolve canonical category to user category
   * Returns user's category mapped to the canonical category, creating if needed
   */
  async resolveCanonicalToUserCategory(
    userId: string,
    canonicalCategoryId: string,
  ) {
    // First check if user already has a category mapped to this canonical category
    const existingCategory = await this.prisma.category.findFirst({
      where: {
        userId,
        canonicalCategoryId,
      },
      include: {
        canonicalCategory: true,
      },
    });

    if (existingCategory) {
      return existingCategory;
    }

    // Get the canonical category details
    const canonicalCategory = await this.prisma.categoryCatalog.findUnique({
      where: { id: canonicalCategoryId },
    });

    if (!canonicalCategory) {
      throw new Error(`Canonical category not found: ${canonicalCategoryId}`);
    }

    // Create new user category mapped to canonical category
    const newCategory = await this.prisma.category.create({
      data: {
        userId,
        name: canonicalCategory.name,
        color: canonicalCategory.color,
        capAmount: canonicalCategory.defaultCapAmount,
        canonicalCategoryId: canonicalCategory.id,
        softBlock: false,
        nearThresholdPct: 80,
      },
      include: {
        canonicalCategory: true,
      },
    });

    return newCategory;
  }

  /**
   * Phase 2: Upsert per-user category with canonical mapping
   * Creates or updates user category ensuring canonical mapping
   */
  async upsertUserCategoryWithCanonical(
    userId: string,
    categoryData: {
      name: string;
      color?: string;
      capAmount?: number;
      canonicalCategoryId?: string;
      merchantName?: string;
    },
  ) {
    let canonicalCategoryId = categoryData.canonicalCategoryId;

    // If no canonical category provided but merchant name given, try to resolve
    if (!canonicalCategoryId && categoryData.merchantName) {
      const canonicalCategory = await this.findCanonicalCategoryForMerchant(
        categoryData.merchantName,
      );
      canonicalCategoryId = canonicalCategory?.id;
    }

    // If still no canonical category, try to find by category name
    if (!canonicalCategoryId) {
      const canonicalCategories = await this.prisma.categoryCatalog.findMany({
        where: {
          name: { equals: categoryData.name, mode: 'insensitive' },
        },
      });

      if (canonicalCategories.length === 0) {
        // Search by aliases in memory
        const allCategories = await this.prisma.categoryCatalog.findMany();
        const canonicalCategory = allCategories.find((cat) => {
          if (!cat.aliases) return false;
          const aliasArray = Array.isArray(cat.aliases) ? cat.aliases : [];
          return aliasArray.some(
            (alias: string) =>
              typeof alias === 'string' &&
              alias.toLowerCase() === categoryData.name.toLowerCase(),
          );
        });
        canonicalCategoryId = canonicalCategory?.id;
      } else {
        canonicalCategoryId = canonicalCategories[0].id;
      }
    }

    // Get canonical category details for defaults
    let canonicalCategory = null;
    if (canonicalCategoryId) {
      canonicalCategory = await this.prisma.categoryCatalog.findUnique({
        where: { id: canonicalCategoryId },
      });
    }

    // Check if user already has this category (by name or canonical mapping)
    const existingCategory = await this.prisma.category.findFirst({
      where: {
        userId,
        OR: [
          { name: { equals: categoryData.name, mode: 'insensitive' } },
          ...(canonicalCategoryId ? [{ canonicalCategoryId }] : []),
        ],
      },
    });

    if (existingCategory) {
      // Update existing category
      return this.prisma.category.update({
        where: { id: existingCategory.id },
        data: {
          name: categoryData.name,
          color:
            categoryData.color ??
            canonicalCategory?.color ??
            existingCategory.color,
          capAmount:
            categoryData.capAmount ??
            canonicalCategory?.defaultCapAmount ??
            existingCategory.capAmount,
          canonicalCategoryId:
            canonicalCategoryId ?? existingCategory.canonicalCategoryId,
        },
        include: {
          canonicalCategory: true,
        },
      });
    } else {
      // Create new category
      return this.prisma.category.create({
        data: {
          userId,
          name: categoryData.name,
          color: categoryData.color ?? canonicalCategory?.color ?? '#C7ECEE',
          capAmount:
            categoryData.capAmount ??
            canonicalCategory?.defaultCapAmount ??
            10000,
          canonicalCategoryId,
          softBlock: false,
          nearThresholdPct: 80,
        },
        include: {
          canonicalCategory: true,
        },
      });
    }
  }

  /**
   * Get category by ID
   */
  async getCategory(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
    });
  }

  /**
   * Get detailed spending caps with current usage
   */
  async getUserSpendingCapsDetailed(userId: string) {
    const currentMonth = new Date();
    const startOfMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1,
    );

    // Get user's spending caps
    const spendingCaps = await this.prisma.spendingCap.findMany({
      where: { userId, isEnabled: true },
      include: {
        category: true,
      },
    });

    const capsWithUsage = await Promise.all(
      spendingCaps.map(async (cap) => {
        // Get transactions for this category this month
        const categoryTransactions = await this.prisma.paymentIntent.findMany({
          where: {
            userId,
            status: 'SUCCESS',
            completedAt: {
              gte: startOfMonth,
              lte: new Date(),
            },
            tags: {
              some: {
                categoryId: cap.categoryId,
              },
            },
          },
          select: { amount: true },
        });

        const spent = categoryTransactions.reduce(
          (sum, txn) => sum + Number(txn.amount),
          0,
        );

        const limit = Number(cap.monthlyLimit);
        const progress = limit > 0 ? (spent / limit) * 100 : 0;

        let status: 'OK' | 'NEAR' | 'OVER';
        let progressColor: string;

        if (progress >= 100) {
          status = 'OVER';
          progressColor = '#EF4444'; // Red
        } else if (progress >= 80) {
          status = 'NEAR';
          progressColor = '#F59E0B'; // Orange/Amber
        } else {
          status = 'OK';
          progressColor = '#10B981'; // Green
        }

        return {
          id: cap.id,
          name: cap.categoryName,
          spent,
          limit,
          progress: Math.round(progress),
          status,
          color: cap.color,
          progressColor,
          description: cap.description,
          dailyLimit: Number(cap.dailyLimit),
          weeklyLimit: Number(cap.weeklyLimit),
        };
      }),
    );

    return {
      caps: capsWithUsage,
      totalCaps: capsWithUsage.length,
      totalSpent: capsWithUsage.reduce((sum, cap) => sum + cap.spent, 0),
      totalLimit: capsWithUsage.reduce((sum, cap) => sum + cap.limit, 0),
    };
  }
}
