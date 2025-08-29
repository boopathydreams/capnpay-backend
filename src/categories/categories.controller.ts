import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user categories',
    description: 'Retrieve all categories for the authenticated user',
  })
  async getUserCategories() {
    // TODO: Get userId from authenticated user context
    // For now, create a test user if it doesn't exist
    let userId = 'temp-user-id';

    // Check if test user exists, create if not
    const existingUser =
      await this.categoriesService.findOrCreateTestUser(userId);
    userId = existingUser.id;

    let categories = await this.categoriesService.getUserCategories(userId);

    // Seed default categories if none exist
    if (categories.length === 0) {
      categories = await this.categoriesService.seedDefaultCategories(userId);
    }

    return categories;
  }
}
