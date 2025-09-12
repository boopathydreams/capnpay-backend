import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsPositive,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Platform } from '@prisma/client';

export class VoiceMemoDto {
  @ApiProperty({
    description: 'S3 object key for the voice file',
    example: 'voice-memos/user123/1757588819397-w060nj.m4a',
  })
  @IsString()
  objectKey: string;

  @ApiProperty({
    description: 'Duration of voice memo in milliseconds',
    example: 5000,
  })
  @IsNumber()
  @IsPositive()
  durationMs: number;

  @ApiProperty({
    description: 'Optional voice transcript',
    required: false,
  })
  @IsOptional()
  @IsString()
  transcript?: string;

  @ApiProperty({
    description: 'Transcript confidence score (0-1)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  transcriptConfidence?: number;

  @ApiProperty({
    description: 'Language code (e.g., "en", "hi")',
    required: false,
    default: 'en',
  })
  @IsOptional()
  @IsString()
  language?: string;
}

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

  @ApiProperty({
    description: 'Voice memo data',
    required: false,
    type: VoiceMemoDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceMemoDto)
  voiceMemo?: VoiceMemoDto;
}
