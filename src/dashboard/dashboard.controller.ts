import { Controller, Get, UseGuards } from '@nestjs/common';
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
  ): Promise<DashboardOverview> {
    return this.dashboardService.getDashboardOverview(user.id);
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
  ): Promise<DashboardInsights> {
    return this.dashboardService.getDashboardInsights(user.id);
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
  async getSpendingTrend(@CurrentUser() user: any) {
    return this.dashboardService.getSpendingTrend(user.id);
  }
}
