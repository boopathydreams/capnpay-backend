import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  IsIn,
  IsDecimal,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserProfileDto {
  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiProperty({
    description: 'Monthly salary',
    example: 50000,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  monthlySalary?: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'INR',
    required: false,
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    description: 'Time zone',
    example: 'Asia/Kolkata',
    required: false,
  })
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiProperty({
    description: 'Language preference',
    example: 'en',
    required: false,
  })
  @IsOptional()
  @IsIn(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu'])
  language?: string;

  @ApiProperty({
    description: 'Enable notifications',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}

export class UpdateUserSettingsDto {
  @ApiProperty({
    description: 'Theme preference',
    example: 'dark',
    required: false,
  })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  themePreference?: string;

  @ApiProperty({
    description: 'Enable biometric authentication',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  biometricEnabled?: boolean;

  @ApiProperty({
    description: 'Enable transaction alerts',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  transactionAlerts?: boolean;

  @ApiProperty({
    description: 'Enable budget alerts',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  budgetAlerts?: boolean;

  @ApiProperty({
    description: 'Enable monthly reports',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  monthlyReports?: boolean;

  @ApiProperty({
    description: 'Enable marketing emails',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @ApiProperty({
    description: 'Enable auto-tagging',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  autoTagging?: boolean;

  @ApiProperty({
    description: 'Enable spending insights',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  spendingInsights?: boolean;
}

export class UserProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  name?: string;

  @ApiProperty()
  avatarUrl?: string;

  @ApiProperty()
  isOnboardingComplete: boolean;

  @ApiProperty()
  monthlySalary?: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  timeZone?: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  notificationsEnabled: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  settings: {
    themePreference: string;
    biometricEnabled: boolean;
    transactionAlerts: boolean;
    budgetAlerts: boolean;
    monthlyReports: boolean;
    marketingEmails: boolean;
    autoTagging: boolean;
    spendingInsights: boolean;
  };

  @ApiProperty()
  categories: Array<{
    id: string;
    name: string;
    color: string;
    capAmount: number;
    softBlock: boolean;
    nearThresholdPct: number;
  }>;
}
