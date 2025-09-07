import { Module } from '@nestjs/common';
import { PaymentIntentsController } from './payment-intents.controller';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentReceiptService } from './payment-receipt.service';
import { PaymentReceiptController } from './payment-receipt.controller';
// import { AudioProcessingService } from './audio-processing-stub.service';
import { UpiService } from '../upi/upi.service';
import { MockUpiDirectoryService } from '../upi/upi-directory.service';
import { TaggingService } from '../tagging/tagging.service';
import { CapsService } from '../caps/caps.service';
import { DecentroModule } from '../decentro/decentro.module';
import { BankingModule } from '../banking/banking.module';

@Module({
  imports: [DecentroModule, BankingModule],
  controllers: [PaymentIntentsController, PaymentReceiptController],
  providers: [
    PaymentIntentsService,
    PaymentReceiptService,
    // AudioProcessingService, // Disabled temporarily
    UpiService,
    MockUpiDirectoryService,
    TaggingService,
    CapsService,
  ],
  exports: [PaymentIntentsService, PaymentReceiptService],
})
export class PaymentIntentsModule {}
