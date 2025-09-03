import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateUpiDto {
  @ApiProperty({
    description: 'UPI ID to validate',
    example: 'user@paytm',
  })
  @IsString()
  upi_id: string;
}

export class CreatePaymentCollectionDto {
  @ApiProperty({
    description: 'Unique reference ID for the transaction',
    example: 'CAPN_1693234567890_ABC123',
  })
  @IsString()
  reference_id: string;

  @ApiProperty({
    description: 'Recipient UPI ID or account',
    example: 'recipient@paytm',
  })
  @IsString()
  payee_account: string;

  @ApiProperty({
    description: 'Amount to collect in INR',
    example: 100.5,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'Purpose message for the transaction',
    example: 'Payment for food order',
  })
  @IsString()
  purpose_message: string;

  @ApiProperty({
    description: 'Generate QR code for payment',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  generate_qr?: boolean = true;

  @ApiProperty({
    description: 'Payment link expiry time in seconds',
    example: 900,
    default: 900,
  })
  @IsOptional()
  @IsNumber()
  expiry_time?: number = 900;

  @ApiProperty({
    description: 'Mobile number for SMS notification',
    example: '+919876543210',
    required: false,
  })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({
    description: 'Email for notification',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    description: 'Whether to customize QR code with logo',
    example: false,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  customized_qr_with_logo?: boolean = false;

  @ApiProperty({
    description: 'Whether to send SMS notification',
    example: false,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  send_sms?: boolean = false;

  @ApiProperty({
    description: 'Whether to send email notification',
    example: false,
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  send_email?: boolean = false;
}

export class InitiatePayoutDto {
  @ApiProperty({
    description: 'Unique reference ID for the payout',
    example: 'CAPN_PAYOUT_1693234567890_XYZ456',
  })
  @IsString()
  reference_id: string;

  @ApiProperty({
    description: 'Recipient UPI ID or account for payout',
    example: 'recipient@paytm',
  })
  @IsString()
  payee_account: string;

  @ApiProperty({
    description: 'Amount to payout in INR',
    example: 95.5,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'Purpose message for the payout',
    example: 'Food order payment transfer',
  })
  @IsString()
  purpose_message: string;

  @ApiProperty({
    description: 'Fund transfer type',
    enum: ['UPI', 'IMPS', 'NEFT'],
    example: 'UPI',
    default: 'UPI',
  })
  @IsOptional()
  @IsEnum(['UPI', 'IMPS', 'NEFT'])
  fund_transfer_type?: 'UPI' | 'IMPS' | 'NEFT' = 'UPI';

  @ApiProperty({
    description: 'Beneficiary name (required for some banks)',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  beneficiary_name?: string;
}

export class EscrowTransactionDto {
  @ApiProperty({
    description: 'Payer UPI ID',
    example: 'payer@paytm',
  })
  @IsString()
  payer_upi: string;

  @ApiProperty({
    description: 'Recipient UPI ID',
    example: 'recipient@paytm',
  })
  @IsString()
  recipient_upi: string;

  @ApiProperty({
    description: 'Transaction amount in INR',
    example: 100.0,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'Transaction note/description',
    example: 'Payment for food order #12345',
  })
  @IsString()
  note: string;

  @ApiProperty({
    description: 'User mobile number for notifications',
    example: '+919876543210',
    required: false,
  })
  @IsOptional()
  @IsString()
  mobile?: string;
}
