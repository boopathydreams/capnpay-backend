import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AIFinancialAdvisorService } from '../services/ai-financial-advisor.service';

@ApiTags('AI Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly financialAdvisor: AIFinancialAdvisorService) {}

  @Post()
  @ApiOperation({
    summary: 'AI Financial Chat',
    description: 'Get personalized financial advice through AI chat',
  })
  @ApiResponse({ status: 200, description: 'AI response generated' })
  async chat(
    @Body()
    dto: {
      userId: string;
      message: string;
      conversationHistory?: any[];
    },
  ) {
    return await this.financialAdvisor.processFinancialQuery(
      dto.userId,
      dto.message,
      dto.conversationHistory || [],
    );
  }
}
