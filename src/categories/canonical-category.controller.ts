import { Controller, Get, Query, Param } from '@nestjs/common';
import { CanonicalCategoryService } from './canonical-category.service';

@Controller('canonical-categories')
export class CanonicalCategoryController {
  constructor(
    private readonly canonicalCategoryService: CanonicalCategoryService,
  ) {}

  @Get('/')
  async getAllCategories() {
    return this.canonicalCategoryService.getAllCanonicalCategories();
  }

  @Get('/stats')
  async getStats() {
    return this.canonicalCategoryService.getCategoryStats();
  }

  @Get('/merchants/search')
  async searchMerchants(@Query('q') query: string) {
    if (!query) {
      return { merchants: [] };
    }
    return {
      merchants: await this.canonicalCategoryService.searchMerchants(query),
    };
  }

  @Get('/merchants/:categoryName')
  async getMerchantsByCategory(@Param('categoryName') categoryName: string) {
    return {
      merchants:
        await this.canonicalCategoryService.getMerchantsByCategory(
          categoryName,
        ),
    };
  }

  @Get('/sync')
  async syncCatalog() {
    return this.canonicalCategoryService.syncMerchantCatalog();
  }
}
