import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

export class CompletePaymentIntentDto {
  @ApiProperty({
    description: 'Payment completion status',
    enum: PaymentStatus,
    example: PaymentStatus.SUCCESS,
  })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiProperty({
    description: 'UPI transaction reference from PSP',
    example: 'UPI1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  upiTxnRef?: string;
}
