import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardInsights } from './dto/dashboard.dto';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { CurrentUser } from '../auth/decorators/current-user.decorator';
// import { User } from '../users/entities/user.entity';

@ApiTags('Dashboard')
@Controller('dashboard')
// @UseGuards(JwtAuthGuard) // TODO: Enable when auth is implemented
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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
  async getDashboardInsights(): Promise<DashboardInsights> {
    // For now, use mock user ID until auth is implemented
    const mockUserId = 'mock-user-123';
    return this.dashboardService.getDashboardInsights(mockUserId);
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
  async getSpendingTrend() {
    const mockUserId = 'mock-user-123';
    return this.dashboardService.getSpendingTrend(mockUserId);
  }
}
