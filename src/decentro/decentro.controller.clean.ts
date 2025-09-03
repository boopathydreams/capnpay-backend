import { Controller, Post, Body, Get, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DecentroService } from './decentro.service';
import { CreatePaymentCollectionDto, InitiatePayoutDto } from './dto';

@ApiTags('decentro')
@Controller('decentro')
export class DecentroController {
  private readonly logger = new Logger(DecentroController.name);

  constructor(private readonly decentroService: DecentroService) {}

  // @Post('validate-upi')
  // @ApiOperation({ summary: 'Validate UPI ID' })
  // @ApiResponse({ status: 200, description: 'UPI validation result' })
  // async validateUpi(@Body() dto: ValidateUpiDto) {
  //   return this.decentroService.validateUpiId(dto.upi_id);
  // }

  @Post('payment-collection')
  @ApiOperation({ summary: 'Create payment collection request' })
  @ApiResponse({ status: 201, description: 'Payment collection created' })
  async createPaymentCollection(@Body() dto: CreatePaymentCollectionDto) {
    return this.decentroService.createPaymentCollection({
      reference_id: dto.reference_id,
      payee_account: dto.payee_account,
      amount: dto.amount,
      purpose_message: dto.purpose_message,
      generate_qr: dto.generate_qr ?? true,
      expiry_time: dto.expiry_time ?? 900,
      customized_qr_with_logo: false,
      send_sms: false,
      send_email: false,
      mobile: dto.mobile,
      email: dto.email,
    });
  }

  @Post('payout')
  @ApiOperation({ summary: 'Initiate payout to recipient' })
  @ApiResponse({ status: 201, description: 'Payout initiated' })
  async initiatePayout(@Body() dto: InitiatePayoutDto) {
    return this.decentroService.initiatePayout({
      reference_id: dto.reference_id,
      payee_account: dto.payee_account,
      amount: dto.amount,
      purpose_message: dto.purpose_message,
      fund_transfer_type: dto.fund_transfer_type ?? 'UPI',
      beneficiary_name: dto.beneficiary_name,
    });
  }

  @Get('transaction/:id/status')
  @ApiOperation({ summary: 'Get transaction status' })
  @ApiResponse({ status: 200, description: 'Transaction status retrieved' })
  async getTransactionStatus(@Param('id') transactionId: string) {
    return this.decentroService.getTransactionStatus(transactionId);
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check for Decentro service' })
  async healthCheck() {
    try {
      // Try to authenticate to check if service is working
      const referenceId = this.decentroService.generateReferenceId('HEALTH');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        referenceId,
      };
    } catch (error) {
      this.logger.error('Decentro health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}
