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
    description: 'Category ID for suggested tag',
    example: 'cat_food_123',
  })
  categoryId: string;

  @ApiProperty({
    description: 'User caps state for this payment',
    enum: CapsState,
    example: CapsState.OK,
  })
  capsState: CapsState;

  @ApiProperty({
    description: 'Whether payment requires override confirmation',
    example: false,
  })
  requiresOverride?: boolean;
}

export class CompletePaymentIntentResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  ok: boolean;
}
