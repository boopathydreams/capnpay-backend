import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MemosService } from './memos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Memos')
@Controller('memos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MemosController {
  constructor(private readonly memosService: MemosService) {}

  @Post('text')
  @ApiOperation({
    summary: 'Create a text memo for a payment',
    description: 'Creates an encrypted text note for a payment transaction',
  })
  @ApiResponse({
    status: 201,
    description: 'Text memo created successfully',
  })
  async createTextMemo(
    @Body()
    createTextMemoDto: {
      paymentIntentId: string;
      text: string;
      language?: string;
    },
  ) {
    return await this.memosService.createTextMemo(
      createTextMemoDto.paymentIntentId,
      createTextMemoDto.text,
      createTextMemoDto.language,
    );
  }

  @Post('voice')
  @ApiOperation({
    summary: 'Create a voice memo for a payment',
    description:
      'Creates a voice memo with optional transcript for a payment transaction',
  })
  @ApiResponse({
    status: 201,
    description: 'Voice memo created successfully',
  })
  async createVoiceMemo(
    @Body()
    createVoiceMemoDto: {
      paymentIntentId: string;
      objectKey: string;
      durationMs: number;
      transcript?: string;
      transcriptConfidence?: number;
      language?: string;
    },
  ) {
    return await this.memosService.createVoiceMemo(
      createVoiceMemoDto.paymentIntentId,
      createVoiceMemoDto.objectKey,
      createVoiceMemoDto.durationMs,
      createVoiceMemoDto.transcript,
      createVoiceMemoDto.transcriptConfidence,
      createVoiceMemoDto.language,
    );
  }

  @Post('voice/:memoId/transcript')
  @ApiOperation({
    summary: 'Update voice memo with transcript',
    description: 'Adds or updates the transcript for a voice memo',
  })
  @ApiResponse({
    status: 200,
    description: 'Voice memo transcript updated successfully',
  })
  async updateVoiceTranscript(
    @Param('memoId') memoId: string,
    @Body()
    updateTranscriptDto: {
      transcript: string;
      confidence: number;
    },
  ) {
    return await this.memosService.updateVoiceMemoTranscript(
      memoId,
      updateTranscriptDto.transcript,
      updateTranscriptDto.confidence,
    );
  }

  @Get('payment/:paymentId')
  @ApiOperation({
    summary: 'Get all memos for a payment',
    description: 'Returns all text and voice memos for a specific payment',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment memos retrieved successfully',
  })
  async getPaymentMemos(@Param('paymentId') paymentId: string) {
    return await this.memosService.getPaymentMemos(paymentId);
  }

  @Get('recent')
  @ApiOperation({
    summary: 'Get recent memos for the user',
    description: 'Returns recent memos across all payments for the user',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent memos retrieved successfully',
  })
  async getUserRecentMemos(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return await this.memosService.getUserRecentMemos(user.id, limitNum);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search memos by content',
    description: 'Search through memo transcripts and text content',
  })
  @ApiResponse({
    status: 200,
    description: 'Memo search results retrieved successfully',
  })
  async searchMemos(
    @CurrentUser() user: any,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.memosService.searchMemos(user.id, query, limitNum);
  }

  @Delete(':memoId')
  @ApiOperation({
    summary: 'Delete a memo',
    description: 'Permanently deletes a memo and its attachments',
  })
  @ApiResponse({
    status: 200,
    description: 'Memo deleted successfully',
  })
  async deleteMemo(@Param('memoId') memoId: string) {
    return await this.memosService.deleteMemo(memoId);
  }
}
