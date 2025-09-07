import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DecentroService } from './decentro.service';
import { DecentroController } from './decentro.controller';
import { DecentroWebhooksController } from './webhooks.controller';
import { BankingModule } from '../banking/banking.module';
import { RelationshipAnalyzerService } from '../intelligence/relationship-analyzer.service';
import { WebhookAuthGuard } from './webhook-auth.guard';
// import { EscrowService } from './escrow.service';

@Module({
  imports: [HttpModule, BankingModule],
  providers: [DecentroService, RelationshipAnalyzerService, WebhookAuthGuard], // EscrowService
  controllers: [DecentroController, DecentroWebhooksController],
  exports: [DecentroService], // EscrowService
})
export class DecentroModule {}
