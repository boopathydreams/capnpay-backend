import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BankingService, CreatePaymentRequest } from './banking.service';
import { CollectionStatus, PayoutStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Banking')
@Controller('banking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BankingController {
  private readonly logger = new Logger(BankingController.name);

  constructor(private readonly bankingService: BankingService) {}

  @Post('payments')
  @ApiOperation({
    summary: 'Create a banking-standard payment',
    description:
      'Creates a payment with proper sender/receiver relationships and audit trails',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment created successfully',
  })
  async createPayment(
    @CurrentUser() user: any,
    @Body()
    createPaymentDto: {
      receiverVpa: string;
      amount: number;
      purpose?: string;
      paymentType?: string;
      transferType?: string;
      categoryId?: string;
    },
  ) {
    const request: CreatePaymentRequest = {
      senderId: user.id,
      receiverVpa: createPaymentDto.receiverVpa,
      amount: createPaymentDto.amount,
      purpose: createPaymentDto.purpose,
      paymentType: createPaymentDto.paymentType as any,
      categoryId: createPaymentDto.categoryId,
    };

    return await this.bankingService.createPayment(request);
  }

  @Get('payments/:paymentId')
  @ApiOperation({
    summary: 'Get payment details with audit trail',
    description:
      'Returns comprehensive payment information including status history and audit logs',
  })
  async getPaymentDetails(@Param('paymentId') paymentId: string) {
    return await this.bankingService.getPaymentDetails(paymentId);
  }

  @Get('payments')
  @ApiOperation({
    summary: 'Get user payment history',
    description: "Returns user's sent and received payments",
  })
  async getUserPaymentHistory(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    return await this.bankingService.getUserPaymentHistory(
      user.id,
      limitNum,
      offsetNum,
      from,
      to,
    );
  }

  @Get('vpa/:vpaAddress/lookup')
  @ApiOperation({
    summary: 'Lookup VPA information',
    description: 'Returns VPA registry information for risk assessment',
  })
  async getVpaInfo(@Param('vpaAddress') vpaAddress: string) {
    return await this.bankingService.getVpaInfo(vpaAddress);
  }

  @Post('payments/:paymentId/collection-status')
  @ApiOperation({
    summary: 'Update collection status (Internal)',
    description:
      'Updates payment collection status - used by payment processors',
  })
  async updateCollectionStatus(
    @Param('paymentId') paymentId: string,
    @Body()
    updateDto: {
      collectionId?: string;
      status: string;
      txnNo?: string;
      refNo?: string;
    },
  ) {
    const statusUpper = updateDto.status?.toUpperCase();
    if (!statusUpper || !(statusUpper in CollectionStatus)) {
      throw new BadRequestException('Invalid collection status');
    }

    const status =
      CollectionStatus[statusUpper as keyof typeof CollectionStatus];

    return await this.bankingService.updateCollectionStatus(paymentId, status, {
      collectionId: updateDto.collectionId,
      txnNo: updateDto.txnNo,
      refNo: updateDto.refNo,
    });
  }

  @Get('payments/:paymentId/collection-status')
  @ApiOperation({
    summary: 'Get collection status',
    description: 'Returns current collection status for mobile polling',
  })
  async getCollectionStatus(@Param('paymentId') paymentId: string) {
    return await this.bankingService.getCollectionStatus(paymentId);
  }

  @Post('payments/:paymentId/payout-status')
  @ApiOperation({
    summary: 'Update payout status (Internal)',
    description: 'Updates payment payout status - used by payment processors',
  })
  async updatePayoutStatus(
    @Param('paymentId') paymentId: string,
    @Body()
    updateDto: {
      payoutId?: string;
      status: string;
      txnNo?: string;
      refNo?: string;
    },
  ) {
    const statusUpper = updateDto.status?.toUpperCase();
    if (!statusUpper || !(statusUpper in PayoutStatus)) {
      throw new BadRequestException('Invalid payout status');
    }

    const status = PayoutStatus[statusUpper as keyof typeof PayoutStatus];

    return await this.bankingService.updatePayoutStatus(paymentId, status, {
      payoutId: updateDto.payoutId,
      txnNo: updateDto.txnNo,
      refNo: updateDto.refNo,
    });
  }

  @Get('payments/:paymentId/payout-status')
  @ApiOperation({
    summary: 'Get payout status',
    description: 'Returns current payout status for mobile polling',
  })
  async getPayoutStatus(@Param('paymentId') paymentId: string) {
    return await this.bankingService.getPayoutStatus(paymentId);
  }

  @Get('payments/:paymentId/complete-status')
  @ApiOperation({
    summary: 'Get complete payment flow status',
    description:
      'Returns collection + payout status for webhook-disabled polling',
  })
  async getCompletePaymentStatus(@Param('paymentId') paymentId: string) {
    return await this.bankingService.getCompletePaymentStatus(paymentId);
  }
}
