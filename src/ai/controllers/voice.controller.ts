import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VoiceIntelligenceService } from '../services/voice-intelligence.service';

@ApiTags('Voice Intelligence')
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceIntelligence: VoiceIntelligenceService) {}

  @Post('process')
  @ApiOperation({
    summary: 'Process voice memo with AI insights',
    description:
      'Convert speech to text and analyze emotional spending patterns',
  })
  @ApiResponse({
    status: 200,
    description: 'Voice memo processed successfully',
  })
  async processVoiceMemo(
    @Body()
    dto: {
      userId: string;
      audioBuffer: Buffer;
      paymentIntentId?: string;
      timestamp: Date;
      duration: number;
    },
  ) {
    return await this.voiceIntelligence.processVoiceMemo(
      dto.audioBuffer,
      'audio/wav',
      dto.userId,
      {
        paymentIntentId: dto.paymentIntentId,
        timestamp: dto.timestamp,
        duration: dto.duration,
      },
    );
  }

  @Post('transcribe')
  @ApiOperation({
    summary: 'Transcribe audio to text',
    description: 'Simple speech-to-text conversion',
  })
  @ApiResponse({ status: 200, description: 'Audio transcribed successfully' })
  async transcribeAudio(
    @Body()
    dto: {
      audioBuffer: Buffer;
      language?: string;
      format?: string;
    },
  ) {
    // Simple transcription without full processing
    const result = await this.voiceIntelligence.processVoiceMemo(
      dto.audioBuffer,
      dto.format || 'audio/wav',
      'temp',
    );

    return {
      transcript: result.transcript,
      confidence: result.confidence,
      language: result.language,
    };
  }
}
