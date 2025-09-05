import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { PaymentIntentsModule } from './payment-intents/payment-intents.module';
import { CategoriesModule } from './categories/categories.module';
import { UpiModule } from './upi/upi.module';
import { DecentroModule } from './decentro/decentro.module';
import { AuthModule } from './auth/auth.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // requests per minute
      },
    ]),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  colorize: true,
                },
              }
            : undefined,
        redact: ['req.headers.authorization'],
      },
    }),
    PrismaModule,
    AuthModule,
    OnboardingModule,
    UsersModule,
    DashboardModule,
    PaymentIntentsModule,
    CategoriesModule,
    UpiModule,
    DecentroModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
