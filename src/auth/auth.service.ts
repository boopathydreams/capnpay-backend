import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private otpStore = new Map<string, { code: string; expiresAt: Date }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Request OTP for phone number
   */
  async requestOtp(requestOtpDto: RequestOtpDto) {
    const { phone } = requestOtpDto;

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 5-minute expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    this.otpStore.set(phone, { code: otpCode, expiresAt });

    // In development, return the OTP in response for testing
    const isDev = this.configService.get('NODE_ENV') !== 'production';

    if (isDev) {
      console.log(`🔐 OTP for ${phone}: ${otpCode}`);
      return { ok: true, devCode: otpCode };
    }

    // TODO: In production, send OTP via SMS service
    console.log(`📱 OTP sent to ${phone}: ${otpCode}`);

    return { ok: true };
  }

  /**
   * Verify OTP and authenticate user
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phone, code } = verifyOtpDto;

    // Check if OTP exists and is valid
    const storedOtp = this.otpStore.get(phone);
    if (!storedOtp) {
      throw new BadRequestException('OTP not found. Please request a new OTP.');
    }

    if (new Date() > storedOtp.expiresAt) {
      this.otpStore.delete(phone);
      throw new BadRequestException(
        'OTP has expired. Please request a new OTP.',
      );
    }

    if (storedOtp.code !== code) {
      throw new UnauthorizedException('Invalid OTP code');
    }

    // OTP is valid, remove it from store
    this.otpStore.delete(phone);

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { phoneE164: phone },
      include: {
        userSettings: true,
        categories: true,
      },
    });

    if (!user) {
      // Create new user with default settings
      user = await this.prisma.user.create({
        data: {
          phoneE164: phone,
          name: null, // Will be set during onboarding
          isOnboardingComplete: false,
          userSettings: {
            create: {
              themePreference: 'system',
              biometricEnabled: false,
              transactionAlerts: true,
              budgetAlerts: true,
              monthlyReports: true,
              marketingEmails: false,
              autoTagging: true,
              spendingInsights: true,
            },
          },
        },
        include: {
          userSettings: true,
          categories: true,
        },
      });
    }

    // Generate JWT tokens
    const tokens = await this.generateTokens(user.id, phone);

    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phoneE164,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isOnboardingComplete: user.isOnboardingComplete,
        hasCategories: user.categories.length > 0,
      },
    };
  }

  /**
   * Generate JWT access and refresh tokens
   */
  private async generateTokens(userId: string, phone: string) {
    const payload = { sub: userId, phone };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: '1d', // 15 minutes
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: '7d', // 7 days
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Validate user from JWT payload
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneE164: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.validateUser(payload.sub);
      return this.generateTokens(user.id, user.phoneE164);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
