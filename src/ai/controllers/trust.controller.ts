import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrustScoreService } from '../services/trust-score.service';

@ApiTags('Trust Score')
@Controller('trust')
export class TrustController {
  constructor(private readonly trustScore: TrustScoreService) {}

  @Get(':userId/:contactVpa')
  @ApiOperation({
    summary: 'Get trust score for contact',
    description: 'Calculate comprehensive trust score for UPI contact',
  })
  @ApiResponse({ status: 200, description: 'Trust score calculated' })
  async getTrustScore(
    @Param('userId') userId: string,
    @Param('contactVpa') contactVpa: string,
  ) {
    return await this.trustScore.calculateTrustScore(userId, contactVpa);
  }
}
