import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  RequestOtpDto,
  VerifyOtpDto,
  AuthResponseDto,
  RequestOtpResponseDto,
} from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  @ApiOperation({
    summary: 'Request OTP for phone number',
    description: 'Send OTP to the provided phone number for authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: RequestOtpResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid phone number format',
  })
  async requestOtp(@Body() requestOtpDto: RequestOtpDto) {
    return this.authService.requestOtp(requestOtpDto);
  }

  @Post('otp/verify')
  @ApiOperation({
    summary: 'Verify OTP and authenticate',
    description: 'Verify the OTP code and return authentication tokens',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication failed',
  })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify JWT token',
    description:
      'Verify if the provided JWT token is valid and return user information',
  })
  @ApiResponse({
    status: 200,
    description: 'Token is valid',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean', example: true },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            phone: { type: 'string' },
            name: { type: 'string' },
            isOnboardingComplete: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired token',
  })
  async verifyToken(@Request() req: any) {
    return {
      valid: true,
      user: req.user,
    };
  }
}
