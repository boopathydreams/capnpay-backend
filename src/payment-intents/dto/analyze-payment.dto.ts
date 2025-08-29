import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
} from 'class-validator';

export class AnalyzePaymentDto {
  @ApiProperty({
    description: 'Payment amount in INR',
    example: 480,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  amount: number;

  @ApiProperty({
    description: 'Virtual Payment Address',
    example: 'zomato@paytm',
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
}

export interface PaymentNudge {
  id: string;
  type: 'warning' | 'info' | 'success';
  severity: 'low' | 'medium' | 'high';
  icon: string;
  message: string;
  action?: string;
  color: string;
}

export class AnalyzePaymentResponseDto {
  @ApiProperty({
    description: 'AI suggested tag for payment',
  })
  suggestedTag: {
    categoryId: string;
    tagText: string;
    confidence: number;
    category: {
      id: string;
      name: string;
      color: string;
    };
  };

  @ApiProperty({
    description: 'Category caps state',
    enum: ['ok', 'near', 'over'],
  })
  capsState: 'ok' | 'near' | 'over';

  @ApiProperty({
    description: 'Current spending percentage of cap',
    example: 65.5,
  })
  capsPercentage: number;

  @ApiProperty({
    description: 'Projected spending after this payment',
    example: 75.2,
  })
  projectedPercentage: number;

  @ApiProperty({
    description: 'Smart AI nudges and warnings',
    type: [Object],
  })
  aiNudges: PaymentNudge[];

  @ApiProperty({
    description: 'Available UPI apps on device',
    example: ['gpay', 'phonepe', 'paytm'],
  })
  availableUpiApps: string[];

  @ApiProperty({
    description: 'Whether payment requires override confirmation',
    example: false,
  })
  requiresOverride: boolean;
}
