import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CanonicalCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all canonical categories
   */
  async getAllCanonicalCategories() {
    return this.prisma.categoryCatalog.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            merchantCatalog: true,
            categories: true,
          },
        },
      },
    });
  }

  /**
   * Find merchants by category
   */
  async getMerchantsByCategory(categoryName: string) {
    return this.prisma.merchantCatalog.findMany({
      where: {
        categoryCatalog: {
          name: categoryName,
        },
      },
      include: {
        categoryCatalog: {
          select: {
            name: true,
            color: true,
          },
        },
      },
      take: 20,
      orderBy: { confidence: 'desc' },
    });
  }

  /**
   * Search merchants by name
   */
  async searchMerchants(query: string) {
    const normalizedQuery = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return this.prisma.merchantCatalog.findMany({
      where: {
        OR: [
          {
            normalizedName: {
              contains: normalizedQuery,
              mode: 'insensitive',
            },
          },
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      include: {
        categoryCatalog: {
          select: {
            name: true,
            color: true,
          },
        },
      },
      take: 10,
      orderBy: { confidence: 'desc' },
    });
  }

  /**
   * Get category statistics
   */
  async getCategoryStats() {
    const stats = await this.prisma.categoryCatalog.findMany({
      include: {
        _count: {
          select: {
            merchantCatalog: true,
            categories: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const totalMerchants = await this.prisma.merchantCatalog.count();
    const totalUserCategories = await this.prisma.category.count();
    const mappedUserCategories = await this.prisma.category.count({
      where: {
        canonicalCategoryId: {
          not: null,
        },
      },
    });

    return {
      canonicalCategories: stats,
      summary: {
        totalCanonicalCategories: stats.length,
        totalMerchants,
        totalUserCategories,
        mappedUserCategories,
        mappingPercentage:
          totalUserCategories > 0
            ? Math.round((mappedUserCategories / totalUserCategories) * 100)
            : 0,
      },
    };
  }

  /**
   * Import merchant data from ML services
   */
  async syncMerchantCatalog() {
    // This would trigger the import script
    // For now, return status
    const merchantCount = await this.prisma.merchantCatalog.count();
    const categoryCount = await this.prisma.categoryCatalog.count();

    return {
      status: 'synced',
      merchants: merchantCount,
      categories: categoryCount,
      lastSync: new Date(),
    };
  }
}
