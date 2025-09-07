import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { DecentroModule } from '../decentro/decentro.module';
import { ReconciliationService } from './reconciliation.service';
import { BankingModule } from '../banking/banking.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    DecentroModule,
    BankingModule,
  ],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
