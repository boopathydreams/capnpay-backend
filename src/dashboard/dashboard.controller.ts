import { Controller, Get, UseGuards, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardInsights, DashboardOverview } from './dto/dashboard.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Get dashboard overview',
    description:
      'Returns complete dashboard data including user spending summary, category caps, upcoming bills, and recent activity',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard overview retrieved successfully',
    type: 'object',
  })
  async getDashboardOverview(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ): Promise<DashboardOverview> {
    const m = month ? parseInt(month, 10) : undefined;
    const y = year ? parseInt(year, 10) : undefined;
    return this.dashboardService.getDashboardOverview(user.id, m, y);
  }

  @Get('insights')
  @ApiOperation({
    summary: 'Get dashboard insights',
    description:
      'Returns monthly spending overview, category breakdowns, and recent transactions',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard insights retrieved successfully',
    type: 'object',
  })
  async getDashboardInsights(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ): Promise<DashboardInsights> {
    const m = month ? parseInt(month, 10) : undefined;
    const y = year ? parseInt(year, 10) : undefined;
    return this.dashboardService.getDashboardInsights(user.id, m, y);
  }

  @Get('spending-trend')
  @ApiOperation({
    summary: 'Get spending trend over time',
    description: 'Returns spending data for charts and trends analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'Spending trend data retrieved successfully',
  })
  async getSpendingTrend(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const m = month ? parseInt(month, 10) : undefined;
    const y = year ? parseInt(year, 10) : undefined;
    return this.dashboardService.getSpendingTrend(user.id, m, y);
  }

  @Get('categories/:categoryName/transactions')
  @ApiOperation({
    summary: 'Get transactions for a specific category',
    description:
      'Returns all transactions for the specified category with optional limit',
  })
  @ApiResponse({
    status: 200,
    description: 'Category transactions retrieved successfully',
  })
  async getCategoryTransactions(
    @CurrentUser() user: any,
    @Param('categoryName') categoryName: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return await this.dashboardService.getCategoryTransactions(
      user.id,
      categoryName,
      limitNum,
    );
  }

  @Get('caps-overview')
  @ApiOperation({
    summary: 'Get comprehensive caps overview',
    description:
      'Returns detailed information about all spending caps including progress, remaining amounts, and overall budget summary',
  })
  @ApiResponse({
    status: 200,
    description: 'Caps overview retrieved successfully',
  })
  async getCapsOverview(@CurrentUser() user: any) {
    return this.dashboardService.getCapsOverview(user.id);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Get all transactions',
    description: 'Returns all user transactions with pagination support',
  })
  @ApiResponse({
    status: 200,
    description: 'All transactions retrieved successfully',
  })
  async getAllTransactions(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const offsetNum = offset ? parseInt(offset, 10) : undefined;
    return this.dashboardService.getAllTransactions(
      user.id,
      limitNum,
      offsetNum,
    );
  }
}
