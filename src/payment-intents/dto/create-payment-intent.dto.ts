import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsPositive,
  Max,
} from 'class-validator';
import { Platform } from '@prisma/client';

export class CreatePaymentIntentDto {
  @ApiProperty({
    description: 'Payment amount in INR',
    example: 500,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000) // Max ₹1L per transaction
  amount: number;

  @ApiProperty({
    description: 'Virtual Payment Address',
    example: 'user@paytm',
  })
  @IsString()
  vpa: string;

  @ApiProperty({
    description: 'Payee display name',
    example: 'Zomato',
    required: false,
  })
  @IsOptional()
  @IsString()
  payeeName?: string;

  @ApiProperty({
    description: 'Entry point of payment',
    example: 'home_quick_pay',
  })
  @IsString()
  entrypoint: string;

  @ApiProperty({
    description: 'Long note for transaction',
    required: false,
  })
  @IsOptional()
  @ApiProperty({
    description: 'Long note for transaction',
    required: false,
  })
  @IsOptional()
  @IsString()
  noteLong?: string;

  @ApiProperty({
    description: 'Platform initiating payment',
    enum: Platform,
    required: false,
  })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiProperty({
    description: 'Preferred UPI app package name for app-specific deep link',
    example: 'com.phonepe.app',
    required: false,
  })
  @IsOptional()
  @IsString()
  packageName?: string;
}
