import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsPhoneNumber, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+919876543210',
  })
  @IsPhoneNumber('IN', { message: 'Invalid phone number format' })
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+919876543210',
  })
  @IsPhoneNumber('IN', { message: 'Invalid phone number format' })
  phone: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
  code: string;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'User information',
  })
  user: {
    id: string;
    phone: string;
    name?: string;
    avatarUrl?: string;
    isOnboardingComplete: boolean;
    hasCategories: boolean;
  };
}

export class RequestOtpResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  ok: boolean;

  @ApiProperty({
    description: 'Development OTP code (only in dev mode)',
    example: '123456',
    required: false,
  })
  devCode?: string;
}
