import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class DecentroCollectionWebhookDto {
  @ApiProperty({
    description: 'Client reference id used when creating collection',
  })
  @IsString()
  reference_id: string;

  @ApiPropertyOptional({
    description: 'Decentro transaction id / collection id',
  })
  @IsOptional()
  @IsString()
  transaction_id?: string;

  @ApiPropertyOptional({ description: 'UTR/RRN or bank transaction number' })
  @IsOptional()
  @IsString()
  utr?: string;

  @ApiPropertyOptional({ description: 'Alternate bank reference number' })
  @IsOptional()
  @IsString()
  rrn?: string;

  @ApiProperty({ description: 'Status string from Decentro' })
  @IsString()
  status: string;

  @ApiPropertyOptional({ description: 'Status description or remarks' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Amount for the transaction' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Payer UPI/VPA' })
  @IsOptional()
  @IsString()
  payer_vpa?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp of event' })
  @IsOptional()
  @IsString()
  event_time?: string;

  @ApiPropertyOptional({
    description: 'Unique callback transaction id for replay protection',
  })
  @IsOptional()
  @IsString()
  callback_transaction_id?: string;
}

export class DecentroPayoutWebhookDto {
  @ApiProperty({
    description: 'Client reference id used when initiating payout',
  })
  @IsString()
  reference_id: string;

  @ApiPropertyOptional({ description: 'Decentro payout transaction id' })
  @IsOptional()
  @IsString()
  transaction_id?: string;

  @ApiProperty({ description: 'Status string from Decentro' })
  @IsString()
  status: string;

  @ApiPropertyOptional({ description: 'UTR/RRN or bank transaction number' })
  @IsOptional()
  @IsString()
  utr?: string;

  @ApiPropertyOptional({ description: 'Alternate bank reference number' })
  @IsOptional()
  @IsString()
  rrn?: string;

  @ApiPropertyOptional({ description: 'Status description or remarks' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Amount for the payout' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Recipient UPI/VPA' })
  @IsOptional()
  @IsString()
  payee_vpa?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp of event' })
  @IsOptional()
  @IsString()
  event_time?: string;

  @ApiPropertyOptional({
    description: 'Unique callback transaction id for replay protection',
  })
  @IsOptional()
  @IsString()
  callback_transaction_id?: string;
}
