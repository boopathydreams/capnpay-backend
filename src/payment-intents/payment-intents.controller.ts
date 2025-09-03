import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';
import { PaymentIntentsService } from './payment-intents.service';
import {
  CreatePaymentIntentDto,
  CompletePaymentIntentDto,
  CreatePaymentIntentResponseDto,
  AnalyzePaymentDto,
  CompletePaymentIntentResponseDto,
} from './dto';
import { PaymentStatus } from '@prisma/client';

@ApiTags('Payment Intents')
@Controller('pay-intents')
@UseGuards(ThrottlerGuard)
export class PaymentIntentsController {
  constructor(private readonly paymentIntentsService: PaymentIntentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create payment intent',
    description:
      'Create a new payment intent with AI tagging and caps analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment intent created successfully',
    type: CreatePaymentIntentResponseDto,
  })
  async create(
    @Body() createPaymentIntentDto: CreatePaymentIntentDto,
  ): Promise<CreatePaymentIntentResponseDto> {
    // TODO: Get userId from authenticated user context
    const userId = 'temp-user-id'; // Replace with actual user from JWT

    return this.paymentIntentsService.create(userId, createPaymentIntentDto);
  }

  @Post(':trRef/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete payment intent',
    description:
      'Mark payment intent as completed with UPI transaction reference',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment completed successfully',
    type: CompletePaymentIntentResponseDto,
  })
  async complete(
    @Param('trRef') trRef: string,
    @Body() completePaymentIntentDto: CompletePaymentIntentDto,
  ): Promise<CompletePaymentIntentResponseDto> {
    return this.paymentIntentsService.complete(trRef, completePaymentIntentDto);
  }

  @Post(':trRef/tag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tag payment intent',
    description: 'Add or update tag for payment intent',
  })
  async tagPayment(
    @Param('trRef') trRef: string,
    @Body()
    tagDto: {
      categoryId: string;
      tagText: string;
      source?: 'auto' | 'manual';
    },
  ): Promise<{ ok: boolean }> {
    await this.paymentIntentsService.createTag(
      trRef,
      tagDto.categoryId,
      tagDto.tagText,
      tagDto.source || 'manual',
    );
    return { ok: true };
  }

  @Get(':trRef')
  @ApiOperation({
    summary: 'Get payment intent',
    description: 'Retrieve payment intent details by transaction reference',
  })
  async findByTrRef(@Param('trRef') trRef: string) {
    return this.paymentIntentsService.findByTrRef(trRef);
  }

  @Get('user/history')
  @ApiOperation({
    summary: 'Get user payment history',
    description: 'Retrieve paginated payment history for user',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: PaymentStatus })
  async getUserHistory(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: PaymentStatus,
  ) {
    // TODO: Get userId from authenticated user context
    const userId = 'temp-user-id'; // Replace with actual user from JWT

    return this.paymentIntentsService.getUserPaymentHistory(userId, {
      limit,
      offset,
      categoryId,
      status,
    });
  }

  @Post('escrow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create escrow payment intent',
    description: 'Create secure escrow payment: user pays us, we pay recipient',
  })
  @ApiResponse({
    status: 200,
    description: 'Escrow payment intent created with collection link',
    type: Object,
  })
  async createEscrow(
    @Body()
    escrowDto: {
      amount: number;
      recipientVpa: string;
      recipientName?: string;
      category?: string;
      note?: string;
    },
  ) {
    // TODO: Get userId from authenticated user context
    const userId = 'temp-user-id'; // Replace with actual user from JWT

    return this.paymentIntentsService.createEscrowPayment(userId, escrowDto);
  }

  @Get(':referenceId/status')
  @ApiOperation({
    summary: 'Get escrow payment status',
    description: 'Check real-time status of escrow payment flow',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment status with current stage',
  })
  async getEscrowStatus(@Param('referenceId') referenceId: string) {
    return this.paymentIntentsService.getEscrowPaymentStatus(referenceId);
  }

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze payment in real-time',
    description:
      'Get AI analysis, suggested tags, and contextual nudges for a payment',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment analysis with AI insights',
    type: Object,
  })
  @HttpCode(HttpStatus.OK)
  async analyzePayment(@Body() dto: AnalyzePaymentDto) {
    // TODO: Get userId from authenticated user context
    const userId = 'temp-user-id'; // Replace with actual user from JWT

    return this.paymentIntentsService.analyzePayment(
      userId,
      dto.amount,
      dto.vpa,
      dto.payeeName,
    );
  }
}
