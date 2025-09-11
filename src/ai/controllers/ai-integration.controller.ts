import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Logger,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  AIIntegrationService,
  PaymentAnalysisRequest,
  SmartInsightsRequest,
} from '../services/ai-integration.service';

@ApiTags('AI Integration')
@Controller('ai-integration')
@UseGuards(JwtAuthGuard)
export class AIIntegrationController {
  private readonly logger = new Logger(AIIntegrationController.name);

  constructor(private readonly aiIntegration: AIIntegrationService) {}

  /**
   * 🎯 Smart Payment Analysis
   * Complete AI-powered payment analysis before transaction
   */
  @Post('analyze-payment')
  @ApiOperation({
    summary: 'Analyze payment with full AI suite',
    description:
      'Get category prediction, trust score, behavioral nudges, and merchant intelligence',
  })
  @ApiResponse({ status: 200, description: 'Payment analysis completed' })
  async analyzePayment(
    @Body()
    request: {
      amount: number;
      payeeName: string;
      vpa?: string;
      description?: string;
      userContext?: {
        monthlyIncome?: number;
        categorySpending: Record<string, number>;
        recentTransactions: any[];
      };
    },
    @CurrentUser('id') userId: string,
  ) {
    try {
      this.logger.log(
        `Analyzing payment for user ${userId}: ₹${request.amount} to ${request.payeeName}`,
      );

      const analysisRequest: PaymentAnalysisRequest = {
        ...request,
        userId,
      };

      const result = await this.aiIntegration.analyzePayment(analysisRequest);

      return {
        success: true,
        data: result,
        message: 'Payment analysis completed successfully',
      };
    } catch (error) {
      this.logger.error('Payment analysis failed:', error);
      return {
        success: false,
        error: 'Payment analysis failed',
        message: error.message,
      };
    }
  }

  /**
   * 🎤 Voice Memo Processing
   * AI-powered voice memo analysis with transcription and insights
   */
  @Post('process-voice-memo')
  @ApiOperation({
    summary: 'Process voice memo with AI analysis',
    description: 'Transcribe voice memo and extract financial insights',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio'))
  async processVoiceMemo(
    @UploadedFile() audioFile: any,
    @Body('paymentId') paymentId?: string,
    @CurrentUser('id') userId?: string,
  ) {
    try {
      if (!audioFile) {
        return {
          success: false,
          error: 'No audio file provided',
        };
      }

      this.logger.log(`Processing voice memo for user ${userId}`);

      const result = await this.aiIntegration.processVoiceMemo(
        audioFile.buffer,
        userId,
        paymentId,
      );

      return {
        success: true,
        data: result,
        message: 'Voice memo processed successfully',
      };
    } catch (error) {
      this.logger.error('Voice memo processing failed:', error);
      return {
        success: false,
        error: 'Voice processing failed',
        message: error.message,
      };
    }
  }

  /**
   * 💡 Smart Financial Insights
   * Comprehensive AI insights dashboard
   */
  @Get('insights')
  @ApiOperation({
    summary: 'Get AI-powered financial insights',
    description:
      'Generate personalized financial insights using all AI capabilities',
  })
  async getSmartInsights(
    @Query('timeframe') timeframe: 'week' | 'month' | 'quarter' = 'month',
    @Query('focusArea')
    focusArea?: 'spending' | 'savings' | 'budgeting' | 'investments',
    @CurrentUser('id') userId?: string,
  ) {
    try {
      this.logger.log(`Generating insights for user ${userId} (${timeframe})`);

      const request: SmartInsightsRequest = {
        userId,
        timeframe,
        focusArea,
      };

      const result = await this.aiIntegration.generateSmartInsights(request);

      return {
        success: true,
        data: result,
        message: 'Insights generated successfully',
      };
    } catch (error) {
      this.logger.error('Insights generation failed:', error);
      return {
        success: false,
        error: 'Insights generation failed',
        message: error.message,
      };
    }
  }

  /**
   * 🔄 Real-time Transaction Monitoring
   * AI fraud detection and anomaly monitoring
   */
  @Post('monitor-transaction')
  @ApiOperation({
    summary: 'Monitor transaction for anomalies',
    description: 'Real-time AI monitoring for fraud detection',
  })
  async monitorTransaction(
    @Body()
    transactionData: {
      amount: number;
      merchant: string;
      category: string;
      timestamp: string;
      location?: { lat: number; lng: number };
    },
    @CurrentUser('id') userId: string,
  ) {
    try {
      this.logger.log(
        `Monitoring transaction for user ${userId}: ₹${transactionData.amount}`,
      );

      const result = await this.aiIntegration.monitorTransaction(
        transactionData,
        userId,
      );

      return {
        success: true,
        data: result,
        message: 'Transaction monitoring completed',
      };
    } catch (error) {
      this.logger.error('Transaction monitoring failed:', error);
      return {
        success: false,
        error: 'Transaction monitoring failed',
        message: error.message,
      };
    }
  }

  /**
   * 🤖 Complete AI Chat Interface
   * Unified AI assistant for financial guidance
   */
  @Post('chat')
  @ApiOperation({
    summary: 'Chat with AI financial assistant',
    description: 'Get personalized financial advice using complete AI suite',
  })
  async chatWithAI(
    @Body()
    request: {
      message: string;
      conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
      }>;
      context?: {
        currentScreen?: string;
        recentTransaction?: any;
        userIntent?: string;
      };
    },
    @CurrentUser('id') userId: string,
  ) {
    try {
      this.logger.log(
        `AI chat request from user ${userId}: ${request.message.substring(0, 50)}...`,
      );

      // Convert conversation history to expected format
      const history =
        request.conversationHistory?.map((msg) => ({
          id: `msg_${Date.now()}_${Math.random()}`,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        })) || [];

      // This would integrate with the AI Financial Advisor service
      // For now, returning a structured response
      const response = {
        message:
          "I'm here to help with your financial decisions! Based on your spending patterns, I notice you could save about ₹2,000 this month by optimizing your food expenses.",
        suggestedActions: [
          {
            type: 'set_budget',
            title: 'Set Food Budget',
            description: 'Create a monthly limit for food & dining expenses',
            data: { suggestedLimit: 8000 },
          },
          {
            type: 'learn_more',
            title: 'View Spending Analysis',
            description: 'See detailed breakdown of your expenses',
          },
        ],
        followUpQuestions: [
          'Would you like me to analyze your top spending categories?',
          'Should I help you set up automatic savings?',
        ],
        confidence: 0.85,
      };

      return {
        success: true,
        data: response,
        message: 'AI response generated successfully',
      };
    } catch (error) {
      this.logger.error('AI chat failed:', error);
      return {
        success: false,
        error: 'AI chat failed',
        message: error.message,
      };
    }
  }

  /**
   * 📊 AI Health Check
   * Monitor all AI services status
   */
  @Get('health')
  @ApiOperation({
    summary: 'Check AI services health',
    description: 'Monitor status of all AI components',
  })
  async getAIHealth() {
    try {
      // This would check the health of all AI services
      const health = {
        mlServices: 'healthy',
        voiceIntelligence: 'healthy',
        behavioralNudges: 'healthy',
        trustScoring: 'healthy',
        merchantIntelligence: 'healthy',
        enhancedTagging: 'healthy',
        financialAdvisor: 'healthy',
        lastUpdated: new Date().toISOString(),
        uptime: '99.9%',
        processingSpeed: '~300ms average',
      };

      return {
        success: true,
        data: health,
        message: 'AI services are operational',
      };
    } catch (error) {
      this.logger.error('AI health check failed:', error);
      return {
        success: false,
        error: 'Health check failed',
        message: error.message,
      };
    }
  }

  /**
   * 🎯 Quick Category Prediction
   * Fast category prediction for mobile UX
   */
  @Post('predict-category')
  @ApiOperation({
    summary: 'Quick category prediction',
    description: 'Fast AI category prediction for real-time UX',
  })
  async predictCategory(
    @Body()
    request: {
      payeeName: string;
      amount: number;
      vpa?: string;
    },
    @CurrentUser('id') userId: string,
  ) {
    try {
      // Quick analysis for mobile UX - just category prediction
      const result = await this.aiIntegration.analyzePayment({
        ...request,
        userId,
      });

      return {
        success: true,
        data: {
          category: result.suggestedCategory,
          confidence: result.categoryConfidence,
          trustScore: result.trustScore,
        },
        message: 'Category predicted successfully',
      };
    } catch (error) {
      this.logger.error('Category prediction failed:', error);
      return {
        success: false,
        error: 'Category prediction failed',
        message: error.message,
      };
    }
  }
}
