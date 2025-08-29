import { Module } from '@nestjs/common';
import { UpiService } from './upi.service';
import { MockUpiDirectoryService } from './upi-directory.service';
import { UpiDirectoryController } from './upi-directory.controller';

@Module({
  controllers: [UpiDirectoryController],
  providers: [UpiService, MockUpiDirectoryService],
  exports: [UpiService, MockUpiDirectoryService],
})
export class UpiModule {}
