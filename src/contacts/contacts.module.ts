import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { RelationshipAnalyzerService } from '../intelligence/relationship-analyzer.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContactsController],
  providers: [ContactsService, RelationshipAnalyzerService],
  exports: [ContactsService],
})
export class ContactsModule {}
