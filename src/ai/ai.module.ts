import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// AI Services
import { EnhancedTaggingService } from './services/enhanced-tagging.service';
import { AIBehavioralNudgeService } from './services/behavioral-nudge.service';
import { VoiceIntelligenceService } from './services/voice-intelligence.service';
import { TrustScoreService } from './services/trust-score.service';
import { AIFinancialAdvisorService } from './services/ai-financial-advisor.service';
import { MerchantIntelligenceService } from './services/merchant-intelligence.service';
import { AIIntegrationService } from './services/ai-integration.service';

// AI Controllers
import { AIController } from './controllers/ai.controller';
import { VoiceController } from './controllers/voice.controller';
import { ChatController } from './controllers/chat.controller';
import { TrustController } from './controllers/trust.controller';
import { MerchantController } from './controllers/merchant.controller';
import { AIIntegrationController } from './controllers/ai-integration.controller';

// Shared modules
import { PrismaModule } from '../prisma/prisma.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
    ConfigModule,
    PrismaModule,
    CategoriesModule,
  ],
  providers: [
    EnhancedTaggingService,
    AIBehavioralNudgeService,
    VoiceIntelligenceService,
    TrustScoreService,
    AIFinancialAdvisorService,
    MerchantIntelligenceService,
    AIIntegrationService,
  ],
  controllers: [
    AIController,
    VoiceController,
    ChatController,
    TrustController,
    MerchantController,
    AIIntegrationController,
  ],
  exports: [
    EnhancedTaggingService,
    AIBehavioralNudgeService,
    AIIntegrationService,
    VoiceIntelligenceService,
    TrustScoreService,
    AIFinancialAdvisorService,
    MerchantIntelligenceService,
  ],
})
export class AIModule {}
