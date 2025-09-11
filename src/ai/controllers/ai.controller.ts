import { Controller, Post, Body, UseGuards, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

// AI Services
import { EnhancedTaggingService } from '../services/enhanced-tagging.service';
import { AIBehavioralNudgeService } from '../services/behavioral-nudge.service';
import { VoiceIntelligenceService } from '../services/voice-intelligence.service';
import { TrustScoreService } from '../services/trust-score.service';
import { AIFinancialAdvisorService } from '../services/ai-financial-advisor.service';
import { MerchantIntelligenceService } from '../services/merchant-intelligence.service';

@ApiTags('AI Services')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AIController {
  constructor(
    private readonly enhancedTagging: EnhancedTaggingService,
    private readonly behavioralNudge: AIBehavioralNudgeService,
    private readonly voiceIntelligence: VoiceIntelligenceService,
    private readonly trustScore: TrustScoreService,
    private readonly financialAdvisor: AIFinancialAdvisorService,
    private readonly merchantIntelligence: MerchantIntelligenceService,
  ) {}

  @Post('analyze-payment')
  @ApiOperation({
    summary: 'Analyze payment with AI insights',
    description: 'Get ML-powered category prediction and behavioral nudges',
  })
  @ApiResponse({ status: 200, description: 'Payment analysis completed' })
  async analyzePayment(
    @CurrentUser() user: any,
    @Body()
    dto: {
      amount: number;
      vpa: string;
      payeeName?: string;
      timeOfDay: number;
      dayOfWeek: number;
    },
  ) {
    // Enhanced tagging
    const context = {
      userId: user.id,
      amount: dto.amount,
      vpa: dto.vpa,
      payeeName: dto.payeeName,
      timeOfDay: dto.timeOfDay,
      dayOfWeek: dto.dayOfWeek,
      userSpendingProfile: {} as any,
      merchantIntelligence: {} as any,
      networkEffects: {} as any,
    };

    const tagPrediction = await this.enhancedTagging.predictCategory(context);

    // Behavioral nudges
    const nudgeContext = {
      userId: user.id,
      amount: dto.amount,
      categoryId: tagPrediction.categoryId,
      payeeName: dto.payeeName,
      timeOfDay: dto.timeOfDay,
      isWeekend: dto.dayOfWeek === 0 || dto.dayOfWeek === 6,
      monthlySpent: 0,
      categorySpent: 0,
    };

    const nudges = await this.behavioralNudge.generateSmartNudges(nudgeContext);

    return {
      tagPrediction,
      behavioralNudges: nudges,
      merchantProfile: await this.merchantIntelligence.getMerchantProfile(
        dto.vpa,
        dto.payeeName,
      ),
    };
  }

  @Get('trust-score/:contactVpa')
  @ApiOperation({
    summary: 'Get trust score for contact',
    description: 'Calculate comprehensive trust score for UPI contact',
  })
  @ApiResponse({ status: 200, description: 'Trust score calculated' })
  async getTrustScore(
    @CurrentUser() user: any,
    @Param('contactVpa') contactVpa: string,
  ) {
    return await this.trustScore.calculateTrustScore(user.id, contactVpa);
  }

  @Post('chat')
  @ApiOperation({
    summary: 'AI Financial Advisory Chat',
    description: 'Get personalized financial advice through AI chat',
  })
  @ApiResponse({ status: 200, description: 'AI response generated' })
  async aiChat(
    @CurrentUser() user: any,
    @Body()
    dto: {
      message: string;
      conversationHistory?: any[];
    },
  ) {
    return await this.financialAdvisor.processFinancialQuery(
      user.id,
      dto.message,
      dto.conversationHistory || [],
    );
  }

  @Get('merchant/suggestions/:vpa')
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
}
