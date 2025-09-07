import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface UpiValidationResponse {
  decentroTxnId: string;
  status: string;
  responseCode: string;
  message: string;
  data: {
    upiId: string;
    name: string;
    isValidUpi: boolean;
  };
}

export interface PaymentCollectionRequest {
  reference_id: string;
  payee_account: string;
  amount: number;
  purpose_message: string;
  generate_qr: boolean;
  expiry_time: number;
  customized_qr_with_logo: boolean;
  send_sms: boolean;
  send_email: boolean;
  mobile?: string;
  email?: string;
}

export interface PaymentCollectionResponse {
  decentroTxnId: string;
  status: string;
  responseCode: string;
  message: string;
  data: {
    generatedLink: string;
    encodedDynamicQrCode: string;
    upiDeepLinkUrl: string;
    transactionId: string;
    platformTransactionRefId: string;
  };
}

export interface PayoutRequest {
  reference_id: string;
  payee_account: string;
  amount: number;
  purpose_message: string;
  fund_transfer_type: 'UPI' | 'IMPS' | 'NEFT';
  beneficiary_name?: string;
}

export interface PayoutResponse {
  decentroTxnId: string;
  status: string;
  responseCode: string;
  message: string;
  data: {
    transactionId: string;
    platformTransactionRefId: string;
    transactionStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN';
  };
}

@Injectable()
export class DecentroService {
  private readonly logger = new Logger(DecentroService.name);
  private readonly mockMode: boolean;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.mockMode =
      this.configService.get<string>('DECENTRO_MOCK_ENABLED', 'false') ===
      'true';
  }

  private get paymentsBaseUrl(): string {
    return this.configService.getOrThrow<string>('DECENTRO_PAYMENTS_BASE_URL');
  }

  private get coreBankingBaseUrl(): string {
    return this.configService.getOrThrow<string>(
      'DECENTRO_CORE_BANKING_BASE_URL',
    );
  }

  private get clientId(): string {
    return this.configService.getOrThrow<string>('DECENTRO_CLIENT_ID');
  }

  private get clientSecret(): string {
    return this.configService.getOrThrow<string>('DECENTRO_CLIENT_SECRET');
  }

  private get isDevEnvironment(): boolean {
    return (
      this.configService.get<string>('NODE_ENV', 'development') ===
      'development'
    );
  }

  /**
   * Interprets transaction status considering environment-specific rules
   * In dev: 'pending' for payouts is treated as success
   * In prod: only actual success statuses are considered success
   */
  private interpretTransactionStatus(
    apiResponse: any,
    type: 'collection' | 'payout',
  ): {
    isApiSuccess: boolean;
    actualTransactionStatus: string;
    isTransactionSuccess: boolean;
    statusDescription: string;
  } {
    const isApiSuccess =
      apiResponse.api_status === 'SUCCESS' ||
      apiResponse.api_status === 'success';
    const actualTransactionStatus =
      apiResponse.data?.transaction_description?.transaction_status ||
      apiResponse.data?.transaction_status ||
      'unknown';

    let isTransactionSuccess = false;
    let statusDescription = `Transaction status: ${actualTransactionStatus}`;

    if (!isApiSuccess) {
      isTransactionSuccess = false;
      statusDescription = `API call failed: ${apiResponse.message || 'Unknown error'}`;
    } else if (
      actualTransactionStatus === 'success' ||
      actualTransactionStatus === 'SUCCESS'
    ) {
      isTransactionSuccess = true;
      statusDescription = 'Transaction completed successfully';
    } else if (actualTransactionStatus.toLowerCase() === 'pending') {
      if (type === 'payout' && this.isDevEnvironment) {
        // In dev, payout pending is treated as success
        isTransactionSuccess = true;
        statusDescription =
          'Payout pending (treated as success in dev environment)';
      } else if (type === 'collection') {
        // Collections can be pending and still valid
        isTransactionSuccess = true;
        statusDescription = 'Collection pending (valid state)';
      } else {
        // Production payout pending - wait for actual completion
        isTransactionSuccess = false;
        statusDescription =
          'Payout pending (waiting for completion in production)';
      }
    } else if (
      actualTransactionStatus === 'failed' ||
      actualTransactionStatus === 'failure'
    ) {
      isTransactionSuccess = false;
      statusDescription = 'Transaction failed';
    } else {
      isTransactionSuccess = false;
      statusDescription = `Unknown transaction status: ${actualTransactionStatus}`;
    }

    return {
      isApiSuccess,
      actualTransactionStatus,
      isTransactionSuccess,
      statusDescription,
    };
  }

  private get coreBankingClientId(): string {
    return this.configService.getOrThrow<string>(
      'COREBANKING_DECENTRO_CLIENT_ID',
    );
  }

  private get coreBankingClientSecret(): string {
    return this.configService.getOrThrow<string>(
      'COREBANKING_DECENTRO_CLIENT_SECRET',
    );
  }

  private get paymentsModuleSecret(): string {
    return this.configService.getOrThrow<string>(
      'DECENTRO_PAYMENTS_MODULE_SECRET',
    );
  }

  private get coreBankingModuleSecret(): string {
    return this.configService.getOrThrow<string>(
      'DECENTRO_CORE_BANKING_MODULE_SECRET',
    );
  }

  private get consumerUrn(): string {
    return this.configService.getOrThrow<string>('DECENTRO_CONSUMER_URN');
  }

  private get providerSecret(): string {
    return this.configService.getOrThrow<string>('DECENTRO_PROVIDER_SECRET');
  }

  /**
   * Generate JWT token for API authentication
   */
  private async authenticate(): Promise<string> {
    try {
      // Check if we have a valid token
      if (
        this.accessToken &&
        this.tokenExpiry &&
        new Date() < this.tokenExpiry
      ) {
        return this.accessToken;
      }

      // Generate JWT token
      const response = await firstValueFrom(
        this.httpService.post(`${this.paymentsBaseUrl}/v2/auth/token`, {
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      );

      const authData = response.data;

      this.accessToken = authData.access_token;
      this.tokenExpiry = new Date(
        Date.now() + (authData.expires_in || 900) * 1000 - 60000,
      ); // Default 15 min with 60s buffer

      this.logger.log('Successfully authenticated with Decentro');
      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to authenticate with Decentro:', error);
      throw new Error('Decentro authentication failed');
    }
  }

  /**
   * Get headers for API requests - supports both JWT and client credentials
   */
  private async getHeaders(
    module: 'payments' | 'core_banking' = 'payments',
  ): Promise<Record<string, string>> {
    if (this.mockMode) {
      return { 'Content-Type': 'application/json' };
    }

    // Core Banking API requires client credentials headers
    if (module === 'core_banking') {
      const moduleSecret = this.coreBankingModuleSecret;

      return {
        'Content-Type': 'application/json',
        client_id: this.coreBankingClientId,
        client_secret: this.coreBankingClientSecret,
        module_secret: moduleSecret,
        provider_secret: this.providerSecret,
      };
    }

    // Payments API can use JWT authentication
    try {
      const token = await this.authenticate();
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
    } catch {
      // Fallback to client credentials headers for payments
      this.logger.warn(
        `JWT auth failed, using client credentials headers for ${module} module`,
      );
      const moduleSecret = this.paymentsModuleSecret;

      return {
        'Content-Type': 'application/json',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        module_secret: moduleSecret,
        provider_secret: this.providerSecret,
      };
    }
  }

  // /**
  //  * Validate UPI ID - Currently disabled due to endpoint not available
  //  */
  // async validateUpiId(upiId: string): Promise<UpiValidationResponse> {
  //   try {
  //     const response = await firstValueFrom(
  //       this.httpService.post(
  //         `${this.baseUrl}/v3/payments/upi/validation`,
  //         {
  //           upi_id: upiId,
  //         },
  //         {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             client_id: this.clientId,
  //             client_secret: this.clientSecret,
  //             module_secret: this.paymentsModuleSecret,
  //             provider_secret: this.providerSecret,
  //           },
  //         },
  //       ),
  //     );

  //     this.logger.log(
  //       `UPI validation result for ${upiId}: ${response.data.data.isValidUpi}`,
  //     );
  //     return response.data;
  //   } catch (error) {
  //     this.logger.error(`Failed to validate UPI ID ${upiId}:`, error);
  //     throw error;
  //   }
  // }

  /**
   * Create payment collection (request money from user to escrow)
   * Uses Decentro UPI Payment Link API
   */
  async createPaymentCollection(dto: {
    reference_id: string;
    payee_account: string;
    amount: number;
    purpose_message: string;
    generate_qr?: boolean;
    expiry_time?: number;
    customized_qr_with_logo?: boolean;
    send_sms?: boolean;
    send_email?: boolean;
    mobile?: string;
    email?: string;
  }): Promise<any> {
    if (this.mockMode) {
      // Mock response based on staging test data amounts
      const mockStatus =
        dto.amount === 10
          ? 'success'
          : dto.amount === 20
            ? 'pending'
            : dto.amount === 30
              ? 'failure'
              : 'pending';

      return {
        decentro_txn_id: `dcnt_${Date.now()}`,
        api_status: 'success',
        message: 'Collection request created successfully',
        response_key: 'success_transaction_request_initiated',
        data: {
          reference_id: dto.reference_id,
          payment_link: `https://staging.decentro.tech/pay/${dto.reference_id}`,
          qr_code_url: `https://staging.api.decentro.tech/qr/${dto.reference_id}`,
          transaction_status: mockStatus,
          amount_requested: dto.amount,
          expiry_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
        },
      };
    }

    // Real API call to Decentro UPI Payment Link endpoint
    const payload = {
      reference_id: dto.reference_id,
      // payee_account: dto.payee_account.replace(/[#$%^&*!;:'"~`?=+)(]/g, ''), // Sanitize UPI ID
      consumer_urn: this.consumerUrn, // Our registered URN with Decentro
      purpose_message:
        dto.purpose_message || `Payment collection`.substring(0, 35), // Max 35 chars
      // generate_qr: dto.generate_qr !== false ? 1 : 0,
      // share_s2s: 0,
      // send_email: dto.send_email !== false && dto.email ? 1 : 0,
      // send_sms: dto.send_sms !== false && dto.mobile ? 1 : 0,
      // customized_qr_with_logo: dto.customized_qr_with_logo !== false ? 1 : 0,
      // Per v3, expiry_time is in minutes
      expiry_time: dto.expiry_time ?? 15,
      amount: dto.amount,
      generate_psp_uri: true,
      // customer_details: {
      //   customer_name: 'Customer', // Default name since not provided in DTO
      //   // Preserve valid email characters; just trim whitespace
      //   customer_email: dto.email ? dto.email.trim() : '',
      //   customer_mobile: dto.mobile ? dto.mobile.replace(/[^0-9]/g, '') : '',
      // },
    };

    console.log('=== COLLECTION DEBUG START ===');
    console.log(payload);
    console.log('=== COLLECTION DEBUG END ===');
    const headers = await this.getHeaders('payments');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.paymentsBaseUrl}/v3/payments/upi/link`,
          payload,
          {
            headers,
          },
        ),
      );

      this.logger.log(
        `Payment collection created: ${response.data.decentro_txn_id}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error('Payment collection failed:', error.response?.data);
      throw new Error(
        `Payment collection failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Initiate payout (send money from escrow to recipient)
   * Uses Decentro Initiate Payout API
   */
  async initiatePayout(dto: {
    reference_id: string;
    payee_account: string;
    amount: number;
    purpose_message: string;
    fund_transfer_type?: string;
    beneficiary_name?: string;
  }): Promise<any> {
    if (this.mockMode) {
      // Mock response based on staging test data amounts
      const mockStatus =
        dto.amount === 10
          ? 'success'
          : dto.amount === 20
            ? 'pending'
            : dto.amount === 30
              ? 'failure'
              : 'pending';

      return {
        decentro_txn_id: `dcnt_payout_${Date.now()}`,
        api_status: 'success',
        message: 'Payout request initiated successfully',
        response_key: 'success_transaction_request_initiated',
        data: {
          reference_id: dto.reference_id,
          transaction_status: mockStatus,
          transfer_type: 'UPI',
          bank_reference_number:
            mockStatus === 'success' ? `UTR${Date.now()}` : null,
          beneficiary_name:
            mockStatus === 'success' ? dto.beneficiary_name : null,
          transaction_status_description:
            mockStatus === 'success'
              ? 'Transaction completed successfully'
              : mockStatus === 'failure'
                ? 'Transaction failed'
                : 'Transaction is being processed',
        },
      };
    }

    // Real API call to Decentro Initiate Payout endpoint
    const payload = {
      reference_id: dto.reference_id,
      purpose_message: (dto.purpose_message || 'Payout')
        .replace(/[.@#$%^&*!;:'"~`?=+)(]/g, '') // Remove problematic special characters
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim() // Remove leading/trailing spaces
        .substring(0, 35), // Max 35 chars
      //   consumer_urn: 'AABDA545910E494A955665CF450EAD3A',
      from_account: '462515900201897530', // Our registered escrow account name with Decentro
      transfer_type: 'UPI',
      transfer_amount: dto.amount,
      beneficiary_details: {
        to_upi: dto.payee_account, // Keep UPI ID as-is, Decentro allows @ and . in UPI IDs
        payee_name: 'Boopathy N R',
      },
    };

    const headers = await this.getHeaders('core_banking');

    this.logger.debug('=== PAYOUT DEBUG START ===');
    console.log(
      'URL:',
      `${this.coreBankingBaseUrl}/v3/core_banking/money_transfer/initiate`,
    );
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('Headers:', { ...headers, client_secret: '[REDACTED]' });
    this.logger.debug('=== PAYOUT DEBUG END ===');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.coreBankingBaseUrl}/v3/core_banking/money_transfer/initiate`,
          payload,
          { headers },
        ),
      );

      this.logger.log(`Payout initiated: ${response.data.decentro_txn_id}`);
      return response.data;
    } catch (error) {
      console.log('=== PAYOUT ERROR DETAILS ===');
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
      console.log('=== ERROR END ===');

      this.logger.error('Payout initiation failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      throw new Error(
        `Payout failed: ${error.response?.data?.message || error.response?.data?.response_key || error.message}`,
      );
    }
  }

  /**
   * Check transaction status
   * Uses different endpoints for collections vs payouts
   */
  async getTransactionStatus(
    transactionId: string,
    type: 'collection' | 'payout' = 'collection',
  ): Promise<any> {
    console.log('🔍 DEBUG: getTransactionStatus called with:', {
      transactionId,
      type,
      typeTypeOf: typeof type,
      originalArgs: [transactionId, type],
    });

    if (this.mockMode) {
      return {
        decentro_txn_id: transactionId,
        api_status: 'success',
        message: 'Transaction status retrieved',
        data: {
          transaction_status: 'success',
          bank_reference_number: `UTR${Date.now()}`,
          transaction_status_description: 'Transaction completed successfully',
        },
      };
    }

    try {
      let url: string;
      let headers: any;

      if (type === 'payout') {
        // For payouts, use core_banking API
        url = `${this.coreBankingBaseUrl}/v3/core_banking/money_transfer/get_status?decentro_txn_id=${transactionId}`;
        headers = await this.getHeaders('core_banking');
      } else {
        // For collections, use payments API with client credentials headers
        url = `${this.paymentsBaseUrl}/v3/payments/transaction/advance/status?decentro_txn_id=${transactionId}`;
        headers = {
          'Content-Type': 'application/json',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        };
      }

      this.logger.debug('=== TRANSACTION STATUS DEBUG START ===');
      console.log('Type:', type);
      console.log('URL:', url);
      console.log('Headers:', { ...headers, client_secret: '[REDACTED]' });
      console.log('Transaction ID:', transactionId);
      this.logger.debug('=== TRANSACTION STATUS DEBUG END ===');

      const response = await firstValueFrom(
        this.httpService.get(url, { headers }),
      );

      this.logger.log(
        `Transaction status for ${transactionId}: ${
          response.data.data?.transaction_description?.transaction_status ||
          response.data.data?.transaction_status ||
          response.data.status ||
          'undefined'
        }`,
      );

      // Enhanced logging for debugging
      console.log('Full API Response:', JSON.stringify(response.data, null, 2));

      // Interpret the transaction status using our helper
      const statusInterpretation = this.interpretTransactionStatus(
        response.data,
        type,
      );

      console.log('🔍 Transaction Status Interpretation:', {
        transactionId,
        type,
        isApiSuccess: statusInterpretation.isApiSuccess,
        actualTransactionStatus: statusInterpretation.actualTransactionStatus,
        isTransactionSuccess: statusInterpretation.isTransactionSuccess,
        statusDescription: statusInterpretation.statusDescription,
        environment: this.isDevEnvironment ? 'development' : 'production',
      });

      // Return enhanced response with interpretation
      return {
        ...response.data,
        statusInterpretation,
      };
    } catch (error) {
      console.log('=== TRANSACTION STATUS ERROR DETAILS ===');
      console.log('Type:', type);
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
      console.log('=== ERROR END ===');

      this.logger.error(
        `Failed to get transaction status for ${transactionId}:`,
        error.response?.data,
      );
      throw new Error(
        `Get transaction status failed: ${error.response?.data?.message || error.response?.statusText || error.message}`,
      );
    }
  }

  /**
   * Generate unique reference ID
   */
  generateReferenceId(prefix = 'CAPN'): string {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Build UPI deep link from collection response
   */
  buildUpiDeepLink(collectionResponse: any): string {
    return (
      collectionResponse.data?.upi_deep_link_url ||
      collectionResponse.data?.payment_link ||
      collectionResponse.data?.generatedLink
    );
  }

  /**
   * Get account balance for virtual account
   * Uses Decentro Get Balance API
   */
  async getAccountBalance(accountNumber?: string): Promise<any> {
    if (this.mockMode) {
      return {
        decentro_txn_id: `bal_${Date.now()}`,
        api_status: 'success',
        message: 'Account balance retrieved successfully',
        data: {
          account_number: accountNumber || '462515900201897530',
          balance: 15000.5,
          currency: 'INR',
          account_status: 'ACTIVE',
          last_updated: new Date().toISOString(),
        },
      };
    }

    const account = accountNumber || '462515900201897530';
    const headers = await this.getHeaders('core_banking');

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.coreBankingBaseUrl}/v2/banking/account/${account}/balance`,
          { headers },
        ),
      );

      this.logger.log(`Account balance retrieved for ${account}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get account balance:', error.response?.data);
      throw new Error(
        `Get account balance failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Get account details
   * Uses Decentro Account Details API
   */
  async getAccountDetails(consumerUrn?: string): Promise<any> {
    if (this.mockMode) {
      return {
        decentro_txn_id: `acc_${Date.now()}`,
        api_status: 'success',
        message: 'Account details retrieved successfully',
        data: {
          consumer_urn: consumerUrn || 'AABDA545910E494A955665CF450EAD3A',
          accounts: [
            {
              account_number: '462515900201897530',
              account_type: 'VIRTUAL',
              balance: 15000.5,
              currency: 'INR',
              status: 'ACTIVE',
              linked_upi: ['testuser@okaxis'],
              qr_code_url:
                'https://staging.decentro.tech/qr/462515900201897530',
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
        },
      };
    }

    const headers = await this.getHeaders('core_banking');
    const urn = consumerUrn || this.consumerUrn;

    this.logger.debug('=== ACCOUNT DETAILS DEBUG START ===');
    console.log(
      'URL:',
      `${this.coreBankingBaseUrl}/core_banking/account_information/fetch_details`,
    );
    console.log('Headers:', { ...headers, client_secret: '[REDACTED]' });
    console.log('Consumer URN:', urn);
    this.logger.debug('=== ACCOUNT DETAILS DEBUG END ===');

    try {
      // Based on documentation, this should be a POST request
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.coreBankingBaseUrl}/core_banking/account_information/fetch_details?account_number=462515900201897530&type=virtual`,
          { headers },
        ),
      );

      this.logger.log('Account details retrieved successfully');
      return response.data;
    } catch (error) {
      console.log('=== ACCOUNT DETAILS ERROR DETAILS ===');
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
      console.log('=== ERROR END ===');

      this.logger.error('Failed to get account details:', error.response?.data);
      throw new Error(
        `Get account details failed: ${error.response?.data?.message || error.response?.statusText || error.message}`,
      );
    }
  }

  /**
   * Get account statement with transaction history
   * Uses Decentro Get Statement API
   */
  async getAccountStatement(
    accountNumber?: string,
    fromDate?: string,
    toDate?: string,
    limit: number = 10,
  ): Promise<any> {
    if (this.mockMode) {
      return {
        decentro_txn_id: `stmt_${Date.now()}`,
        api_status: 'success',
        message: 'Account statement retrieved successfully',
        data: {
          account_number: accountNumber || '462515900201897530',
          statement_period: {
            from: fromDate || '2024-01-01',
            to: toDate || new Date().toISOString().split('T')[0],
          },
          transactions: [
            {
              transaction_id: 'txn_001',
              date: '2024-01-15T10:30:00Z',
              description: 'UPI Payment',
              debit_amount: 500.0,
              credit_amount: 0.0,
              balance: 14500.5,
              transaction_type: 'DEBIT',
              utr: 'UTR12345678',
            },
            {
              transaction_id: 'txn_002',
              date: '2024-01-14T15:45:00Z',
              description: 'Fund Transfer',
              debit_amount: 0.0,
              credit_amount: 1000.0,
              balance: 15000.5,
              transaction_type: 'CREDIT',
              utr: 'UTR87654321',
            },
          ],
          total_records: 2,
          page_info: {
            current_page: 1,
            records_per_page: limit,
            has_more: false,
          },
        },
      };
    }

    const headers = await this.getHeaders('core_banking');
    const account = accountNumber || '462515900201897530';

    // Default date range: last 30 days if not provided
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const from = fromDate || thirtyDaysAgo.toISOString().split('T')[0];
    const to = toDate || today.toISOString().split('T')[0];

    this.logger.debug('=== ACCOUNT STATEMENT DEBUG START ===');
    console.log(
      'URL:',
      `${this.coreBankingBaseUrl}/core_banking/money_transfer/get_statement`,
    );
    console.log('Headers:', { ...headers, client_secret: '[REDACTED]' });
    console.log('Account:', account);
    console.log('Date Range:', { from, to, limit });
    this.logger.debug('=== ACCOUNT STATEMENT DEBUG END ===');

    try {
      const params = new URLSearchParams({
        account_number: account,
        from: from,
        to: to,
        mobile_number: '9994678569', // Optional, can be left blank
      });
      this.logger.log(`Date for ${from} to ${to}`);
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.coreBankingBaseUrl}/core_banking/money_transfer/get_statement?${params.toString()}`,
          { headers },
        ),
      );

      this.logger.log(`Account statement retrieved for ${account}`);
      return response.data;
    } catch (error) {
      console.log('=== ACCOUNT STATEMENT ERROR DETAILS ===');
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
      console.log('=== ERROR END ===');

      this.logger.error(
        'Failed to get account statement:',
        error.response?.data,
      );
      throw new Error(
        `Get account statement failed: ${error.response?.data?.message || error.response?.statusText || error.message}`,
      );
    }
  }

  /**
   * Get settlement account details to find where collections are being settled
   * Uses Decentro Get Settlement Account Details API
   */
  async getSettlementAccountDetails(
    consumerUrn?: string,
    page: number = 1,
    limit: number = 25,
  ): Promise<any> {
    if (this.mockMode) {
      return {
        decentro_txn_id: `settlement_${Date.now()}`,
        api_status: 'SUCCESS',
        message: 'Settlement Account Details fetched successfully',
        data: {
          consumer_urn: consumerUrn || this.consumerUrn,
          page: 1,
          total_pages: 1,
          total_records: 2,
          limit: 25,
          page_size: 2,
          settlement_account_details: [
            {
              settlement_account_urn: 'MOCK_SETTLEMENT_URN_1',
              name: 'Collection Settlement Account',
              settlement_account_number: '462515900201897530',
              settlement_account_ifsc: 'YESB0CMSNOC',
              is_active: true,
              is_master_settlement_account: true,
            },
            {
              settlement_account_urn: 'MOCK_SETTLEMENT_URN_2',
              name: 'Payout Settlement Account',
              settlement_account_number: '462515900201897531',
              settlement_account_ifsc: 'YESB0CMSNOC',
              is_active: true,
              is_master_settlement_account: false,
            },
          ],
        },
      };
    }

    const headers = await this.getHeaders('payments'); // Use payments module for settlement APIs
    const urn = consumerUrn || this.consumerUrn;

    this.logger.debug('=== SETTLEMENT ACCOUNT DETAILS DEBUG START ===');
    console.log(
      'URL:',
      `${this.paymentsBaseUrl}/v3/banking/settlement_account_details`,
    );
    console.log('Headers:', { ...headers, client_secret: '[REDACTED]' });
    console.log('Consumer URN:', urn);
    console.log('Page:', page, 'Limit:', limit);
    this.logger.debug('=== SETTLEMENT ACCOUNT DETAILS DEBUG END ===');

    try {
      const params = new URLSearchParams({
        consumer_urn: urn,
        page: page.toString(),
        limit: limit.toString(),
      });

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.paymentsBaseUrl}/v3/banking/settlement_account_details?${params.toString()}`,
          { headers },
        ),
      );

      this.logger.log('Settlement account details retrieved successfully');
      return response.data;
    } catch (error) {
      console.log('=== SETTLEMENT ACCOUNT DETAILS ERROR ===');
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
      console.log('=== ERROR END ===');

      this.logger.error(
        'Failed to get settlement account details:',
        error.response?.data,
      );
      throw new Error(
        `Get settlement account details failed: ${error.response?.data?.message || error.response?.statusText || error.message}`,
      );
    }
  }

  /**
   * Health check for Decentro service
   */
  async healthCheck(): Promise<{ status: string; mode: string }> {
    return {
      status: 'ok',
      mode: this.mockMode ? 'mock' : 'live',
    };
  }
}
