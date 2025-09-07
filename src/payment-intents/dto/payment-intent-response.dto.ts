import { ApiProperty } from '@nestjs/swagger';

export class SuggestedTag {
  @ApiProperty({
    description: 'Category ID for suggested tag',
    example: 'cat_123',
  })
  categoryId: string;

  @ApiProperty({
    description: 'Suggested tag text',
    example: 'Food delivery',
  })
  tagText: string;

  @ApiProperty({
    description: 'Confidence score for suggestion',
    example: 0.85,
    minimum: 0,
    maximum: 1,
  })
  confidence: number;
}

export enum CapsState {
  OK = 'ok',
  NEAR = 'near',
  OVER = 'over',
}

export class CreatePaymentIntentResponseDto {
  @ApiProperty({
    description: 'Transaction reference',
    example: 'tr_abc123def456',
  })
  tr: string;

  @ApiProperty({
    description: 'UPI deep link for payment',
    example:
      'upi://pay?pa=user@paytm&pn=Zomato&am=500&tn=Food&tr=tr_abc123&cu=INR',
  })
  upiDeepLink: string;

  @ApiProperty({
    description: 'AI suggested tag for payment',
    type: SuggestedTag,
  })
  suggestedTag: SuggestedTag;

  @ApiProperty({
    description: 'Category ID for this payment',
    example: 'cat_123',
  })
  categoryId: string;

  @ApiProperty({
    description: 'Current caps state',
    enum: CapsState,
    example: CapsState.OK,
  })
  capsState: CapsState;

  @ApiProperty({
    description: 'Whether payment requires caps override',
    example: false,
  })
  requiresOverride: boolean;

  // Banking-specific fields
  @ApiProperty({
    description: 'Unique payment number',
    example: 'PAY123ABC456',
    required: false,
  })
  paymentNumber?: string;

  @ApiProperty({
    description: 'Risk score for this payment (0-1)',
    example: 0.3,
    required: false,
  })
  riskScore?: number;

  @ApiProperty({
    description: 'Whether payment requires manual review',
    example: false,
    required: false,
  })
  requiresReview?: boolean;

  // Fees removed: no consumer charges in current model
}

export class CompletePaymentIntentResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  ok: boolean;
}
