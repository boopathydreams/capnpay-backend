import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MerchantIntelligenceService } from '../services/merchant-intelligence.service';

@ApiTags('Merchant Intelligence')
@Controller('merchant')
export class MerchantController {
  constructor(
    private readonly merchantIntelligence: MerchantIntelligenceService,
  ) {}

  @Get('profile/:vpa')
  @ApiOperation({
    summary: 'Get merchant profile',
    description: 'Get comprehensive merchant profile with community data',
  })
  @ApiResponse({ status: 200, description: 'Merchant profile retrieved' })
  async getMerchantProfile(
    @Param('vpa') vpa: string,
    @Body() dto: { merchantName?: string },
  ) {
    return await this.merchantIntelligence.getMerchantProfile(
      vpa,
      dto.merchantName,
    );
  }

  @Get('suggestions/:vpa')
  @ApiOperation({
    summary: 'Get merchant category suggestions',
    description: 'Get AI-powered merchant category suggestions',
  })
  @ApiResponse({ status: 200, description: 'Merchant suggestions generated' })
  async getMerchantSuggestions(
    @Param('vpa') vpa: string,
    @Body() dto: { merchantName?: string; amount?: number },
  ) {
    return await this.merchantIntelligence.getMerchantSuggestions(
      vpa,
      dto.merchantName,
      dto.amount,
    );
  }

  @Post('tag')
  @ApiOperation({
    summary: 'Submit community merchant tag',
    description: 'Submit merchant category tag for community consensus',
  })
  @ApiResponse({ status: 200, description: 'Tag submitted successfully' })
  async submitTag(
    @Body()
    dto: {
      userId: string;
      vpa: string;
      merchantName: string;
      suggestedCategory: string;
      confidence: number;
    },
  ) {
    return await this.merchantIntelligence.submitCommunityTag(
      dto.userId,
      dto.vpa,
      dto.merchantName,
      dto.suggestedCategory,
      dto.confidence,
    );
  }
}
