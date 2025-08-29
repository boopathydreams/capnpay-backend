import { Module } from '@nestjs/common';
import { PaymentIntentsController } from './payment-intents.controller';
import { PaymentIntentsService } from './payment-intents.service';
import { UpiService } from '../upi/upi.service';
import { MockUpiDirectoryService } from '../upi/upi-directory.service';
import { TaggingService } from '../tagging/tagging.service';
import { CapsService } from '../caps/caps.service';

@Module({
  controllers: [PaymentIntentsController],
  providers: [
    PaymentIntentsService,
    UpiService,
    MockUpiDirectoryService,
    TaggingService,
    CapsService,
  ],
  exports: [PaymentIntentsService],
})
export class PaymentIntentsModule {}
