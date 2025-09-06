import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Categories')
@Controller('categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all categories for the user',
    description:
      'Returns all spending categories available for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  async getUserCategories(@CurrentUser() user: any) {
    return await this.categoriesService.getUserCategories(user.id);
  }

  @Get('spending-caps')
  @ApiOperation({
    summary: 'Get all spending caps with details',
    description:
      'Returns all spending caps for the user with current usage and limits',
  })
  @ApiResponse({
    status: 200,
    description: 'Spending caps retrieved successfully',
  })
  async getUserSpendingCaps(@CurrentUser() user: any) {
    return await this.categoriesService.getUserSpendingCapsDetailed(user.id);
  }
}
