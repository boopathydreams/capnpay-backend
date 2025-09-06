import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentReceiptService } from './payment-receipt.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payment Receipts')
@Controller('payment-receipts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentReceiptController {
  constructor(private readonly paymentReceiptService: PaymentReceiptService) {}

  @Get('payment/:paymentId')
  @ApiOperation({
    summary: 'Get receipt for a specific payment',
    description:
      'Returns detailed receipt information for a payment transaction',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment receipt retrieved successfully',
  })
  async getPaymentReceipt(@Param('paymentId') paymentId: string) {
    return await this.paymentReceiptService.getReceiptByPaymentId(paymentId);
  }

  @Get('generate/:paymentId')
  @ApiOperation({
    summary: 'Generate receipt for a payment',
    description: 'Creates a detailed receipt for a completed payment',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment receipt generated successfully',
  })
  async generatePaymentReceipt(@Param('paymentId') paymentId: string) {
    return await this.paymentReceiptService.generateReceipt(paymentId);
  }

  @Get('user')
  @ApiOperation({
    summary: 'Get all receipts for the current user',
    description:
      'Returns a list of all payment receipts for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'User receipts retrieved successfully',
  })
  async getUserReceipts(@CurrentUser() user: any) {
    return await this.paymentReceiptService.getUserReceipts(user.id);
  }
}
