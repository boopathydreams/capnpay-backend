import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DecentroService } from './decentro.service';
import {
  // ValidateUpiDto, // Temporarily disabled - endpoint not available
  CreatePaymentCollectionDto,
  InitiatePayoutDto,
} from './dto';

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
    return this.decentroService.createPaymentCollection(dto);
  }

  @Post('payout')
  @ApiOperation({ summary: 'Initiate payout to recipient' })
  @ApiResponse({ status: 201, description: 'Payout initiated' })
  async initiatePayout(@Body() dto: InitiatePayoutDto) {
    // Generate unique reference ID if not provided
    if (!dto.reference_id || dto.reference_id.includes('TEST')) {
      dto.reference_id = `CAPN_PAYOUT_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }
    return this.decentroService.initiatePayout(dto);
  }

  @Get('transaction/:id/status')
  @ApiOperation({ summary: 'Get transaction status' })
  @ApiResponse({ status: 200, description: 'Transaction status retrieved' })
  async getTransactionStatus(@Param('id') transactionId: string) {
    return this.decentroService.getTransactionStatus(transactionId);
  }

  @Get('account/balance/:accountNumber')
  @ApiOperation({ summary: 'Get account balance' })
  @ApiResponse({ status: 200, description: 'Account balance retrieved' })
  async getAccountBalance(@Param('accountNumber') accountNumber: string) {
    return this.decentroService.getAccountBalance(accountNumber);
  }

  @Get('account/balance')
  @ApiOperation({ summary: 'Get default account balance' })
  @ApiResponse({
    status: 200,
    description: 'Default account balance retrieved',
  })
  async getDefaultAccountBalance() {
    return this.decentroService.getAccountBalance();
  }

  @Get('account/details/:consumerUrn')
  @ApiOperation({ summary: 'Get account details and linked accounts' })
  @ApiResponse({ status: 200, description: 'Account details retrieved' })
  async getAccountDetails(@Param('consumerUrn') consumerUrn: string) {
    return this.decentroService.getAccountDetails(consumerUrn);
  }

  @Get('account/details')
  @ApiOperation({ summary: 'Get default account details' })
  @ApiResponse({
    status: 200,
    description: 'Default account details retrieved',
  })
  async getDefaultAccountDetails() {
    return this.decentroService.getAccountDetails();
  }

  @Get('account/statement/:accountNumber')
  @ApiOperation({ summary: 'Get account statement with transaction history' })
  @ApiResponse({ status: 200, description: 'Account statement retrieved' })
  async getAccountStatement(
    @Param('accountNumber') accountNumber: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.decentroService.getAccountStatement(
      accountNumber,
      fromDate,
      toDate,
      limitNumber,
    );
  }

  @Get('account/statement')
  @ApiOperation({ summary: 'Get default account statement' })
  @ApiResponse({
    status: 200,
    description: 'Default account statement retrieved',
  })
  async getDefaultAccountStatement(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.decentroService.getAccountStatement(
      undefined,
      fromDate,
      toDate,
      limitNumber,
    );
  }

  @Get('settlement/accounts')
  @ApiOperation({ summary: 'Get settlement account details' })
  @ApiResponse({
    status: 200,
    description: 'Settlement account details retrieved',
  })
  async getSettlementAccountDetails(
    @Query('consumerUrn') consumerUrn?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 25;
    return this.decentroService.getSettlementAccountDetails(
      consumerUrn,
      pageNumber,
      limitNumber,
    );
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check for Decentro service' })
  async healthCheck() {
    try {
      const healthStatus = await this.decentroService.healthCheck();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        ...healthStatus,
        referenceId: this.decentroService.generateReferenceId('HEALTH'),
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
