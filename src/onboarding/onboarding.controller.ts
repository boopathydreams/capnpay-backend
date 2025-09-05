import { Body, Controller, Post, Get, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CompleteOnboardingDto,
  OnboardingResponseDto,
  BudgetRecommendationDto,
} from './dto/onboarding.dto';

@ApiTags('Onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('budget-recommendations')
  @ApiOperation({
    summary: 'Get budget recommendations',
    description: 'Get recommended budget allocation based on salary',
  })
  @ApiResponse({
    status: 200,
    description: 'Budget recommendations retrieved successfully',
    type: BudgetRecommendationDto,
  })
  async getBudgetRecommendations(@Query('salary') salary: string) {
    const salaryAmount = parseInt(salary, 10);
    if (isNaN(salaryAmount) || salaryAmount < 10000) {
      throw new Error('Invalid salary amount');
    }

    const recommendation =
      this.onboardingService.getBudgetRecommendations(salaryAmount);
    return { recommendation };
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Complete user onboarding',
    description: 'Complete onboarding with user details and budget setup',
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding completed successfully',
    type: OnboardingResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid onboarding data',
  })
  async completeOnboarding(
    @CurrentUser() user: any,
    @Body() onboardingDto: CompleteOnboardingDto,
  ) {
    return this.onboardingService.completeOnboarding(user.id, onboardingDto);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Check onboarding status',
    description: 'Check if user has completed onboarding',
  })
  async getOnboardingStatus(@CurrentUser() user: any) {
    return this.onboardingService.checkOnboardingStatus(user.id);
  }
}
