import { Module } from '@nestjs/common';
import { PaymentIntentsController } from './payment-intents.controller';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentReceiptService } from './payment-receipt.service';
import { PaymentReceiptController } from './payment-receipt.controller';
import { UpiService } from '../upi/upi.service';
import { MockUpiDirectoryService } from '../upi/upi-directory.service';
import { TaggingService } from '../tagging/tagging.service';
import { CapsService } from '../caps/caps.service';
import { DecentroModule } from '../decentro/decentro.module';

@Module({
  imports: [DecentroModule],
  controllers: [PaymentIntentsController, PaymentReceiptController],
  providers: [
    PaymentIntentsService,
    PaymentReceiptService,
    UpiService,
    MockUpiDirectoryService,
    TaggingService,
    CapsService,
  ],
  exports: [PaymentIntentsService, PaymentReceiptService],
})
export class PaymentIntentsModule {}
